/**
 * Supabase server-side client for UpInbox.
 *
 * Uses @supabase/ssr for cookie-based session management in Next.js App Router.
 * This module is SERVER ONLY — do not import from client components.
 *
 * Usage:
 *   import { createServerSupabaseClient } from '@/lib/supabase-server';
 *   const supabase = await createServerSupabaseClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
if (!SUPABASE_ANON_KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');

/**
 * Standard server client — uses the authenticated user's session cookie.
 * RLS policies apply — the client can only access rows the user is authorized for.
 *
 * Use this for all API routes and Server Components that act on behalf of a user.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll can be called from Server Components where cookies are read-only.
          // The session will still be valid for this request — the client-side
          // Supabase client handles session refresh.
        }
      },
    },
  });
}

/**
 * Service role client — bypasses RLS.
 * Use ONLY for:
 *   - Cron jobs and background workers
 *   - Admin API routes protected by service role key header check
 *   - Provisioning new user accounts (before RLS would allow access)
 *
 * NEVER expose the service role key to the client. NEVER use this for
 * user-initiated requests unless the route has explicit admin auth.
 */
export function createServiceSupabaseClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY — service client unavailable');
  }

  return createServerClient<Database>(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY, {
    cookies: {
      getAll() { return []; },
      setAll() { /* no-op for service client */ },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Verify a cron/service route is called with the correct service role key.
 * Use at the top of any route that should only be callable by internal services.
 *
 * @example
 *   if (!verifyServiceAuth(request)) {
 *     return Response.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 */
export function verifyServiceAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
}

/**
 * Get the current authenticated user from a Server Component or API route.
 * Returns null if not authenticated (does NOT throw).
 *
 * Prefer this over session.user — getUser() re-validates with Supabase Auth.
 */
export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}
