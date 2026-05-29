/**
 * Known email tracker domains used by marketing platforms, CRMs, and spy pixels.
 * Covers tracking pixels, open beacons, click redirects, and analytics endpoints.
 */
export const TRACKER_DOMAINS = new Set<string>([
  // MailChimp / Mandrill
  "list-manage.com",
  "mailchi.mp",
  "chimpstatic.com",
  "mandrillapp.com",
  "mcusercontent.com",

  // Constant Contact
  "constantcontact.com",
  "ctctcdn.com",
  "r.constantcontact.com",

  // SendGrid / Twilio
  "sendgrid.net",
  "sendgrid.com",
  "em.sendgrid.net",
  "u.sndgd.com",

  // HubSpot
  "hubspot.com",
  "hs-analytics.net",
  "hsforms.com",
  "hubspotlinks.com",
  "hs-banner.com",
  "sidekickopen.com",
  "track.hubspot.com",

  // Marketo
  "marketo.com",
  "marketo.net",
  "mktoresp.com",
  "mktoweb.com",
  "mkt51.net",
  "mkt61.net",
  "mkt71.net",

  // Pardot / Salesforce Marketing Cloud
  "pardot.com",
  "salesforce.com",
  "exacttarget.com",
  "et.exacttarget.com",
  "click.exacttarget.com",
  "sfdcstatic.com",

  // ActiveCampaign
  "activecampaign.com",
  "activehosted.com",
  "trackcmp.net",

  // Campaign Monitor
  "campaignmonitor.com",
  "cmail19.com",
  "cmail20.com",
  "createsend.com",
  "list-manage1.com",

  // GetResponse
  "getresponse.com",
  "gr-track.com",
  "grwebsite.com",

  // Mailgun
  "mailgun.com",
  "mailgun.net",
  "mg.mailgun.org",

  // Postmark
  "postmark.com",
  "postmarkapp.com",

  // SparkPost / MessageBird
  "sparkpost.com",
  "spgo.io",
  "sp.trackdomain.com",

  // Intercom
  "intercom.com",
  "intercomcdn.com",
  "intercom.io",
  "iam-assets.com",

  // Mixpanel
  "mixpanel.com",
  "api.mixpanel.com",

  // Segment
  "segment.com",
  "segment.io",
  "cdn.segment.com",
  "api.segment.io",

  // Google Analytics / Google Tag Manager
  "google-analytics.com",
  "analytics.google.com",
  "googletagmanager.com",
  "doubleclick.net",
  "googleadservices.com",

  // Litmus
  "litmus.com",
  "litmus-content.com",
  "litmuscdn.com",

  // Email on Acid
  "emailonacid.com",
  "eoastorage.com",

  // Yesware
  "yesware.com",
  "t.yesware.com",
  "app.yesware.com",

  // Streak
  "streak.com",
  "mailfoogae.appspot.com",

  // Mailtrack
  "mailtrack.io",

  // BanaTag
  "banatag.com",
  "tag.bananatag.com",

  // SalesLoft
  "salesloft.com",
  "slt.mn",

  // Outreach
  "outreach.io",
  "outrch.com",

  // Apollo.io
  "apollo.io",
  "ap.trk.apollo.io",

  // ZoomInfo
  "zoominfo.com",
  "zi-track.com",

  // Clearbit
  "clearbit.com",
  "reveal.clearbit.com",

  // Common generic tracking CDNs and pixel services
  "trk.email",
  "opens.com",
  "tr.fxd.io",
  "tinyurl.com",
  "bit.ly",
  "rebrandly.com",
  "sendpulse.com",
  "drip.com",
  "convertkit.com",
  "klaviyo.com",
]);

/**
 * Checks whether a given URL belongs to a known email tracker domain.
 * Matches both exact hostnames and subdomains of tracker domains.
 *
 * @param url - The full URL string to test (e.g. "https://t.yesware.com/tt/abc123")
 * @returns true if the URL's hostname matches or is a subdomain of a known tracker domain
 */
export function isTrackerDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    // Check exact match first (fast path)
    if (TRACKER_DOMAINS.has(hostname)) return true;
    // Check subdomain match (e.g. em.sendgrid.net → sendgrid.net)
    return Array.from(TRACKER_DOMAINS).some((d) => hostname.endsWith("." + d));
  } catch {
    return false;
  }
}
