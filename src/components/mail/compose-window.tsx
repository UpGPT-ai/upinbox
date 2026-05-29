'use client';

/**
 * ComposeWindow — Gmail-style floating compose panel.
 *
 * Features:
 * - Rich text editor (Tiptap) with full formatting toolbar
 * - To / Cc / Bcc / Subject fields
 * - File attachments (shown as chips)
 * - Send with 5-second undo countdown
 * - Discard with confirmation
 * - Undo/Redo via editor history
 * - Minimize / expand / close
 * - AI draft generation via DraftGeneratorPanel
 * - Auto-append default signature on open
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { composeDraftAtom, activeAccountIdAtom } from '@/atoms/mail';
import { useSendEmail } from '@/hooks/use-emails';
import { RichEditor, htmlToPlainText } from './rich-editor';
import { SendLaterPicker } from '@/components/mail/send-later-picker';
import { DraftGeneratorPanel } from '@/components/ai/draft-generator-panel';

const UNDO_SECONDS = 5;

type WindowState = 'open' | 'minimized' | 'fullscreen';

interface Attachment {
  name: string;
  size: number;
  type: string;
  data: string; // base64 data URL
}

export function ComposeWindow() {
  const [draft, setDraft] = useAtom(composeDraftAtom);
  const accountId = useAtomValue(activeAccountIdAtom);
  const send = useSendEmail();

  const [windowState, setWindowState] = useState<WindowState>('open');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [showSendLater, setShowSendLater] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sendState, setSendState] = useState<'idle' | 'countdown' | 'sending' | 'sent' | 'error'>('idle');
  const [countdown, setCountdown] = useState(UNDO_SECONDS);
  const [errorMsg, setErrorMsg] = useState('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showDraftAi, setShowDraftAi] = useState(false);
  const [signatureInserted, setSignatureInserted] = useState(false);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOpen = draft.mode !== 'closed';

  const close = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (sendTimeoutRef.current) clearTimeout(sendTimeoutRef.current);
    setDraft({ mode: 'closed', to: [], cc: [], bcc: [], subject: '', body: '' });
    setSendState('idle');
    setAttachments([]);
    setShowCc(false);
    setShowBcc(false);
    setShowDiscardConfirm(false);
    setShowDraftAi(false);
    setSignatureInserted(false);
  }, [setDraft]);

  useEffect(() => {
    setSendState('idle');
    setCountdown(UNDO_SECONDS);
    // Reset signature flag whenever a new compose session starts
    setSignatureInserted(false);
  }, [draft.mode]);

  // Auto-append default signature when compose window opens (once per session)
  useEffect(() => {
    if (!isOpen || signatureInserted || !accountId) return;

    const fetchAndAppendSignature = async () => {
      try {
        const res = await fetch(`/api/upinbox/signatures/default?accountId=${accountId}`);
        if (!res.ok) return;
        const data = await res.json();
        const sigHtml: string | undefined = data?.html ?? data?.body ?? data?.signature;
        if (!sigHtml) return;
        setDraft((prev) => ({
          ...prev,
          body: prev.body
            ? `${prev.body}<br><br>${sigHtml}`
            : `<br><br>${sigHtml}`,
        }));
      } catch {
        // Signature fetch is best-effort; silently ignore errors
      } finally {
        setSignatureInserted(true);
      }
    };

    fetchAndAppendSignature();
  }, [isOpen, signatureInserted, accountId, setDraft]);

  if (!isOpen) return null;

  const updateField = (field: keyof typeof draft, value: string | string[]) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const parseAddresses = (raw: string): string[] =>
    raw.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@'));

  const modeLabelMap: Record<string, string> = {
    new: 'New message',
    reply: 'Reply',
    'reply-all': 'Reply all',
    forward: 'Forward',
    closed: 'Compose',
  };
  const modeLabel = modeLabelMap[draft.mode] ?? 'Compose';

  // ── Attachments ────────────────────────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      setAttachments((prev) => [...prev, { name: file.name, size: file.size, type: file.type, data }]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const formatBytes = (n: number) => n < 1024 * 1024
    ? `${(n / 1024).toFixed(0)} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;

  // ── Send logic ─────────────────────────────────────────────────────────────

  const executeSend = async () => {
    if (!accountId) return;
    setSendState('sending');
    try {
      await send.mutateAsync({
        accountId,
        to: draft.to,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject,
        body: draft.body,
        isHtml: true,
        inReplyTo: draft.inReplyToId,
      });
      setSendState('sent');
      setTimeout(close, 1000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Send failed');
      setSendState('error');
    }
  };

  const handleSend = () => {
    if (!draft.to.length) return;
    setSendState('countdown');
    setCountdown(UNDO_SECONDS);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(countdownRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
    sendTimeoutRef.current = setTimeout(() => {
      clearInterval(countdownRef.current!);
      executeSend();
    }, UNDO_SECONDS * 1000);
  };

  const handleUndo = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (sendTimeoutRef.current) clearTimeout(sendTimeoutRef.current);
    setSendState('idle');
    setCountdown(UNDO_SECONDS);
  };

  const handleScheduleSend = async (sendAt: Date) => {
    setShowSendLater(false);
    await fetch('/api/upinbox/send-later', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: draft.identityEmail ? accountId : accountId,
        sendAt: sendAt.toISOString(),
        to: draft.to,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject,
        body: draft.body,
        isHtml: true,
      }),
    });
    setDraft({ mode: 'closed', to: [], cc: [], bcc: [], subject: '', body: '' });
  };

  const handleDiscard = () => {
    const hasContent = draft.body.replace(/<[^>]+>/g, '').trim() || draft.to.length || draft.subject;
    if (hasContent) { setShowDiscardConfirm(true); } else { close(); }
  };

  // ── AI draft accept ────────────────────────────────────────────────────────

  const handleDraftAccept = (generatedHtml: string) => {
    updateField('body', generatedHtml);
    setShowDraftAi(false);
  };

  // ── Size classes ───────────────────────────────────────────────────────────

  const sizeClass = windowState === 'fullscreen'
    ? 'inset-4 rounded-xl'
    : windowState === 'minimized'
    ? 'bottom-0 right-6 w-72 h-10 rounded-t-lg'
    : 'bottom-0 right-6 w-[560px] h-[560px] rounded-t-lg';

  return (
    <>
      <div className={`fixed ${sizeClass} z-50 flex flex-col shadow-2xl border border-gray-300 overflow-hidden transition-all duration-150`}>
        {/* Header */}
        <div
          className="bg-gray-800 text-white flex items-center px-3 py-2 flex-shrink-0 cursor-pointer select-none"
          onClick={() => windowState === 'minimized' && setWindowState('open')}
        >
          <span className="text-sm font-medium flex-1 truncate">{modeLabel}</span>
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setWindowState((s) => s === 'minimized' ? 'open' : 'minimized')}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 text-xs" title="Minimize">
              {windowState === 'minimized' ? '▲' : '▼'}
            </button>
            <button onClick={() => setWindowState((s) => s === 'fullscreen' ? 'open' : 'fullscreen')}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 text-xs" title="Fullscreen">
              {windowState === 'fullscreen' ? '⊡' : '⊞'}
            </button>
            <button onClick={handleDiscard}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 text-xs" title="Close">
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        {windowState !== 'minimized' && (
          <div className="flex flex-col flex-1 bg-white overflow-hidden">
            {/* To */}
            <div className="flex items-center border-b px-3 py-1.5 gap-2">
              <span className="text-xs text-gray-500 w-10 flex-shrink-0">To</span>
              <input type="text" value={draft.to.join(', ')}
                onChange={(e) => updateField('to', parseAddresses(e.target.value))}
                onBlur={(e) => updateField('to', parseAddresses(e.target.value))}
                placeholder="Recipients" autoFocus={draft.mode === 'new'}
                className="flex-1 text-sm outline-none text-gray-800 placeholder:text-gray-400" />
              <div className="flex gap-2 text-xs text-gray-400">
                {!showCc && <button onClick={() => setShowCc(true)} className="hover:text-gray-600">Cc</button>}
                {!showBcc && <button onClick={() => setShowBcc(true)} className="hover:text-gray-600">Bcc</button>}
              </div>
            </div>

            {/* Cc */}
            {showCc && (
              <div className="flex items-center border-b px-3 py-1.5 gap-2">
                <span className="text-xs text-gray-500 w-10 flex-shrink-0">Cc</span>
                <input type="text" value={draft.cc.join(', ')}
                  onChange={(e) => updateField('cc', parseAddresses(e.target.value))}
                  onBlur={(e) => updateField('cc', parseAddresses(e.target.value))}
                  placeholder="Carbon copy" autoFocus
                  className="flex-1 text-sm outline-none text-gray-800 placeholder:text-gray-400" />
              </div>
            )}

            {/* Bcc */}
            {showBcc && (
              <div className="flex items-center border-b px-3 py-1.5 gap-2">
                <span className="text-xs text-gray-500 w-10 flex-shrink-0">Bcc</span>
                <input type="text" value={draft.bcc.join(', ')}
                  onChange={(e) => updateField('bcc', parseAddresses(e.target.value))}
                  onBlur={(e) => updateField('bcc', parseAddresses(e.target.value))}
                  placeholder="Blind carbon copy" autoFocus
                  className="flex-1 text-sm outline-none text-gray-800 placeholder:text-gray-400" />
              </div>
            )}

            {/* Subject */}
            <div className="flex items-center border-b px-3 py-1.5 gap-2">
              <span className="text-xs text-gray-500 w-10 flex-shrink-0">Subject</span>
              <input type="text" value={draft.subject}
                onChange={(e) => updateField('subject', e.target.value)}
                placeholder="Subject"
                className="flex-1 text-sm outline-none text-gray-800 placeholder:text-gray-400 font-medium" />
            </div>

            {/* Rich editor */}
            <RichEditor
              value={draft.body}
              onChange={(html) => updateField('body', html)}
              placeholder="Write your message…"
              autoFocus={draft.mode !== 'new'}
              className="flex-1 min-h-0 overflow-hidden"
            />

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3 py-2 border-t bg-gray-50">
                {attachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-1 bg-white border rounded-full px-2.5 py-1 text-xs text-gray-700 shadow-sm">
                    <span>📎</span>
                    <span className="max-w-[120px] truncate">{att.name}</span>
                    <span className="text-gray-400">({formatBytes(att.size)})</span>
                    <button onClick={() => removeAttachment(i)} className="ml-0.5 text-gray-400 hover:text-red-500">✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-2 px-3 py-2 border-t bg-gray-50 flex-shrink-0">
              {sendState === 'idle' && (
                <div className="flex items-center gap-1">
                  <button onClick={handleSend} disabled={!draft.to.length || !accountId}
                    className="px-5 py-1.5 text-sm font-semibold rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    Send
                  </button>
                  {/* AI draft generator trigger */}
                  <button
                    type="button"
                    onClick={() => setShowDraftAi(true)}
                    title="Generate AI draft"
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 hover:text-purple-600 transition-colors text-base"
                  >
                    ✨
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowSendLater(v => !v)}
                      title="Schedule send"
                      className="p-2 rounded hover:bg-muted transition-colors text-muted-foreground"
                    >
                      🕐
                    </button>
                    {showSendLater && (
                      <SendLaterPicker
                        onSelect={handleScheduleSend}
                        onClose={() => setShowSendLater(false)}
                      />
                    )}
                  </div>
                </div>
              )}
              {sendState === 'countdown' && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">Sending in {countdown}s…</span>
                  <button onClick={handleUndo} className="text-sm font-semibold text-blue-600 hover:underline">Undo</button>
                </div>
              )}
              {sendState === 'sending' && (
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block" />
                  Sending…
                </span>
              )}
              {sendState === 'sent' && <span className="text-sm text-green-600 font-medium">✓ Sent</span>}
              {sendState === 'error' && (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm text-red-600 truncate">⚠ {errorMsg}</span>
                  <button onClick={() => setSendState('idle')} className="text-xs text-gray-500 hover:underline flex-shrink-0">Retry</button>
                </div>
              )}

              <div className="flex-1" />

              {/* Formatting controls row */}
              {(sendState === 'idle' || sendState === 'error') && (
                <div className="flex items-center gap-1">
                  {/* Attach file */}
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors text-base"
                    title="Attach file">
                    📎
                  </button>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

                  {/* Discard */}
                  <button type="button" onClick={handleDiscard}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
                    title="Discard draft">
                    🗑
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Discard confirmation */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
            <h3 className="font-semibold text-gray-900">Discard draft?</h3>
            <p className="text-sm text-gray-600">Your draft will be permanently deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={close}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Draft Generator overlay */}
      {showDraftAi && (
        <DraftGeneratorPanel
          accountId={accountId ?? ''}
          draft={draft}
          onAccept={handleDraftAccept}
          onClose={() => setShowDraftAi(false)}
        />
      )}
    </>
  );
}
