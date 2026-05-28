/**
 * Tests for the 4-path email classifier
 *
 * Mock strategy:
 * - @upgpt-ai/email-classifier: vitest mock (no network)
 * - fetch: vi.fn() stubs per test
 * - chrome.runtime: minimal stub
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyEmailWithRouter, runHeuristic, testUplinkConnection } from '../classifier';
import type { ExtensionSettings, ClassifyEmailPayload } from '../types';
import { DEFAULT_SETTINGS } from '../types';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@upgpt-ai/email-classifier', () => ({
  classifyEmail: vi.fn(),
}));

import { classifyEmail as mockHeuristic } from '@upgpt-ai/email-classifier';
const mockHeuristicFn = vi.mocked(mockHeuristic);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeFetchMock(response: object, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  });
}

const baseSettings: ExtensionSettings = {
  ...DEFAULT_SETTINGS,
  tier: 'plus',
  byokProvider: 'claude',
  byokModel: 'claude-haiku-4-5-20251001',
};

const basePayload: ClassifyEmailPayload = {
  subject: 'Q3 budget review',
  fromEmail: 'cfo@example.com',
  snippet: 'Please review the attached budget spreadsheet by Friday.',
};

// ─── runHeuristic ─────────────────────────────────────────────────────────────

describe('runHeuristic', () => {
  beforeEach(() => {
    mockHeuristicFn.mockReturnValue({
      category: 'ACTION_REQUIRED',
      confidence: 0.72,
      signals: ['business-sender', 'cta-detected'],
    });
  });

  it('returns heuristic result with path = "heuristic"', () => {
    const result = runHeuristic(basePayload);
    expect(result.path).toBe('heuristic');
    expect(result.category).toBe('ACTION_REQUIRED');
    expect(result.confidence).toBeCloseTo(0.72);
  });

  it('includes latencyMs', () => {
    const result = runHeuristic(basePayload);
    expect(result.latencyMs).toBeTypeOf('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('passes subject and fromEmail to @upgpt-ai/email-classifier', () => {
    runHeuristic(basePayload);
    expect(mockHeuristicFn).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Q3 budget review', from: 'cfo@example.com' })
    );
  });
});

// ─── classifyEmailWithRouter — early exit ────────────────────────────────────

describe('classifyEmailWithRouter — heuristic early exit', () => {
  it('returns heuristic result without calling fetch when confidence >= 0.8', async () => {
    mockHeuristicFn.mockReturnValue({ category: 'NEWSLETTER', confidence: 0.85, signals: [] });
    global.fetch = makeFetchMock({});

    const result = await classifyEmailWithRouter(basePayload, baseSettings);
    expect(result.path).toBe('heuristic');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls through to BYOK when heuristic confidence < 0.8', async () => {
    mockHeuristicFn.mockReturnValue({ category: 'FYI', confidence: 0.6, signals: [] });
    global.fetch = makeFetchMock({
      content: [{ text: '{"category":"ACTION_REQUIRED","confidence":0.95,"signals":["reply-needed"]}' }],
    });

    const result = await classifyEmailWithRouter(basePayload, baseSettings, 'sk-test-key');
    expect(result.path).toBe('byok');
    expect(result.category).toBe('ACTION_REQUIRED');
  });
});

// ─── classifyEmailWithRouter — BYOK (Claude) ──────────────────────────────────

describe('classifyEmailWithRouter — BYOK Claude', () => {
  beforeEach(() => {
    mockHeuristicFn.mockReturnValue({ category: 'FYI', confidence: 0.5, signals: [] });
  });

  it('calls Anthropic API with correct structure', async () => {
    const fetchMock = makeFetchMock({
      content: [{ text: '{"category":"RECEIPT","confidence":0.97,"signals":["invoice","amount"]}' }],
    });
    global.fetch = fetchMock;

    await classifyEmailWithRouter(basePayload, baseSettings, 'sk-ant-test');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 128,
    });
    expect(init.headers['x-api-key']).toBe('sk-ant-test');
  });

  it('returns correct category from Claude response', async () => {
    global.fetch = makeFetchMock({
      content: [{ text: '{"category":"RECEIPT","confidence":0.97}' }],
    });
    const result = await classifyEmailWithRouter(basePayload, baseSettings, 'sk-ant-test');
    expect(result.category).toBe('RECEIPT');
    expect(result.confidence).toBeCloseTo(0.97);
    expect(result.path).toBe('byok');
  });

  it('falls back to heuristic on Claude 429 error', async () => {
    global.fetch = makeFetchMock({ error: 'rate limited' }, 429);
    const result = await classifyEmailWithRouter(basePayload, baseSettings, 'sk-ant-test');
    expect(result.path).toBe('heuristic');
  });
});

// ─── classifyEmailWithRouter — BYOK (OpenAI) ─────────────────────────────────

describe('classifyEmailWithRouter — BYOK OpenAI', () => {
  beforeEach(() => {
    mockHeuristicFn.mockReturnValue({ category: 'FYI', confidence: 0.4, signals: [] });
  });

  it('calls OpenAI chat completions endpoint', async () => {
    const fetchMock = makeFetchMock({
      choices: [{ message: { content: '{"category":"PROMOTIONAL","confidence":0.9}' } }],
    });
    global.fetch = fetchMock;

    const settings: ExtensionSettings = { ...baseSettings, byokProvider: 'openai', byokModel: 'gpt-4o-mini' };
    await classifyEmailWithRouter(basePayload, settings, 'sk-openai-test');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
  });
});

// ─── classifyEmailWithRouter — UpLink ─────────────────────────────────────────

describe('classifyEmailWithRouter — UpLink', () => {
  beforeEach(() => {
    mockHeuristicFn.mockReturnValue({ category: 'FYI', confidence: 0.55, signals: [] });
  });

  it('calls Ollama generate endpoint', async () => {
    const fetchMock = makeFetchMock({
      response: '{"category":"ACTION_REQUIRED","confidence":0.88}',
    });
    global.fetch = fetchMock;

    const settings: ExtensionSettings = {
      ...baseSettings,
      tier: 'free',
      uplinkEnabled: true,
      uplinkUrl: 'http://localhost:11434',
      uplinkModel: 'phi4-mini',
    };
    const result = await classifyEmailWithRouter(basePayload, settings);
    expect(result.path).toBe('uplink');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/generate');
  });

  it('UpLink takes priority over BYOK', async () => {
    global.fetch = makeFetchMock({
      response: '{"category":"FYI","confidence":0.9}',
    });
    const settings: ExtensionSettings = {
      ...baseSettings,
      uplinkEnabled: true,
    };
    const result = await classifyEmailWithRouter(basePayload, settings, 'sk-ant-key');
    expect(result.path).toBe('uplink');
  });
});

// ─── classifyEmailWithRouter — Intelligence API ───────────────────────────────

describe('classifyEmailWithRouter — Intelligence API', () => {
  beforeEach(() => {
    mockHeuristicFn.mockReturnValue({ category: 'FYI', confidence: 0.45, signals: [] });
  });

  it('sends only metadata features — no raw content', async () => {
    const fetchMock = makeFetchMock({ category: 'NEWSLETTER', confidence: 0.96 });
    global.fetch = fetchMock;

    const settings: ExtensionSettings = {
      ...baseSettings,
      tier: 'business',
      uplinkEnabled: false,
      intelligenceEnabled: true,
      byokProvider: 'claude',
    };
    await classifyEmailWithRouter(basePayload, settings); // no byokApiKey

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toHaveProperty('features');
    expect(body.features).not.toHaveProperty('subject');     // raw subject must not appear
    expect(body.features).not.toHaveProperty('fromEmail');   // raw email must not appear
    expect(body.features).toHaveProperty('subjectWordCount');
    expect(body.features).toHaveProperty('senderDomainType');
  });

  it('skips Intelligence API for non-business tier', async () => {
    const fetchMock = makeFetchMock({ category: 'NEWSLETTER', confidence: 0.96 });
    global.fetch = fetchMock;

    const settings: ExtensionSettings = {
      ...baseSettings,
      tier: 'plus', // not business
      intelligenceEnabled: true,
      uplinkEnabled: false,
    };
    const result = await classifyEmailWithRouter(basePayload, settings);
    expect(result.path).toBe('heuristic'); // falls back — no byok key, not business
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─── testUplinkConnection ─────────────────────────────────────────────────────

describe('testUplinkConnection', () => {
  it('returns ok:true when Ollama responds 200', async () => {
    global.fetch = makeFetchMock({ modelinfo: { general: { name: 'phi4-mini' } } });
    const result = await testUplinkConnection('http://localhost:11434', 'phi4-mini');
    expect(result.ok).toBe(true);
    expect(result.model).toBe('phi4-mini');
  });

  it('returns ok:false on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await testUplinkConnection('http://localhost:11434', 'phi4-mini');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
