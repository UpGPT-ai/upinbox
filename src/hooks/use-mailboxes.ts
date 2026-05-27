/**
 * useMailboxes — React Query hook for the mailbox list of an account.
 *
 * Fetches GET /api/upinbox/mailboxes?accountId={id}
 * Auto-selects Inbox on first load.
 */

import { useQuery } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { activeMailboxIdAtom } from '@/atoms/mail';
import type { JmapMailbox } from '@/lib/mail/types';

export function useMailboxes(accountId: string | null) {
  const [activeMailboxId, setActiveMailboxId] = useAtom(activeMailboxIdAtom);

  return useQuery({
    queryKey: ['upinbox', 'mailboxes', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<JmapMailbox[]> => {
      const res = await fetch(`/api/upinbox/mailboxes?accountId=${accountId}`);
      if (!res.ok) throw new Error(`Failed to fetch mailboxes: ${res.status}`);
      const { mailboxes } = await res.json();
      return mailboxes;
    },
    select(mailboxes) {
      // Auto-select Inbox if nothing is selected
      if (!activeMailboxId && mailboxes.length > 0) {
        const inbox =
          mailboxes.find((m) => m.role === 'inbox') ?? mailboxes[0];
        setActiveMailboxId(inbox.id);
      }
      return mailboxes;
    },
    staleTime: 2 * 60 * 1000, // 2 min
  });
}

/**
 * useInboxMailbox — returns the inbox mailbox specifically.
 * Used for unread counts and navigation highlighting.
 */
export function useInboxMailbox(accountId: string | null) {
  const { data: mailboxes = [] } = useMailboxes(accountId);
  return mailboxes.find((m) => m.role === 'inbox') ?? null;
}
