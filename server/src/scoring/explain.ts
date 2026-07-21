import { ScoringResult } from './types';

export const fallbackExplanation = (r: ScoringResult): string => {
  const rate = (r.recommendedDiscountRate * 100).toFixed(2);
  const verdict =
    r.decision === 'approve'
      ? `Recommend financing at a ${rate}% discount for the tenor.`
      : r.decision === 'review'
        ? `Refer for manual review before financing (indicative discount ${rate}%).`
        : `Recommend declining this receivable at current terms.`;
  return `Credit score ${r.creditScore}/100 (band ${r.riskBand}). ${verdict}\n${r.rationale.join(' ')}`;
};

export interface ExplainOptions {
  model?: string;
  apiKey?: string;
}

export type MemoSource = 'model' | 'template';

export interface Explanation {
  memo: string;
  source: MemoSource;
}

const SYSTEM_PROMPT =
  'You are a receivables-finance underwriter. Given a structured credit assessment, write a concise 2-4 sentence underwriting memo for the financier. State the decision, the recommended discount rate, and the two most material risk drivers. Use only the numbers provided; invent nothing. Express the discount rate as a percentage (e.g. 0.0197 -> 1.97%).';

const userPayload = (r: ScoringResult): string =>
  JSON.stringify({
    decision: r.decision,
    creditScore: r.creditScore,
    riskBand: r.riskBand,
    recommendedDiscountRate: r.recommendedDiscountRate,
    subScores: r.subScores,
    rationale: r.rationale,
  });

const viaGroq = async (r: ScoringResult, apiKey: string, model: string): Promise<string> => {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 320,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPayload(r) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return String(json.choices?.[0]?.message?.content ?? '').trim();
};

const viaAnthropic = async (r: ScoringResult, apiKey: string, model: string): Promise<string> => {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model,
    max_tokens: 320,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPayload(r) }],
  });
  return msg.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
    .trim();
};

export const explainScore = async (r: ScoringResult, opts: ExplainOptions = {}): Promise<Explanation> => {
  const groqKey = process.env.GROQ_API_KEY;
  const anthropicKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  try {
    if (groqKey) {
      const text = await viaGroq(r, groqKey, opts.model ?? process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile');
      if (text) return { memo: text, source: 'model' };
    } else if (anthropicKey) {
      const text = await viaAnthropic(r, anthropicKey, opts.model ?? 'claude-haiku-4-5-20251001');
      if (text) return { memo: text, source: 'model' };
    }
  } catch {
    /* fall through to the deterministic template */
  }
  return { memo: fallbackExplanation(r), source: 'template' };
};
