/**
 * UpInbox Billing Tiers
 *
 * Hosted SaaS tiers:
 *   Free     — heuristic classification, 1 account, no BYOK required (can add their own)
 *   Plus     — BYOK AI, up to 3 accounts, smart labels, AI drafts, Reply Later
 *   Business — per-seat, Intelligence API (95%), unlimited accounts, team features
 *
 * Self-hosted:
 *   Community    — free forever, ≤10 users, heuristic + BYOK only
 *   Business     — $499/year (license JWT), Intelligence API, unlimited users
 *   Enterprise   — $2,999/year, SSO + SCIM + SLA
 *
 * Note: BYOK (bring your own API key) is available on ALL tiers — users paying
 * their own AI bill is always free for us to support. The Intelligence API
 * (our trained classifier) is the premium feature.
 */

export type HostedTier = 'free' | 'plus' | 'business';
export type SelfHostTier = 'community' | 'business' | 'enterprise';
export type Tier = HostedTier | SelfHostTier;

export interface TierFeatures {
  maxAccounts: number;
  byokEnabled: boolean;               // BYOK always true
  intelligenceApiEnabled: boolean;    // Our trained 95% classifier
  smartLabels: boolean;
  aiDrafts: boolean;
  replyLater: boolean;
  paperTrail: boolean;
  mcpEnabled: boolean;
  usxEnabled: boolean;
  customDomainEnabled: boolean;
  teamEnabled: boolean;
  ssoEnabled: boolean;
  scimEnabled: boolean;
  slaEnabled: boolean;
}

export const TIER_FEATURES: Record<HostedTier, TierFeatures> = {
  free: {
    maxAccounts: 1,
    byokEnabled: true,
    intelligenceApiEnabled: false,
    smartLabels: false,
    aiDrafts: false,
    replyLater: false,
    paperTrail: false,
    mcpEnabled: true,
    usxEnabled: true,
    customDomainEnabled: false,
    teamEnabled: false,
    ssoEnabled: false,
    scimEnabled: false,
    slaEnabled: false,
  },
  plus: {
    maxAccounts: 3,
    byokEnabled: true,
    intelligenceApiEnabled: false,  // BYOK gives 95% — no need for Intelligence API
    smartLabels: true,
    aiDrafts: true,
    replyLater: true,
    paperTrail: true,
    mcpEnabled: true,
    usxEnabled: true,
    customDomainEnabled: false,
    teamEnabled: false,
    ssoEnabled: false,
    scimEnabled: false,
    slaEnabled: false,
  },
  business: {
    maxAccounts: Infinity,
    byokEnabled: true,
    intelligenceApiEnabled: true,   // 95% accuracy with no API key needed
    smartLabels: true,
    aiDrafts: true,
    replyLater: true,
    paperTrail: true,
    mcpEnabled: true,
    usxEnabled: true,
    customDomainEnabled: true,
    teamEnabled: true,
    ssoEnabled: false,
    scimEnabled: false,
    slaEnabled: false,
  },
};

export const SELF_HOST_TIER_FEATURES: Record<SelfHostTier, TierFeatures> = {
  community: {
    maxAccounts: Infinity, // per-user, not total
    byokEnabled: true,
    intelligenceApiEnabled: false,
    smartLabels: true,
    aiDrafts: true,
    replyLater: true,
    paperTrail: true,
    mcpEnabled: true,
    usxEnabled: true,
    customDomainEnabled: true,
    teamEnabled: true,
    ssoEnabled: false,
    scimEnabled: false,
    slaEnabled: false,
  },
  business: {
    maxAccounts: Infinity,
    byokEnabled: true,
    intelligenceApiEnabled: true,
    smartLabels: true,
    aiDrafts: true,
    replyLater: true,
    paperTrail: true,
    mcpEnabled: true,
    usxEnabled: true,
    customDomainEnabled: true,
    teamEnabled: true,
    ssoEnabled: false,
    scimEnabled: false,
    slaEnabled: false,
  },
  enterprise: {
    maxAccounts: Infinity,
    byokEnabled: true,
    intelligenceApiEnabled: true,
    smartLabels: true,
    aiDrafts: true,
    replyLater: true,
    paperTrail: true,
    mcpEnabled: true,
    usxEnabled: true,
    customDomainEnabled: true,
    teamEnabled: true,
    ssoEnabled: true,
    scimEnabled: true,
    slaEnabled: true,
  },
};

/** Stripe price IDs — populated at runtime from env vars */
export const STRIPE_PRICE_IDS = {
  plus_monthly: process.env.STRIPE_UPINBOX_PLUS_MONTHLY ?? '',
  plus_annual: process.env.STRIPE_UPINBOX_PLUS_ANNUAL ?? '',
  business_monthly: process.env.STRIPE_UPINBOX_BUSINESS_MONTHLY ?? '',
  business_annual: process.env.STRIPE_UPINBOX_BUSINESS_ANNUAL ?? '',
  selfhost_business: process.env.STRIPE_UPINBOX_SELFHOST_BUSINESS ?? '', // $499/yr
  selfhost_enterprise: process.env.STRIPE_UPINBOX_SELFHOST_ENTERPRISE ?? '', // $2,999/yr
};

/** Pricing display (USD) */
export const PRICING = {
  plus: { monthly: 9, annual: 84 },      // $9/mo or $84/yr ($7/mo)
  business: { monthly: 19, annual: 180 }, // $19/user/mo or $180/yr ($15/mo)
  selfhost_business: { annual: 499 },
  selfhost_enterprise: { annual: 2999 },
};
