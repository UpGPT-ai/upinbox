import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase-server';

/**
 * Root route — redirect authenticated users to inbox,
 * unauthenticated users to login.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (user) redirect('/inbox');
  redirect('/login');
}
