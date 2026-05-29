/**
 * Google Calendar sync helpers.
 * Uses the Google Calendar REST API directly (no googleapis SDK dependency).
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.
 * Redirect URI must be registered in Google Cloud Console:
 *   https://your-domain/api/upinbox/calendar/google/callback
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
].join(' ');

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
}

// ─── OAuth URL ────────────────────────────────────────────────────────────────

export function getGoogleOAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = getRedirectUri();
  if (!clientId || clientId.startsWith('placeholder')) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.APP_URL
    ?? 'https://mail.upinbox.ai';
  return `${base}/api/upinbox/calendar/google/callback`;
}

// ─── Token Exchange ───────────────────────────────────────────────────────────

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? 'Token exchange failed');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? 'Token refresh failed');
  }
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

// ─── Calendar API ─────────────────────────────────────────────────────────────

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  recurrence?: string[];
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string; organizer?: boolean; self?: boolean }>;
  organizer?: { email: string; displayName?: string };
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string }> };
}

export async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    maxResults: '500',
    orderBy: 'startTime',
  });

  const url = `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `Google Calendar API error ${res.status}`);
  }

  const data = await res.json();
  return data.items ?? [];
}

function extractVideoFromGoogleEvent(event: GoogleCalendarEvent): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const ep = event.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === 'video',
  );
  return ep?.uri ?? null;
}

function mapResponseStatus(s: string | undefined): string {
  switch (s) {
    case 'accepted':   return 'accepted';
    case 'declined':   return 'declined';
    case 'tentative':  return 'tentative';
    default:           return 'needs-action';
  }
}

// ─── Full sync ────────────────────────────────────────────────────────────────

export async function syncGoogleCalendars(
  userId: string,
  tokenRow: { id: string; encrypted_access_token: string; encrypted_refresh_token: string; token_expiry: string | null; calendar_ids: string[] },
  supabase: any,
  decryptFn: (ciphertext: string) => Promise<string>,
  encryptFn: (plaintext: string) => Promise<string>,
): Promise<number> {
  let accessToken = await decryptFn(tokenRow.encrypted_access_token);
  const refreshToken = await decryptFn(tokenRow.encrypted_refresh_token);

  // Refresh if token expired or expiring in next 5 minutes
  const expiry = tokenRow.token_expiry ? new Date(tokenRow.token_expiry).getTime() : 0;
  if (Date.now() > expiry - 5 * 60 * 1000) {
    const fresh = await refreshAccessToken(refreshToken);
    accessToken = fresh.accessToken;
    const encAccessToken = await encryptFn(fresh.accessToken);
    await supabase
      .schema('upinbox')
      .from('google_calendar_tokens')
      .update({
        encrypted_access_token: encAccessToken,
        token_expiry: new Date(fresh.expiresAt).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tokenRow.id);
  }

  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - 30);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 365);

  let totalSynced = 0;
  const calendarIds = tokenRow.calendar_ids?.length ? tokenRow.calendar_ids : ['primary'];

  for (const calendarId of calendarIds) {
    try {
      const events = await fetchGoogleCalendarEvents(accessToken, calendarId, timeMin, timeMax);

      const rows = events
        .filter((e) => e.id && (e.start.dateTime || e.start.date))
        .map((e) => {
          const allDay = !e.start.dateTime;
          const startAt = (e.start.dateTime ?? e.start.date ?? '') + (allDay ? 'T00:00:00Z' : '');
          const endAt = (e.end.dateTime ?? e.end.date ?? '') + (allDay ? 'T00:00:00Z' : '');

          const selfAttendee = e.attendees?.find((a) => a.self);
          const rsvpStatus = mapResponseStatus(selfAttendee?.responseStatus);

          const attendees = (e.attendees ?? []).map((a) => ({
            email: a.email,
            name: a.displayName,
            role: a.organizer ? 'CHAIR' : 'REQ-PARTICIPANT',
            rsvpStatus: mapResponseStatus(a.responseStatus),
          }));

          const rrule = e.recurrence?.find((r) => r.startsWith('RRULE:')) ?? null;
          const videoUrl = extractVideoFromGoogleEvent(e);

          return {
            user_id: userId,
            account_id: null,
            source_email_id: '',
            uid: `google-${calendarId}-${e.id}`,
            google_event_id: e.id,
            summary: e.summary || '(No title)',
            description: e.description ?? null,
            location: e.location ?? null,
            start_at: startAt,
            end_at: endAt,
            all_day: allDay,
            organizer_email: e.organizer?.email ?? null,
            organizer_name: e.organizer?.displayName ?? null,
            status: e.status === 'cancelled' ? 'cancelled' : 'confirmed',
            recurrence_rule: rrule,
            raw_ics: '',
            attendees,
            source: 'google',
            rsvp_status: rsvpStatus,
            video_url: videoUrl,
          };
        });

      if (!rows.length) continue;

      const { error } = await supabase
        .schema('upinbox')
        .from('calendar_events')
        .upsert(rows, { onConflict: 'user_id,account_id,uid' });

      if (!error) totalSynced += rows.length;
    } catch {
      // non-fatal per-calendar failure
    }
  }

  // Update last_synced_at
  await supabase
    .schema('upinbox')
    .from('google_calendar_tokens')
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', tokenRow.id);

  return totalSynced;
}
