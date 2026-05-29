/**
 * UpInbox Capability Definitions & Gating Helpers
 * =================================================
 *
 * MODEL: UpGPT.ai sells COMPOSABLE capabilities, NOT fixed tiers.
 *
 * A user's UpGPT subscription includes one or more capabilities (email, mcp,
 * byok, native_mobile, team, multi_account, ...). UpInbox does not care about
 * "Plus" vs "Pro" vs "Team" — it just checks whether specific capabilities are
 * present on the user's subscription.
 *
 * SELF-HOSTERS: Users who run UpInbox locally without an UpGPT subscription
 * can still use any web/PWA feature that does NOT call a capability check.
 * Features such as multi-account, native mobile (UpLink Inbox tab), team
 * collaboration, MCP server access, and BYOK AI require an active UpGPT
 * subscription that grants the matching capability.
 *
 * Capabilities are resolved upstream from the UpGPT.ai entitlement service and
 * passed into these helpers as a plain string[] — keeping this module pure and
 * easy to test without network or DB dependencies.
 */

export const CAPABILITY = {
  EMAIL: 'email',                 // UpInbox email module unlocked
  MCP: 'mcp',                     // MCP server access
  BYOK: 'byok',                   // Bring-your-own-key AI
  NATIVE_MOBILE: 'native_mobile', // UpLink mobile Inbox tab
  TEAM: 'team',                   // Team / multi-user features
  MULTI_ACCOUNT: 'multi_account', // More than 1 email account
} as const;

export type Capability = typeof CAPABILITY[keyof typeof CAPABILITY];

export interface CapabilityRequirement {
  capability: Capability;
  upgradeUrl: string;
  upgradeLabel: string;
  description: string;
}

/**
 * Requirement descriptor for the base EMAIL capability. Surfaces in upgrade
 * prompts when a user tries to use UpInbox email without an UpGPT subscription
 * that includes the email module.
 */
export const EMAIL_REQUIREMENT: CapabilityRequirement = {
  capability: CAPABILITY.EMAIL,
  upgradeUrl: 'https://upgpt.ai/account/subscribe?product=upinbox',
  upgradeLabel: 'Subscribe at UpGPT.ai',
  description: 'UpInbox email is part of your UpGPT subscription.',
};

/**
 * Returns the maximum number of connected email accounts allowed for the
 * given capability set.
 *
 *   - MULTI_ACCOUNT or TEAM → effectively unlimited (999)
 *   - EMAIL only            → 1 account
 *   - none of the above     → 0 (email module not unlocked)
 */
export function getMaxAccounts(capabilities: string[]): number {
  if (
    capabilities.includes(CAPABILITY.MULTI_ACCOUNT) ||
    capabilities.includes(CAPABILITY.TEAM)
  ) {
    return 999;
  }
  if (capabilities.includes(CAPABILITY.EMAIL)) {
    return 1;
  }
  return 0;
}

/**
 * Returns a user-friendly upgrade message when an account-limit gate is hit.
 *
 *   - No EMAIL capability         → prompt to subscribe to UpInbox at UpGPT.ai
 *   - EMAIL but no MULTI_ACCOUNT  → prompt to add the multi-account capability
 *   - MULTI_ACCOUNT or TEAM       → null (no upgrade needed)
 */
export function getAccountUpgradeMessage(capabilities: string[]): string | null {
  if (
    capabilities.includes(CAPABILITY.MULTI_ACCOUNT) ||
    capabilities.includes(CAPABILITY.TEAM)
  ) {
    return null;
  }

  if (!capabilities.includes(CAPABILITY.EMAIL)) {
    return (
      'UpInbox email is not included in your UpGPT subscription yet. ' +
      'Subscribe at UpGPT.ai to connect your first email account.'
    );
  }

  return (
    'You have reached the 1-account limit for your current UpGPT plan. ' +
    'Add the multi-account capability at UpGPT.ai to connect more inboxes.'
  );
}
