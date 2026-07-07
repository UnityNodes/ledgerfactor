export interface BuyerCreditProfile {
  buyer: string;
  invoicesConfirmed: number;
  onTimePaymentRate: number;
  avgDaysLate: number;
  disputeRate: number;
}

export interface PortfolioContext {
  totalReceivables: number;
  buyerReceivables: number;
}

export interface InvoiceInput {
  amount: number;
  tenorDays: number;
  buyer: string;
}

export type RiskBand = 'A' | 'B' | 'C' | 'D';
export type Decision = 'approve' | 'review' | 'decline';

export interface SubScores {
  reliability: number;
  concentration: number;
  dilution: number;
  size: number;
}

export interface ScoringConfig {
  weights: { reliability: number; concentration: number; dilution: number; size: number };
  concentrationCap: number;
  sizeReference: number;
  baseRateByBand: Record<RiskBand, number>;
  minRate: number;
  maxRate: number;
  approveThreshold: number;
  reviewThreshold: number;
}

export interface ScoringResult {
  creditScore: number;
  riskBand: RiskBand;
  decision: Decision;
  recommendedDiscountRate: number;
  annualizedRate: number;
  subScores: SubScores;
  rationale: string[];
  inputs: { invoice: InvoiceInput; buyer: BuyerCreditProfile; concentrationShare: number };
}
