import { describe, it, expect } from 'vitest';
import { scoreInvoice, defaultConfig } from './rules';
import { BuyerCreditProfile, InvoiceInput, PortfolioContext } from './types';

const strongBuyer: BuyerCreditProfile = {
  buyer: 'Buyer',
  invoicesConfirmed: 12,
  onTimePaymentRate: 0.96,
  avgDaysLate: 2,
  disputeRate: 0.01,
};

const weakBuyer: BuyerCreditProfile = {
  buyer: 'Buyer',
  invoicesConfirmed: 2,
  onTimePaymentRate: 0.5,
  avgDaysLate: 28,
  disputeRate: 0.2,
};

const invoice: InvoiceInput = { amount: 100000, tenorDays: 60, buyer: 'Buyer' };
const diversified: PortfolioContext = { totalReceivables: 900000, buyerReceivables: 100000 };
const concentrated: PortfolioContext = { totalReceivables: 100000, buyerReceivables: 100000 };

describe('scoreInvoice', () => {
  it('approves a strong, diversified buyer at a low rate', () => {
    const r = scoreInvoice(invoice, strongBuyer, diversified);
    expect(r.decision).toBe('approve');
    expect(['A', 'B']).toContain(r.riskBand);
    expect(r.recommendedDiscountRate).toBeLessThan(0.05);
    expect(r.creditScore).toBeGreaterThanOrEqual(70);
  });

  it('declines a weak, concentrated buyer at a high rate', () => {
    const r = scoreInvoice(invoice, weakBuyer, concentrated);
    expect(r.decision).toBe('decline');
    expect(r.riskBand).toBe('D');
    expect(r.recommendedDiscountRate).toBeGreaterThan(0.05);
  });

  it('always prices a stronger buyer below a weaker one', () => {
    const s = scoreInvoice(invoice, strongBuyer, diversified);
    const w = scoreInvoice(invoice, weakBuyer, concentrated);
    expect(s.recommendedDiscountRate).toBeLessThan(w.recommendedDiscountRate);
    expect(s.creditScore).toBeGreaterThan(w.creditScore);
  });

  it('emits a human-readable rationale that names the composite score', () => {
    const r = scoreInvoice(invoice, strongBuyer, diversified);
    expect(r.rationale.length).toBeGreaterThanOrEqual(4);
    expect(r.rationale.join(' ')).toContain('Composite');
  });

  it('never prices outside the configured rate bounds', () => {
    const r = scoreInvoice({ ...invoice, tenorDays: 3650 }, weakBuyer, concentrated);
    expect(r.recommendedDiscountRate).toBeLessThanOrEqual(defaultConfig.maxRate);
    expect(r.recommendedDiscountRate).toBeGreaterThanOrEqual(defaultConfig.minRate);
  });
});
