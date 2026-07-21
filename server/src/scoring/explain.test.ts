import { afterEach, describe, expect, it, vi } from 'vitest';
import { scoreInvoice, defaultConfig } from './rules';
import { explainScore, fallbackExplanation } from './explain';

const sample = () =>
  scoreInvoice(
    { amount: 100000, tenorDays: 60, buyer: 'Globex Corp' },
    { buyer: 'Globex Corp', invoicesConfirmed: 12, onTimePaymentRate: 0.96, avgDaysLate: 2, disputeRate: 0.01 },
    { totalReceivables: 800000, buyerReceivables: 0 },
    defaultConfig,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('explainScore', () => {
  it('returns the deterministic template when no provider key is set', async () => {
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const r = sample();
    const out = await explainScore(r);
    expect(out.source).toBe('template');
    expect(out.memo).toBe(fallbackExplanation(r));
  });

  it('uses Groq when GROQ_API_KEY is set and reports source=model', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const fetchMock = vi.fn(async (url: string, init: any) => {
      expect(url).toContain('api.groq.com');
      const body = JSON.parse(init.body);
      expect(body.model).toBe('llama-3.3-70b-versatile');
      expect(init.headers.Authorization).toBe('Bearer gsk_test');
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'Approve at 1.97%.' } }] }) } as any;
    });
    vi.stubGlobal('fetch', fetchMock);
    const out = await explainScore(sample());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(out.source).toBe('model');
    expect(out.memo).toBe('Approve at 1.97%.');
  });

  it('honors GROQ_MODEL override', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');
    vi.stubEnv('GROQ_MODEL', 'openai/gpt-oss-120b');
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      expect(JSON.parse(init.body).model).toBe('openai/gpt-oss-120b');
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) } as any;
    });
    vi.stubGlobal('fetch', fetchMock);
    const out = await explainScore(sample());
    expect(out.source).toBe('model');
  });

  it('falls back to the template when Groq errors', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as any));
    const r = sample();
    const out = await explainScore(r);
    expect(out.source).toBe('template');
    expect(out.memo).toBe(fallbackExplanation(r));
  });

  it('falls back to the template when Groq returns empty content', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '' } }] }) }) as any));
    const r = sample();
    const out = await explainScore(r);
    expect(out.source).toBe('template');
  });
});
