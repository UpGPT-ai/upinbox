'use client';

/**
 * SignatureManager — full CRUD UI for per-account email signatures.
 *
 * Features:
 * - Account selector (synced to activeAccountIdAtom)
 * - List of signatures with default badge and use-on-reply indicator
 * - Inline edit form: name input + HTML textarea + default + use-on-reply toggles
 * - Create / update / delete via API mutations
 * - Optimistic error display; loading skeletons
 *
 * API contract (expected):
 *   GET    /api/upinbox/signatures?accountId=<id>
 *          → { signatures: Signature[] }
 *
 *   POST   /api/upinbox/signatures
 *          body: { accountId, name, body, isDefault, useOnReply }
 *          → { signature: Signature }
 *
 *   PATCH  /api/upinbox/signatures/:id
 *          body: Partial<{ name, body, isDefault, useOnReply }>
 *          → { signature: Signature }
 *
 *   DELETE /api/upinbox/signatures/:id
 *          → { ok: true }
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { activeAccountIdAtom } from '@/atoms/mail';
import { useAccounts } from '@/hooks/use-accounts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Signature {
  id: string;
  account_id: string;
  name: string;
  body: string;           // HTML
  is_default: boolean;
  use_on_reply: boolean;
  created_at: string;
  updated_at: string;
}

interface SignatureFormState {
  name: string;
  body: string;
  is_default: boolean;
  use_on_reply: boolean;
}

type EditTarget =
  | { mode: 'create' }
  | { mode: 'edit'; id: string };

const BLANK_FORM: SignatureFormState = {
  name: '',
  body: '',
  is_default: false,
  use_on_reply: false,
};

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchSignatures(accountId: string): Promise<Signature[]> {
  const res = await fetch(`/api/upinbox/signatures?accountId=${encodeURIComponent(accountId)}`);
  if (!res.ok) throw new Error(`Failed to load signatures (${res.status})`);
  const { signatures } = await res.json();
  return signatures as Signature[];
}

async function createSignature(
  accountId: string,
  form: SignatureFormState,
): Promise<Signature> {
  const res = await fetch('/api/upinbox/signatures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, ...form }),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error ?? `Create failed (${res.status})`);
  }
  const { signature } = await res.json();
  return signature as Signature;
}

async function updateSignature(
  id: string,
  patch: Partial<SignatureFormState>,
): Promise<Signature> {
  const res = await fetch(`/api/upinbox/signatures/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error ?? `Update failed (${res.status})`);
  }
  const { signature } = await res.json();
  return signature as Signature;
}

async function deleteSignature(id: string): Promise<void> {
  const res = await fetch(`/api/upinbox/signatures/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error ?? `Delete failed (${res.status})`);
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      {/* Track */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          'relative mt-0.5 flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          checked ? 'bg-primary' : 'bg-muted',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm',
            'transition-transform duration-200',
            checked ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
      <span>
        <span className="text-sm font-medium leading-5">{label}</span>
        {description && (
          <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>
        )}
      </span>
    </label>
  );
}

