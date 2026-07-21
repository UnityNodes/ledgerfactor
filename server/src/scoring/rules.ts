import {
  BuyerCreditProfile,
  Decision,
  InvoiceInput,
  PortfolioContext,
  RiskBand,
  ScoringConfig,
  ScoringResult,
  SubScores,
} from './types';

export const defaultConfig: ScoringConfig = {
  weights: { reliability: 0.45, concentration: 0.2, dilution: 0.25, size: 0.1 },
  concentrationCap: 0.4,
  sizeReference: 250000,
  baseRateByBand: { A: 0.12, B: 0.18, C: 0.28, D: 0.4 },
  minRate: 0.005,
  maxRate: 0.15,
  approveThreshold: 70,
  reviewThreshold: 45,
};

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const round = (x: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};
const pct = (x: number): string => `${round(x * 100, 1)}%`;

const reliabilityScore = (buyer: BuyerCreditProfile): number => {
  const latePenalty = clamp01(buyer.avgDaysLate / 60);
  const raw = clamp01(buyer.onTimePaymentRate * (1 - 0.5 * latePenalty));
  const confidence = clamp01(buyer.invoicesConfirmed / 6);
  return clamp01(0.5 + (raw - 0.5) * confidence);
};

const concentrationShare = (invoice: InvoiceInput, portfolio: PortfolioContext): number => {
  const denom = portfolio.totalReceivables + invoice.amount;
  if (denom <= 0) return 0;
  return clamp01((portfolio.buyerReceivables + invoice.amount) / denom);
};

const concentrationScore = (share: number, cap: number): number => clamp01(1 - share / cap);
const dilutionScore = (buyer: BuyerCreditProfile): number => clamp01(1 - buyer.disputeRate * 3);
const sizeScore = (invoice: InvoiceInput, ref: number): number => clamp01(1 - invoice.amount / (ref * 2));

const bandFor = (score: number): RiskBand =>
  score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 45 ? 'C' : 'D';

const decisionFor = (score: number, cfg: ScoringConfig): Decision =>
  score >= cfg.approveThreshold ? 'approve' : score >= cfg.reviewThreshold ? 'review' : 'decline';

const buildRationale = (
  invoice: InvoiceInput,
  buyer: BuyerCreditProfile,
  share: number,
  subScores: SubScores,
  creditScore: number,
  riskBand: RiskBand,
  decision: Decision,
  recommendedDiscountRate: number,
  annualizedRate: number,
  cfg: ScoringConfig,
): string[] => [
  `Assumed buyer profile — on-time rate ${pct(buyer.onTimePaymentRate)} across ${buyer.invoicesConfirmed} confirmed invoice(s), avg ${buyer.avgDaysLate} day(s) late → reliability ${subScores.reliability}.`,
  `This buyer would be ${pct(share)} of financed exposure vs a ${pct(cfg.concentrationCap)} cap → concentration ${subScores.concentration}.`,
  `Historical dispute/dilution ${pct(buyer.disputeRate)} → dilution ${subScores.dilution}.`,
  `Invoice ${invoice.amount.toLocaleString('en-US')} against a ${cfg.sizeReference.toLocaleString('en-US')} reference → size ${subScores.size}.`,
  `Composite ${creditScore}/100 (band ${riskBand}) → ${decision.toUpperCase()}; recommended discount ${pct(recommendedDiscountRate)} for ${invoice.tenorDays}-day tenor (annualized ${pct(annualizedRate)}).`,
];

export const scoreInvoice = (
  invoice: InvoiceInput,
  buyer: BuyerCreditProfile,
  portfolio: PortfolioContext,
  config: ScoringConfig = defaultConfig,
): ScoringResult => {
  const share = concentrationShare(invoice, portfolio);
  const subScores: SubScores = {
    reliability: round(reliabilityScore(buyer), 4),
    concentration: round(concentrationScore(share, config.concentrationCap), 4),
    dilution: round(dilutionScore(buyer), 4),
    size: round(sizeScore(invoice, config.sizeReference), 4),
  };
  const w = config.weights;
  const wsum = w.reliability + w.concentration + w.dilution + w.size;
  const composite =
    (subScores.reliability * w.reliability +
      subScores.concentration * w.concentration +
      subScores.dilution * w.dilution +
      subScores.size * w.size) /
    wsum;
  const creditScore = Math.round(composite * 100);
  const riskBand = bandFor(creditScore);
  const decision = decisionFor(creditScore, config);
  const annualizedRate = config.baseRateByBand[riskBand];
  const tenorRate = annualizedRate * (invoice.tenorDays / 365);
  const recommendedDiscountRate = round(
    Math.max(config.minRate, Math.min(config.maxRate, tenorRate)),
    4,
  );

  return {
    creditScore,
    riskBand,
    decision,
    recommendedDiscountRate,
    annualizedRate,
    subScores,
    rationale: buildRationale(
      invoice,
      buyer,
      share,
      subScores,
      creditScore,
      riskBand,
      decision,
      recommendedDiscountRate,
      annualizedRate,
      config,
    ),
    inputs: { invoice, buyer, concentrationShare: round(share, 4) },
  };
};
