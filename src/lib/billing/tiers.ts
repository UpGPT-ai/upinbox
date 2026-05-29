/**
 * UpInbox Billing Tiers — UpLink Pro Edition
 *
 * UpInbox is the email module of UpLink. It is NOT a standalone product.
 * Access to UpInbox requires UpLink Pro or higher.
 *
 * UpLink Tier Structure:
 *   Free  — chat only, no UpInbox features
 *   Plus  — chat + skills, NO email (no UpInbox access)
 *   Pro   — everything in Plus + UpInbox email module + BYOK AI + native mobile + MCP
 *   Team  — everything in Pro + team management + multi-user
 *
 * Self-hosted (separate licensing path — preserved for community/business/enterprise):
 *   Community    — free forever, ≤10 users, heuristic + BYOK only
 *   Business     — $499/year (license JWT), Intelligence API, unlimited users
 *   Enterprise   — $2,999/year, SSO + SCIM + SLA
 *
 * Note: BYOK (bring your own API key) is available on Pro+ tiers. Email features
 * are gated behind Pro — there is NO free email tier. UpInbox = UpLink Pro.
 */

export type Tier = 'free' | 'plus' | 'pro' | 'team';
export type HostedTier = Tier;
export type SelfHostTier = 'community' | 'business' | 'enterprise';

export interface TierCapabilities {
  email: boolean;
  nativeMobile: boolean;
  mcp: boolean;
  byok: boolean;
  maxAccounts: number;
}

/**
 * Canonical capability map — single source of truth for what each tier can do.
 * Email is gated to Pro and Team only. Free and Plus have NO email access.
 */
export const TIER_CAPABILITIES: Record<Tier, { email: boolean; nativeMobile: boolean; mcp: boolean; byok: boolean; maxAccounts: number; }> = {
  free: { email: false, nativeMobile: false, mcp: false, byok: false, maxAccounts: 0 },
  plus: { email: false, nativeMobile: false, mcp: false, byok: false, maxAccounts: 0 },
  pro: { email: true, nativeMobile: true, mcp: true, byok: true, maxAccounts: 5 },
  team: { email: true, nativeMobile: true, mcp: true, byok: true, maxAccounts: 999 },
};

export interface TierFeatures {
  maxAccounts: number;
  byokEnabled: boolean;
  intelligenceApiEnabled: boolean;
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

/**
 * Detailed per-tier feature matrix. Aligns with TIER_CAPABILITIES.
 * Free + Plus get NO email features. Pro unlocks the full UpInbox module.
 */
export const TIER_FEATURES: Record<Tier, TierFeatures> = {
  free: {
    maxAccounts: 0,
    byokEnabled: false,
    intelligenceApiEnabled: false,
    smartLabels: false,
    aiDrafts: false,
    replyLater: false,
    paperTrail: false,
    mcpEnabled: false,
    usxEnabled: false,
    customDomainEnabled: false,
    teamEnabled: false,
    ssoEnabled: false,
    scimEnabled: false,
    slaEnabled: false,
  },
  plus: {
    maxAccounts: 0,
    byokEnabled: false,
    intelligenceApiEnabled: false,
    smartLabels: false,
    aiDrafts: false,
    replyLater: false,
    paperTrail: false,
    mcpEnabled: false,
    usxEnabled: false,
    customDomainEnabled: false,
    teamEnabled: false,
    ssoEnabled: false,
    scimEnabled: false,
    slaEnabled: false,
  },
  pro: {
    maxAccounts: 5,
    byokEnabled: true,
    intelligenceApiEnabled: true,
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
  team: {
    maxAccounts: 999,
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

/**
 * Returns true if the tier can access UpInbox email features.
 * Email is Pro+ only — Free and Plus return false.
 */
export function canUseEmail(tier: Tier): boolean {
  return TIER_CAPABILITIES[tier].email === true;
}

/**
 * Returns true if the tier can connect another email account given the current count.
 * Free and Plus always return false (no email access). Pro caps at 5, Team at 999.
 */
export function canConnectMoreAccounts(tier: Tier, currentCount: number): boolean {
  const caps = TIER_CAPABILITIES[tier];
  if (!caps.email) return false;
  return currentCount < caps.maxAccounts;
}

/** Stripe price IDs — populated at runtime from env vars (UpLink pricing) */
export const STRIPE_PRICE_IDS = {
  plus_monthly: process.env.STRIPE_UPLINK_PLUS_MONTHLY ?? '',
  plus_annual: process.env.STRIPE_UPLINK_PLUS_ANNUAL ?? '',
  pro_monthly: process.env.STRIPE_UPLINK_PRO_MONTHLY ?? '',
  pro_annual: process.env.STRIPE_UPLINK_PRO_ANNUAL ?? '',
  team_monthly: process.env.STRIPE_UPLINK_TEAM_MONTHLY ?? '',
  team_annual: process.env.STRIPE_UPLINK_TEAM_ANNUAL ?? '',
  selfhost_business: process.env.STRIPE_UPINBOX_SELFHOST_BUSINESS ?? '', // $499/yr
  selfhost_enterprise: process.env.STRIPE_UPINBOX_SELFHOST_ENTERPRISE ?? '', // $2,999/yr
};

/** Pricing display (USD) — UpLink tier pricing */
export const PRICING = {
  plus: { monthly: 9.99, annual: 99 },
  pro: { monthly: 29.99, annual: 299 },     // UpInbox unlocked here
  team: { monthly: 79.99, annual: 799 },
  selfhost_business: { annual: 499 },
  selfhost_enterprise: { annual: 2999 },
};
