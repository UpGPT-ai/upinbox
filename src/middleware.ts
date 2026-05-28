/**
 * Next.js Middleware — Supabase session refresh + auth guard.
 *
 * Runs on every request. Refreshes the session cookie (prevents stale tokens)
 * and redirects unauthenticated users away from protected routes.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/api/', // API routes handle their own auth
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: request.headers } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Refresh session — this is the key side-effect (updates cookies)
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Redirect authenticated users away from /login
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/inbox', request.url));
  }

  // Redirect unauthenticated users to /login for protected routes
  if (!user && !isPublic(pathname) && pathname !== '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Root path: let the page itself handle the redirect.
  // We cannot redirect here because Supabase implicit-flow tokens arrive
  // as URL hash fragments (#access_token=...) which are never sent to the
  // server — a server-side redirect drops them and the session is lost.
  if (pathname === '/') {
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - Public asset files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
