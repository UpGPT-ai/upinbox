export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isTrackerDomain } from '@/lib/tracker-domains';

const TRANSPARENT_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB
const FETCH_TIMEOUT_MS = 10_000; // 10s

function decodeImageUrl(raw: string): string | null {
  // Try base64url decode first; fall back to treating it as a raw URL
  try {
    // base64url uses - and _ instead of + and /
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    // If the decoded value looks like a URL, use it
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
      return decoded;
    }
  } catch {
    // not valid base64 — fall through
  }

  // Treat as raw URL
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }

  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const rawUrl = searchParams.get('url');

  if (!rawUrl) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  const imageUrl = decodeImageUrl(rawUrl);

  if (!imageUrl) {
    return new NextResponse('Invalid or unsupported URL scheme', { status: 400 });
  }

  // Parse the URL to extract the domain for tracker checking
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return new NextResponse('Malformed URL', { status: 400 });
  }

  // Only http and https are allowed (already enforced by decodeImageUrl, but double-check)
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return new NextResponse('Only http and https URLs are allowed', { status: 400 });
  }

  const domain = parsedUrl.hostname.toLowerCase();

  // Check tracker list
  if (isTrackerDomain(domain)) {
    return new NextResponse(TRANSPARENT_1X1_PNG, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(TRANSPARENT_1X1_PNG.byteLength),
        'Cache-Control': 'no-store',
        'X-Tracker-Blocked': 'true',
      },
    });
  }

  // Fetch the real image with timeout
  let response: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      response = await fetch(imageUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          // Minimal headers — avoid leaking user agent details
          Accept: 'image/*,*/*;q=0.8',
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return new NextResponse(isTimeout ? 'Upstream timeout' : 'Failed to fetch image', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (!response.ok) {
    return new NextResponse('Upstream returned non-OK status', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // Validate Content-Type
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    return new NextResponse('Upstream resource is not an image', {
      status: 415,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // Read body with size cap
  const reader = response.body?.getReader();
  if (!reader) {
    return new NextResponse('No response body', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        reader.cancel();
        return new NextResponse('Upstream image exceeds 5MB size limit', {
          status: 502,
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      chunks.push(value);
    }
  } catch {
    return new NextResponse('Error reading upstream response', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // Reassemble buffer
  const body = Buffer.concat(chunks.map((c) => Buffer.from(c)));

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'no-store',
      'X-Tracker-Blocked': 'false',
    },
  });
}
