import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase-server';

/**
 * App layout — requires authentication.
 * All routes under (app)/ are protected by this layout.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return <>{children}</>;
}
