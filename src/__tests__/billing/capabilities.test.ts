/**
 * Tests for UpInbox capability gating helpers.
 *
 * These helpers are pure functions over a string[] of capabilities resolved
 * upstream from the UpGPT.ai entitlement service. No network, no DB.
 */

import { describe, it, expect } from 'vitest';
import {
  CAPABILITY,
  EMAIL_REQUIREMENT,
  getMaxAccounts,
  getAccountUpgradeMessage,
} from '@/lib/billing/capabilities';

describe('CAPABILITY constants', () => {
  it('defines the EMAIL capability', () => {
    expect(CAPABILITY.EMAIL).toBe('email');
  });

  it('defines the MCP capability', () => {
    expect(CAPABILITY.MCP).toBe('mcp');
  });

  it('defines the BYOK capability', () => {
    expect(CAPABILITY.BYOK).toBe('byok');
  });

  it('defines the NATIVE_MOBILE capability', () => {
    expect(CAPABILITY.NATIVE_MOBILE).toBe('native_mobile');
  });

  it('defines the TEAM capability', () => {
    expect(CAPABILITY.TEAM).toBe('team');
  });

  it('defines the MULTI_ACCOUNT capability', () => {
    expect(CAPABILITY.MULTI_ACCOUNT).toBe('multi_account');
  });

  it('exposes exactly the expected capability keys', () => {
    expect(Object.keys(CAPABILITY).sort()).toEqual(
      ['BYOK', 'EMAIL', 'MCP', 'MULTI_ACCOUNT', 'NATIVE_MOBILE', 'TEAM'].sort(),
    );
  });
});

describe('EMAIL_REQUIREMENT', () => {
  it('targets the EMAIL capability', () => {
    expect(EMAIL_REQUIREMENT.capability).toBe(CAPABILITY.EMAIL);
  });

  it('has a subscribe URL pointing to upgpt.ai', () => {
    expect(EMAIL_REQUIREMENT.upgradeUrl).toContain('upgpt.ai');
    expect(EMAIL_REQUIREMENT.upgradeUrl).toMatch(/^https:\/\/upgpt\.ai\//);
    expect(EMAIL_REQUIREMENT.upgradeUrl).toContain('subscribe');
  });

  it('includes the upinbox product query param', () => {
    expect(EMAIL_REQUIREMENT.upgradeUrl).toContain('product=upinbox');
  });

  it('has a human-readable upgrade label and description', () => {
    expect(typeof EMAIL_REQUIREMENT.upgradeLabel).toBe('string');
    expect(EMAIL_REQUIREMENT.upgradeLabel.length).toBeGreaterThan(0);
    expect(typeof EMAIL_REQUIREMENT.description).toBe('string');
    expect(EMAIL_REQUIREMENT.description.length).toBeGreaterThan(0);
  });
});

describe('getMaxAccounts', () => {
  it('returns 0 for an empty capability array', () => {
    expect(getMaxAccounts([])).toBe(0);
  });

  it('returns 0 when EMAIL is not present even if unrelated caps are', () => {
    expect(getMaxAccounts([CAPABILITY.BYOK, CAPABILITY.MCP])).toBe(0);
  });

  it('returns 1 when only EMAIL is present', () => {
    expect(getMaxAccounts([CAPABILITY.EMAIL])).toBe(1);
  });

  it('returns 1 when EMAIL is combined with unrelated caps', () => {
    expect(getMaxAccounts([CAPABILITY.EMAIL, CAPABILITY.BYOK])).toBe(1);
    expect(getMaxAccounts([CAPABILITY.EMAIL, CAPABILITY.MCP])).toBe(1);
  });

  it('returns 999 when MULTI_ACCOUNT is present', () => {
    expect(getMaxAccounts([CAPABILITY.MULTI_ACCOUNT])).toBe(999);
    expect(
      getMaxAccounts([CAPABILITY.EMAIL, CAPABILITY.MULTI_ACCOUNT]),
    ).toBe(999);
  });

  it('returns 999 when TEAM is present', () => {
    expect(getMaxAccounts([CAPABILITY.TEAM])).toBe(999);
    expect(getMaxAccounts([CAPABILITY.EMAIL, CAPABILITY.TEAM])).toBe(999);
  });

  it('returns 999 when both TEAM and MULTI_ACCOUNT are present', () => {
    expect(
      getMaxAccounts([CAPABILITY.TEAM, CAPABILITY.MULTI_ACCOUNT]),
    ).toBe(999);
  });
});

describe('getAccountUpgradeMessage', () => {
  it('returns null when MULTI_ACCOUNT is present (no upgrade needed)', () => {
    expect(
      getAccountUpgradeMessage([CAPABILITY.EMAIL, CAPABILITY.MULTI_ACCOUNT]),
    ).toBeNull();
  });

  it('returns null when TEAM is present (no upgrade needed)', () => {
    expect(
      getAccountUpgradeMessage([CAPABILITY.EMAIL, CAPABILITY.TEAM]),
    ).toBeNull();
  });

  it('returns null when MULTI_ACCOUNT is present even without EMAIL', () => {
    expect(getAccountUpgradeMessage([CAPABILITY.MULTI_ACCOUNT])).toBeNull();
  });

  it('returns a subscribe message when EMAIL is missing entirely', () => {
    const msg = getAccountUpgradeMessage([]);
    expect(msg).not.toBeNull();
    expect(msg).toContain('UpGPT');
    expect(msg!.toLowerCase()).toContain('subscribe');
  });

  it('returns a subscribe message when only unrelated caps are present', () => {
    const msg = getAccountUpgradeMessage([CAPABILITY.BYOK, CAPABILITY.MCP]);
    expect(msg).not.toBeNull();
    expect(msg!.toLowerCase()).toContain('subscribe');
  });

  it('returns a multi-account upgrade prompt when EMAIL is present but not MULTI_ACCOUNT', () => {
    const msg = getAccountUpgradeMessage([CAPABILITY.EMAIL]);
    expect(msg).not.toBeNull();
    expect(msg!.toLowerCase()).toContain('multi-account');
    expect(msg).toContain('1-account limit');
  });

  it('multi-account prompt is distinct from the no-email subscribe prompt', () => {
    const emailOnly = getAccountUpgradeMessage([CAPABILITY.EMAIL]);
    const none = getAccountUpgradeMessage([]);
    expect(emailOnly).not.toEqual(none);
  });
});
