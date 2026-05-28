'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Label {
  id: string;
  account_id: string;
  name: string;
  color: string;
  is_system: boolean;
  created_at: string;
}

async function fetchLabels(accountId: string): Promise<Label[]> {
  const res = await fetch(`/api/upinbox/labels?accountId=${accountId}`);
  if (!res.ok) throw new Error('Failed to load labels');
  return res.json();
}

export function useLabels(accountId: string | null) {
  return useQuery({
    queryKey: ['upinbox-labels', accountId],
    queryFn: () => fetchLabels(accountId!),
    enabled: !!accountId,
    staleTime: 60_000,
  });
}

export function useCreateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, name, color }: { accountId: string; name: string; color: string }) => {
      const res = await fetch('/api/upinbox/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, name, color }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_, { accountId }) => {
      qc.invalidateQueries({ queryKey: ['upinbox-labels', accountId] });
    },
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accountId }: { id: string; accountId: string }) => {
      const res = await fetch(`/api/upinbox/labels?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      return { accountId };
    },
    onSuccess: (_, { accountId }) => {
      qc.invalidateQueries({ queryKey: ['upinbox-labels', accountId] });
    },
  });
}

export function useApplyLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accountId,
      emailUid,
      labelId,
      apply,
    }: { accountId: string; emailUid: string; labelId: string; apply: boolean }) => {
      const res = await fetch('/api/upinbox/labels/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, emailUid, labelId, apply }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['upinbox-email-labels'] });
    },
  });
}

export function useEmailLabels(accountId: string | null, emailUid: string | null) {
  return useQuery({
    queryKey: ['upinbox-email-labels', accountId, emailUid],
    queryFn: async () => {
      const res = await fetch(`/api/upinbox/labels?accountId=${accountId}&emailUid=${emailUid}`);
      if (!res.ok) return [];
      return res.json() as Promise<Label[]>;
    },
    enabled: !!accountId && !!emailUid,
    staleTime: 30_000,
  });
}
