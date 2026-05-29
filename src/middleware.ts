/**
 * Next.js Middleware — Supabase session refresh + auth guard + CORS for mobile.
 *
 * Runs on every request. Refreshes the session cookie (prevents stale tokens)
 * and redirects unauthenticated users away from protected routes.
 *
 * Also applies permissive CORS headers to /api/upinbox/* so the UpLink mobile
 * app (and other first-party clients) can connect to self-hosted UpInbox
 * instances running on the user's own domain.
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

/**
 * Apply CORS headers to a response for /api/upinbox/* paths.
 *
 * Users self-host UpInbox on their own domains, and the UpLink mobile app
 * connects from arbitrary origins (custom schemes, localhost during dev,
 * production app shells). Echo the request Origin when present, otherwise
 * fall back to a permissive wildcard. Authentication is handled by the API
 * routes themselves (bearer tokens / session cookies), so CORS is purely a
 * browser-compat concern here.
 */
function applyCorsHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const origin = request.headers.get('origin') ?? '*';
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.headers.set('Access-Control-Max-Age', '86400');
  response.headers.set('Vary', 'Origin');
  return response;
}

function isUpinboxApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/upinbox/');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CORS preflight for /api/upinbox/* — respond immediately with 204.
  if (request.method === 'OPTIONS' && isUpinboxApiPath(pathname)) {
    const preflight = new NextResponse(null, { status: 204 });
    return applyCorsHeaders(preflight, request);
  }

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

  // Apply CORS headers to /api/upinbox/* responses so the UpLink mobile app
  // (and other cross-origin clients) can read them.
  if (isUpinboxApiPath(pathname)) {
    return applyCorsHeaders(response, request);
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
