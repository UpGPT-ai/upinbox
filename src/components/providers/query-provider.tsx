'use client';

/**
 * QueryProvider — wraps the app in TanStack React Query + Jotai providers.
 * Must be a client component (uses useState for QueryClient).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as JotaiProvider } from 'jotai';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Don't retry on 4xx errors (auth, not-found)
            retry: (failureCount, error) => {
              if (error instanceof Error && error.message.includes('40')) return false;
              return failureCount < 2;
            },
            staleTime: 30 * 1000,
            refetchOnWindowFocus: true,
          },
          mutations: {
            retry: false,
          },
        },
      })
  );

  return (
    <JotaiProvider>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </JotaiProvider>
  );
}
