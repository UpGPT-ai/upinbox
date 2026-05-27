/**
 * useEmails — React Query hook for paginated email list.
 * useEmail  — hook for a single email's full body.
 *
 * Client components NEVER import mail providers directly.
 * All data flows through API routes.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { activeAccountIdAtom, mailboxFilterAtom } from '@/atoms/mail';
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

  return useQuery({
    queryKey: ['upinbox', 'emails', accountId, mailboxId, filter, page, limit],
    enabled: !!accountId && !!mailboxId,
    queryFn: async (): Promise<EmailsPage> => {
      const params = new URLSearchParams({
        accountId: accountId!,
        mailboxId: mailboxId!,
        filter,
        page: String(page),
        limit: String(limit),
      });
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
  };

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
        `/api/upinbox/emails/${emailId}?accountId=${accountId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error(`deleteEmail failed: ${res.status}`);
    },
    onSuccess: invalidateEmailList,
  });

  return { markRead, toggleFlagged, moveEmail, deleteEmail };
}
