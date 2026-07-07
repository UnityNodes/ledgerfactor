import { scoreInvoice } from './scoring/rules';
import { explainScore } from './scoring/explain';
import { BuyerCreditProfile, InvoiceInput, PortfolioContext } from './scoring/types';

const scenarios: { label: string; invoice: InvoiceInput; buyer: BuyerCreditProfile; portfolio: PortfolioContext }[] = [
  {
    label: 'Strong, diversified buyer',
    invoice: { amount: 100000, tenorDays: 60, buyer: 'Globex' },
    buyer: { buyer: 'Globex', invoicesConfirmed: 12, onTimePaymentRate: 0.96, avgDaysLate: 2, disputeRate: 0.01 },
    portfolio: { totalReceivables: 900000, buyerReceivables: 100000 },
  },
  {
    label: 'Weak, concentrated buyer',
    invoice: { amount: 100000, tenorDays: 60, buyer: 'Acme' },
    buyer: { buyer: 'Acme', invoicesConfirmed: 2, onTimePaymentRate: 0.5, avgDaysLate: 28, disputeRate: 0.2 },
    portfolio: { totalReceivables: 100000, buyerReceivables: 100000 },
  },
];

const run = async () => {
  for (const s of scenarios) {
    const result = scoreInvoice(s.invoice, s.buyer, s.portfolio);
    console.log(`\n=== ${s.label} ===`);
    console.log(`score=${result.creditScore} band=${result.riskBand} decision=${result.decision} rate=${(result.recommendedDiscountRate * 100).toFixed(2)}%`);
    console.log(await explainScore(result));
  }
};

run();
