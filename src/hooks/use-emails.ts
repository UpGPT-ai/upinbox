/**
 * useEmails — React Query hook for paginated email list.
 * useEmail  — hook for a single email's full body.
 *
 * Client components NEVER import mail providers directly.
 * All data flows through API routes.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAtom, useAtomValue } from 'jotai';
import {
  activeAccountIdAtom,
  mailboxFilterAtom,
  searchFiltersAtom,
  sortDirAtom,
} from '@/atoms/mail';
import type { JmapEmail } from '@/lib/mail/types';

export interface EmailsPage {
  emails: JmapEmail[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

// ─── Email list ───────────────────────────────────────────────────────────────

export function useEmails(
  mailboxId: string | null,
  page = 0,
  limit = 50
) {
  const [accountId] = useAtom(activeAccountIdAtom);
  const [filter] = useAtom(mailboxFilterAtom);
  const search = useAtomValue(searchFiltersAtom);
  const sortDir = useAtomValue(sortDirAtom);

  return useQuery({
    queryKey: ['upinbox', 'emails', accountId, mailboxId, filter, search, sortDir, page, limit],
    enabled: !!accountId && !!mailboxId,
    queryFn: async (): Promise<EmailsPage> => {
      const params = new URLSearchParams({
        accountId: accountId!,
        mailboxId: mailboxId!,
        filter,
        sortDir,
        page: String(page),
        limit: String(limit),
      });
      if (search.query) params.set('search', search.query);
      if (search.from) params.set('from', search.from);
      if (search.subject) params.set('subject', search.subject);
      if (search.after) params.set('after', search.after);
      if (search.before) params.set('before', search.before);
      if (search.hasAttachment) params.set('hasAttachment', 'true');
      const res = await fetch(`/api/upinbox/emails?${params}`);
      if (!res.ok) throw new Error(`Failed to fetch emails: ${res.status}`);
      return res.json();
    },
    staleTime: 30 * 1000, // 30s — emails change frequently
    placeholderData: (prev) => prev, // keep previous page visible while loading
  });
}

// ─── Single email (full body) ─────────────────────────────────────────────────

export function useEmail(emailId: string | null) {
  const [accountId] = useAtom(activeAccountIdAtom);

  return useQuery({
    queryKey: ['upinbox', 'email', accountId, emailId],
    enabled: !!accountId && !!emailId,
    queryFn: async (): Promise<JmapEmail> => {
      const params = new URLSearchParams({ accountId: accountId! });
      const res = await fetch(`/api/upinbox/emails/${emailId}?${params}`);
      if (!res.ok) throw new Error(`Failed to fetch email: ${res.status}`);
      const { email } = await res.json();
      return email;
    },
    staleTime: 5 * 60 * 1000, // 5 min — email bodies don't change
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useEmailMutations() {
  const [accountId] = useAtom(activeAccountIdAtom);
  const queryClient = useQueryClient();

  const invalidateEmailList = () => {
    queryClient.invalidateQueries({ queryKey: ['upinbox', 'emails'] });
    queryClient.invalidateQueries({ queryKey: ['upinbox-unified'] });
  };

  /** Bulk delete (trash) multiple emails in parallel */
  const bulkDelete = useMutation({
    mutationFn: async (emailIds: string[]) => {
      await Promise.all(
        emailIds.map((id) =>
          fetch(`/api/upinbox/emails/${encodeURIComponent(id)}?accountId=${accountId}`, {
            method: 'DELETE',
          })
        )
      );
    },
    onSuccess: invalidateEmailList,
  });

  /** Bulk mark read/unread */
  const bulkMarkRead = useMutation({
    mutationFn: async ({ emailIds, read }: { emailIds: string[]; read: boolean }) => {
      await Promise.all(
        emailIds.map((id) =>
          fetch(`/api/upinbox/emails/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId, keywords: { '$seen': read } }),
          })
        )
      );
    },
    onSuccess: invalidateEmailList,
  });

  /** Bulk flag/unflag */
  const bulkFlag = useMutation({
    mutationFn: async ({ emailIds, flagged }: { emailIds: string[]; flagged: boolean }) => {
      await Promise.all(
        emailIds.map((id) =>
          fetch(`/api/upinbox/emails/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId, keywords: { '$flagged': flagged } }),
          })
        )
      );
    },
    onSuccess: invalidateEmailList,
  });

  /** Move a single email to the Archive mailbox */
  const archiveEmail = useMutation({
    mutationFn: async ({ emailId, archiveMailboxId }: { emailId: string; archiveMailboxId: string }) => {
      const res = await fetch(`/api/upinbox/emails/${emailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          keywords: {},
          mailboxId: archiveMailboxId,
        }),
      });
      if (!res.ok) throw new Error(`archiveEmail failed: ${res.status}`);
    },
    onSuccess: invalidateEmailList,
  });

  /** Snooze a single email — re-surfaces it at the given time */
  const snoozeEmail = useMutation({
    mutationFn: async ({ emailId, unsnoozeAt }: { emailId: string; unsnoozeAt: Date }) => {
      const res = await fetch(`/api/upinbox/emails/${emailId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          unsnoozeAt: unsnoozeAt.toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`snoozeEmail failed: ${res.status}`);
    },
    onSuccess: () => {
      invalidateEmailList();
      queryClient.invalidateQueries({ queryKey: ['upinbox', 'snoozes'] });
    },
  });

  /** Remove snooze from a single email */
  const unsnoozeEmail = useMutation({
    mutationFn: async (emailId: string) => {
      const res = await fetch(
        `/api/upinbox/emails/${emailId}/snooze?accountId=${accountId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error(`unsnoozeEmail failed: ${res.status}`);
    },
    onSuccess: () => {
      invalidateEmailList();
      queryClient.invalidateQueries({ queryKey: ['upinbox', 'snoozes'] });
    },
  });

  /** Mark a single email read or unread */
  const markRead = useMutation({
    mutationFn: async ({ emailId, read }: { emailId: string; read: boolean }) => {
      const res = await fetch(`/api/upinbox/emails/${emailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          keywords: { '$seen': read },
        }),
      });
      if (!res.ok) throw new Error(`markRead failed: ${res.status}`);
    },
    onSuccess: invalidateEmailList,
  });

  /** Toggle flagged/starred state */
  const toggleFlagged = useMutation({
    mutationFn: async ({ emailId, flagged }: { emailId: string; flagged: boolean }) => {
      const res = await fetch(`/api/upinbox/emails/${emailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          keywords: { '$flagged': flagged },
        }),
      });
      if (!res.ok) throw new Error(`toggleFlagged failed: ${res.status}`);
    },
    onSuccess: invalidateEmailList,
  });

  /** Move email to a different mailbox */
  const moveEmail = useMutation({
    mutationFn: async ({ emailId, toMailboxId }: { emailId: string; toMailboxId: string }) => {
      const res = await fetch(`/api/upinbox/emails/${emailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          keywords: {},
          mailboxId: toMailboxId,
        }),
      });
      if (!res.ok) throw new Error(`moveEmail failed: ${res.status}`);
    },
    onSuccess: invalidateEmailList,
  });

  /** Delete (trash) an email */
  const deleteEmail = useMutation({
    mutationFn: async (emailId: string) => {
      const res = await fetch(
        `/api/upinbox/emails/${encodeURIComponent(emailId)}?accountId=${accountId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `deleteEmail failed: ${res.status}`);
      }
    },
    onSuccess: invalidateEmailList,
  });

  return {
    markRead,
    toggleFlagged,
    moveEmail,
    deleteEmail,
    bulkDelete,
    bulkMarkRead,
    bulkFlag,
    archiveEmail,
    snoozeEmail,
    unsnoozeEmail,
  };
}

// ─── Send email ───────────────────────────────────────────────────────────────

export interface SendEmailOpts {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  inReplyTo?: string;
  references?: string[];
}

export function useSendEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (opts: SendEmailOpts) => {
      const res = await fetch('/api/upinbox/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? err.error ?? `Send failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // Invalidate sent folder so it refreshes
      queryClient.invalidateQueries({ queryKey: ['upinbox', 'emails'] });
    },
  });
}

// ─── Snoozed emails list ──────────────────────────────────────────────────────

export function useSnoozedEmails(accountId: string | null) {
  return useQuery({
    queryKey: ['upinbox', 'snoozes', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<{ id: string; message_id: string; unsnooze_at: string }[]> => {
      // GET /api/upinbox/snoozes?accountId=... — route to be added
      const res = await fetch(`/api/upinbox/snoozes?accountId=${accountId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.snoozes ?? [];
    },
    staleTime: 60 * 1000,
  });
}
