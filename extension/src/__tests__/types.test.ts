/**
 * Tests for type helpers — tier normalization and defaults
 */

import { describe, it, expect } from 'vitest';
import { normalizeTier, DEFAULT_SETTINGS } from '../types';

describe('normalizeTier', () => {
  it('maps "business" → "business"', () => expect(normalizeTier('business')).toBe('business'));
  it('maps "team" → "business"', () => expect(normalizeTier('team')).toBe('business'));
  it('maps "enterprise" → "business"', () => expect(normalizeTier('enterprise')).toBe('business'));
  it('maps "plus" → "plus"', () => expect(normalizeTier('plus')).toBe('plus'));
  it('maps "pro" → "plus" (legacy)', () => expect(normalizeTier('pro')).toBe('plus'));
  it('maps "personal" → "plus" (legacy)', () => expect(normalizeTier('personal')).toBe('plus'));
  it('maps "free" → "free"', () => expect(normalizeTier('free')).toBe('free'));
  it('maps "basic" → "free" (legacy)', () => expect(normalizeTier('basic')).toBe('free'));
  it('maps unknown strings → "free"', () => expect(normalizeTier('whatever')).toBe('free'));
  it('handles uppercase input', () => expect(normalizeTier('PLUS')).toBe('plus'));
  it('handles whitespace', () => expect(normalizeTier('  business  ')).toBe('business'));
});

describe('DEFAULT_SETTINGS', () => {
  it('has tier: free by default', () => expect(DEFAULT_SETTINGS.tier).toBe('free'));
  it('has autoClassify: true by default', () => expect(DEFAULT_SETTINGS.autoClassify).toBe(true));
  it('has uplinkEnabled: false by default', () => expect(DEFAULT_SETTINGS.uplinkEnabled).toBe(false));
  it('has intelligenceEnabled: false by default', () => expect(DEFAULT_SETTINGS.intelligenceEnabled).toBe(false));
  it('defaults to claude haiku', () => expect(DEFAULT_SETTINGS.byokModel).toContain('haiku'));
  it('defaults upinboxInstanceUrl to upinbox.ai', () => {
    expect(DEFAULT_SETTINGS.upinboxInstanceUrl).toBe('https://upinbox.ai');
  });
});
