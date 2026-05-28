'use client';

/**
 * ComposeWindow — Gmail-style floating compose panel (bottom-right).
 *
 * Controlled by composeDraftAtom. Modes: new | reply | reply-all | forward.
 * Sends via POST /api/upinbox/emails/send.
 * Shows a 5-second undo window after clicking Send.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { composeDraftAtom, activeAccountIdAtom } from '@/atoms/mail';
import { useSendEmail } from '@/hooks/use-emails';

const UNDO_SECONDS = 5;

type WindowState = 'open' | 'minimized';

export function ComposeWindow() {
  const [draft, setDraft] = useAtom(composeDraftAtom);
  const accountId = useAtomValue(activeAccountIdAtom);
  const send = useSendEmail();

  const [windowState, setWindowState] = useState<WindowState>('open');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [sendState, setSendState] = useState<'idle' | 'countdown' | 'sending' | 'sent' | 'error'>('idle');
  const [countdown, setCountdown] = useState(UNDO_SECONDS);
  const [errorMsg, setErrorMsg] = useState('');
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOpen = draft.mode !== 'closed';

  const close = useCallback(() => {
    // Cancel any pending send
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (sendTimeoutRef.current) clearTimeout(sendTimeoutRef.current);
    setDraft({ mode: 'closed', to: [], cc: [], bcc: [], subject: '', body: '' });
    setSendState('idle');
    setShowCc(false);
    setShowBcc(false);
  }, [setDraft]);

  // Reset undo state when draft changes
  useEffect(() => {
    setSendState('idle');
    setCountdown(UNDO_SECONDS);
  }, [draft.mode]);

  if (!isOpen) return null;

  const updateField = (field: keyof typeof draft, value: string | string[]) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const parseAddresses = (raw: string): string[] =>
    raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);

  const modeLabelMap: Record<string, string> = {
    new: 'New message',
    reply: 'Reply',
    'reply-all': 'Reply all',
    forward: 'Forward',
    closed: 'Compose',
  };
  const modeLabel = modeLabelMap[draft.mode] ?? 'Compose';

  // ── Undo-send logic ──

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
        inReplyTo: draft.inReplyToId,
      });
      setSendState('sent');
      setTimeout(close, 800);
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
        if (c <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
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

  // ── Render ──

  const headerBg = 'bg-gray-800 text-white';

  return (
    <div
      className={`
        fixed bottom-0 right-6 z-50 flex flex-col shadow-2xl rounded-t-lg overflow-hidden border border-gray-300
        transition-all duration-200
        ${windowState === 'minimized' ? 'h-10 w-72' : 'h-[520px] w-[520px]'}
      `}
      style={{ maxHeight: 'calc(100vh - 80px)' }}
    >
      {/* Header */}
      <div
        className={`${headerBg} flex items-center px-3 py-2 flex-shrink-0 cursor-pointer select-none`}
        onClick={() => setWindowState((s) => s === 'minimized' ? 'open' : 'minimized')}
      >
        <span className="text-sm font-medium flex-1 truncate">{modeLabel}</span>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setWindowState((s) => s === 'minimized' ? 'open' : 'minimized')}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 text-xs"
            title={windowState === 'minimized' ? 'Expand' : 'Minimize'}
          >
            {windowState === 'minimized' ? '▲' : '▼'}
          </button>
          <button
            onClick={close}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 text-xs"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Body — hidden when minimized */}
      {windowState === 'open' && (
        <div className="flex flex-col flex-1 bg-white overflow-hidden">
          {/* To field */}
          <div className="flex items-center border-b px-3 py-1.5 gap-2">
            <span className="text-xs text-gray-500 w-10 flex-shrink-0">To</span>
            <input
              type="text"
              value={draft.to.join(', ')}
              onChange={(e) => updateField('to', parseAddresses(e.target.value))}
              onBlur={(e) => updateField('to', parseAddresses(e.target.value))}
              placeholder="Recipients"
              className="flex-1 text-sm outline-none text-gray-800 placeholder:text-gray-400"
              autoFocus={draft.mode === 'new'}
            />
            <div className="flex gap-2 text-xs text-gray-500">
              {!showCc && (
                <button onClick={() => setShowCc(true)} className="hover:text-gray-700">Cc</button>
              )}
              {!showBcc && (
                <button onClick={() => setShowBcc(true)} className="hover:text-gray-700">Bcc</button>
              )}
            </div>
          </div>

          {/* Cc field */}
          {showCc && (
            <div className="flex items-center border-b px-3 py-1.5 gap-2">
              <span className="text-xs text-gray-500 w-10 flex-shrink-0">Cc</span>
              <input
                type="text"
                value={draft.cc.join(', ')}
                onChange={(e) => updateField('cc', parseAddresses(e.target.value))}
                onBlur={(e) => updateField('cc', parseAddresses(e.target.value))}
                placeholder="Carbon copy"
                className="flex-1 text-sm outline-none text-gray-800 placeholder:text-gray-400"
              />
            </div>
          )}

          {/* Bcc field */}
          {showBcc && (
            <div className="flex items-center border-b px-3 py-1.5 gap-2">
              <span className="text-xs text-gray-500 w-10 flex-shrink-0">Bcc</span>
              <input
                type="text"
                value={draft.bcc.join(', ')}
                onChange={(e) => updateField('bcc', parseAddresses(e.target.value))}
                onBlur={(e) => updateField('bcc', parseAddresses(e.target.value))}
                placeholder="Blind carbon copy"
                className="flex-1 text-sm outline-none text-gray-800 placeholder:text-gray-400"
              />
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center border-b px-3 py-1.5 gap-2">
            <span className="text-xs text-gray-500 w-10 flex-shrink-0">Subject</span>
            <input
              type="text"
              value={draft.subject}
              onChange={(e) => updateField('subject', e.target.value)}
              placeholder="Subject"
              className="flex-1 text-sm outline-none text-gray-800 placeholder:text-gray-400 font-medium"
            />
          </div>

          {/* Body */}
          <textarea
            value={draft.body}
            onChange={(e) => updateField('body', e.target.value)}
            placeholder="Write your message..."
            className="flex-1 resize-none text-sm p-3 outline-none text-gray-800 placeholder:text-gray-400 overflow-y-auto"
            autoFocus={draft.mode !== 'new'}
          />

          {/* Footer */}
          <div className="flex items-center gap-2 px-3 py-2 border-t bg-gray-50 flex-shrink-0">
            {sendState === 'idle' && (
              <button
                onClick={handleSend}
                disabled={!draft.to.length || !accountId}
                className="
                  px-5 py-1.5 text-sm font-semibold rounded-full
                  bg-blue-600 text-white hover:bg-blue-700
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition-colors
                "
              >
                Send
              </button>
            )}

            {sendState === 'countdown' && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">Sending in {countdown}s…</span>
                <button
                  onClick={handleUndo}
                  className="text-sm font-semibold text-blue-600 hover:underline"
                >
                  Undo
                </button>
              </div>
            )}

            {sendState === 'sending' && (
              <span className="text-sm text-gray-500 flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block" />
                Sending…
              </span>
            )}

            {sendState === 'sent' && (
              <span className="text-sm text-green-600 font-medium">✓ Sent</span>
            )}

            {sendState === 'error' && (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-sm text-red-600 truncate">⚠ {errorMsg}</span>
                <button
                  onClick={() => setSendState('idle')}
                  className="text-xs text-gray-500 hover:underline flex-shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="flex-1" />

            {/* Discard */}
            {(sendState === 'idle' || sendState === 'error') && (
              <button
                onClick={close}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
                title="Discard"
              >
                🗑
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