function SignatureFormPanel({
  initial,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  initial: SignatureFormState;
  onSave: (form: SignatureFormState) => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<SignatureFormState>(initial);

  const set = useCallback(
    <K extends keyof SignatureFormState>(key: K, value: SignatureFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const valid = form.name.trim().length > 0 && form.body.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(form);
      }}
      className="space-y-4"
    >
      {/* Name */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Signature name
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Professional, Casual, Support"
          autoFocus
          className={[
            'w-full rounded-md border border-input bg-background px-3 py-2',
            'text-sm placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          ].join(' ')}
        />
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">
          HTML body
        </label>
        <textarea
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
          placeholder={'<p>Best,<br/>Your Name</p>'}
          rows={8}
          spellCheck={false}
          className={[
            'w-full rounded-md border border-input bg-background px-3 py-2',
            'text-sm font-mono placeholder:text-muted-foreground resize-y',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          ].join(' ')}
        />
        <p className="text-xs text-muted-foreground">
          Accepts raw HTML. Use{' '}
          <code className="font-mono bg-muted px-1 rounded text-[11px]">&lt;br/&gt;</code>
          {' '}for line breaks,{' '}
          <code className="font-mono bg-muted px-1 rounded text-[11px]">&lt;a href&gt;</code>
          {' '}for links.
        </p>
      </div>

      {/* Preview */}
      {form.body.trim() && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
          <div
            className="rounded-md border bg-muted/30 px-4 py-3 text-sm overflow-auto max-h-32"
            /* Intentionally rendering HTML — signatures are user-authored */
            dangerouslySetInnerHTML={{ __html: form.body }}
          />
        </div>
      )}

      {/* Toggles */}
      <div className="space-y-3 pt-1">
        <Toggle
          checked={form.is_default}
          onChange={(v) => set('is_default', v)}
          label="Set as default"
          description="Appended automatically when composing new emails."
        />
        <Toggle
          checked={form.use_on_reply}
          onChange={(v) => set('use_on_reply', v)}
          label="Use on reply"
          description="Also appended when replying or forwarding."
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!valid || isSaving}
          className={[
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {isSaving ? 'Saving…' : 'Save signature'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className={[
            'rounded-md px-4 py-2 text-sm font-medium transition-colors',
            'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function SignatureCard({
  sig,
  isEditing,
  onEdit,
  onDelete,
  onSetDefault,
  isDeleting,
}: {
  sig: Signature;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  isDeleting: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className={[
        'rounded-xl border transition-colors',
        isEditing ? 'border-primary/50 bg-primary/5' : 'bg-card hover:border-muted-foreground/30',
      ].join(' ')}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">{sig.name}</span>
            {sig.is_default && (
              <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                Default
              </span>
            )}
            {sig.use_on_reply && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Reply
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {sig.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!sig.is_default && (
            <button
              type="button"
              onClick={onSetDefault}
              title="Set as default"
              className={[
                'rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
              ].join(' ')}
            >
              Set default
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            title="Edit signature"
            className={[
              'rounded-md p-1.5 transition-colors',
              isEditing
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            ].join(' ')}
          >
            {/* Pencil icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3.5 h-3.5"
            >
              <path d="M11.013 2.513a1.75 1.75 0 0 1 2.475 2.474L6.226 12.25a2.751 2.751 0 0 1-.892.596l-2.047.848a.75.75 0 0 1-.98-.98l.848-2.047a2.75 2.75 0 0 1 .596-.892l7.262-7.262Z" />
            </svg>
          </button>
          {confirmDelete ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setConfirmDelete(false); onDelete(); }}
                disabled={isDeleting}
                className="rounded-md px-2 py-1 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-40"
              >
                {isDeleting ? '…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="Delete signature"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              {/* Trash icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-xl border bg-card px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-4 w-14 rounded-full bg-muted" />
          </div>
          <div className="h-3 w-48 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SignatureManager() {
  const queryClient = useQueryClient();
  const { data: accounts = [], isLoading: accountsLoading } = useAccounts();
  const [activeAccountId, setActiveAccountId] = useAtom(activeAccountIdAtom);

  // Which signature is being edited / created
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const selectedAccountId = activeAccountId ?? accounts[0]?.id ?? null;

  // ── Queries ──────────────────────────────────────────────────────────────────

  const signaturesQuery = useQuery({
    queryKey: ['upinbox', 'signatures', selectedAccountId],
    queryFn: () => fetchSignatures(selectedAccountId!),
    enabled: !!selectedAccountId,
    staleTime: 60_000,
  });

  const signatures = signaturesQuery.data ?? [];

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['upinbox', 'signatures', selectedAccountId],
    });
  }, [queryClient, selectedAccountId]);

  const createMutation = useMutation({
    mutationFn: (form: SignatureFormState) =>
      createSignature(selectedAccountId!, form),
    onSuccess: () => {
      invalidate();
      setEditTarget(null);
      setMutationError(null);
    },
    onError: (err: Error) => setMutationError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SignatureFormState> }) =>
      updateSignature(id, patch),
    onSuccess: () => {
      invalidate();
      setEditTarget(null);
      setMutationError(null);
    },
    onError: (err: Error) => setMutationError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSignature(id),
    onSuccess: () => {
      invalidate();
      setMutationError(null);
    },
    onError: (err: Error) => setMutationError(err.message),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleAccountChange = (id: string) => {
    setActiveAccountId(id);
    setEditTarget(null);
    setMutationError(null);
  };

  const handleEdit = (sig: Signature) => {
    setMutationError(null);
    setEditTarget({ mode: 'edit', id: sig.id });
  };

  const handleAddNew = () => {
    setMutationError(null);
    setEditTarget({ mode: 'create' });
  };

  const handleCancel = () => {
    setEditTarget(null);
    setMutationError(null);
  };

  const handleSave = (form: SignatureFormState) => {
    if (!editTarget) return;
    if (editTarget.mode === 'create') {
      createMutation.mutate(form);
    } else {
      updateMutation.mutate({ id: editTarget.id, patch: form });
    }
  };

  const handleSetDefault = (sig: Signature) => {
    updateMutation.mutate({
      id: sig.id,
      patch: { is_default: true },
    });
  };

  // Determine initial form for the edit panel
  const editingSignature =
    editTarget?.mode === 'edit'
      ? signatures.find((s) => s.id === editTarget.id) ?? null
      : null;

  const formInitial: SignatureFormState =
    editingSignature
      ? {
          name: editingSignature.name,
          body: editingSignature.body,
          is_default: editingSignature.is_default,
          use_on_reply: editingSignature.use_on_reply,
        }
      : BLANK_FORM;

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Signatures</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create and manage email signatures per account. One signature can be
          marked as default; a separate one can be appended on replies.
        </p>
      </div>

      {/* Account selector */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Account
        </label>
        {accountsLoading ? (
          <div className="h-9 w-64 rounded-md bg-muted animate-pulse" />
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accounts connected. Add an account first.
          </p>
        ) : (
          <select
            value={selectedAccountId ?? ''}
            onChange={(e) => handleAccountChange(e.target.value)}
            className={[
              'rounded-md border border-input bg-background px-3 py-2',
              'text-sm focus:outline-none focus:ring-1 focus:ring-ring',
              'w-full max-w-xs',
            ].join(' ')}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name
                  ? `${a.display_name} (${a.email_address})`
                  : a.email_address}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Signature list */}
      {selectedAccountId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Signatures
              {signaturesQuery.isSuccess && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  ({signatures.length})
                </span>
              )}
            </h3>
            <button
              type="button"
              onClick={handleAddNew}
              disabled={editTarget?.mode === 'create'}
              className={[
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              {/* Plus icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
              </svg>
              Add signature
            </button>
          </div>

          {/* Loading */}
          {signaturesQuery.isLoading && <LoadingSkeleton />}

          {/* Error loading */}
          {signaturesQuery.isError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Failed to load signatures.{' '}
              <button
                type="button"
                onClick={() => signaturesQuery.refetch()}
                className="underline underline-offset-2 hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty state */}
          {signaturesQuery.isSuccess && signatures.length === 0 && !editTarget && (
            <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-8 text-center">
              <p className="text-sm text-muted-foreground">No signatures yet for this account.</p>
              <button
                type="button"
                onClick={handleAddNew}
                className="mt-3 text-sm font-medium text-primary hover:underline"
              >
                Create your first signature
              </button>
            </div>
          )}

          {/* Create form (shown above the list) */}
          {editTarget?.mode === 'create' && (
            <div className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-4 space-y-4">
              <p className="text-sm font-semibold">New signature</p>
              <SignatureFormPanel
                initial={BLANK_FORM}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={isSaving}
                error={mutationError}
              />
            </div>
          )}

          {/* Signature cards */}
          {signaturesQuery.isSuccess && (
            <div className="space-y-2">
              {signatures.map((sig) => (
                <div key={sig.id} className="space-y-0">
                  <SignatureCard
                    sig={sig}
                    isEditing={editTarget?.mode === 'edit' && editTarget.id === sig.id}
                    onEdit={() =>
                      editTarget?.mode === 'edit' && editTarget.id === sig.id
                        ? handleCancel()
                        : handleEdit(sig)
                    }
                    onDelete={() => deleteMutation.mutate(sig.id)}
                    onSetDefault={() => handleSetDefault(sig)}
                    isDeleting={deleteMutation.isPending && deleteMutation.variables === sig.id}
                  />

                  {/* Inline edit form */}
                  {editTarget?.mode === 'edit' && editTarget.id === sig.id && (
                    <div className="rounded-b-xl border-x border-b border-primary/40 bg-primary/5 px-4 py-4 -mt-px">
                      <SignatureFormPanel
                        key={sig.id}
                        initial={formInitial}
                        onSave={handleSave}
                        onCancel={handleCancel}
                        isSaving={isSaving}
                        error={mutationError}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Mutation error (delete/set-default) */}
          {mutationError && !editTarget && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {mutationError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
