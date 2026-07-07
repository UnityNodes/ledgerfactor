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

export const explainScore = async (r: ScoringResult, opts: ExplainOptions = {}): Promise<string> => {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackExplanation(r);
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const model = opts.model ?? 'claude-haiku-4-5-20251001';
    const msg = await client.messages.create({
      model,
      max_tokens: 320,
      system:
        'You are a receivables-finance underwriter. Given a structured credit assessment, write a concise 2-4 sentence underwriting memo for the financier. State the decision, the recommended discount rate, and the two most material risk drivers. Use only the numbers provided; invent nothing.',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            decision: r.decision,
            creditScore: r.creditScore,
            riskBand: r.riskBand,
            recommendedDiscountRate: r.recommendedDiscountRate,
            subScores: r.subScores,
            rationale: r.rationale,
          }),
        },
      ],
    });
    const text = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim();
    return text || fallbackExplanation(r);
  } catch {
    return fallbackExplanation(r);
  }
};
