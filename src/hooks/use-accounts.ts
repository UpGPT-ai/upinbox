/**
 * useAccounts — React Query hook for the current user's mail accounts.
 *
 * Fetches GET /api/upinbox/accounts and syncs the activeAccountId atom
 * to the first account if none is set.
 */

import { useQuery } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { activeAccountIdAtom, providerTypeAtom } from '@/atoms/mail';

export interface MailAccount {
  id: string;
  email_address: string;
  display_name: string;
  provider_type: 'jmap' | 'imap';
  is_primary: boolean;
  sync_enabled: boolean;
  last_synced_at: string | null;
  created_at: string;
}

export function useAccounts() {
  const [activeAccountId, setActiveAccountId] = useAtom(activeAccountIdAtom);
  const [, setProviderType] = useAtom(providerTypeAtom);

  return useQuery({
    queryKey: ['upinbox', 'accounts'],
    queryFn: async (): Promise<MailAccount[]> => {
      const res = await fetch('/api/upinbox/accounts');
      if (!res.ok) throw new Error(`Failed to fetch accounts: ${res.status}`);
      const { accounts } = await res.json();
      return accounts;
    },
    select(accounts) {
      // Auto-select first account if none active
      if (!activeAccountId && accounts.length > 0) {
        const primary = accounts.find((a) => a.is_primary) ?? accounts[0];
        setActiveAccountId(primary.id);
        setProviderType(primary.provider_type);
      }

      // Update provider type when active account changes
      const active = accounts.find((a) => a.id === activeAccountId);
      if (active) setProviderType(active.provider_type);

      return accounts;
    },
    staleTime: 5 * 60 * 1000, // 5 min — accounts change rarely
  });
}

/**
 * useActiveAccount — returns the currently selected account object.
 */
export function useActiveAccount() {
  const [activeAccountId] = useAtom(activeAccountIdAtom);
  const { data: accounts = [] } = useAccounts();
  return accounts.find((a) => a.id === activeAccountId) ?? null;
}
