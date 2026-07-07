export interface Contract {
  contractId: string;
  [k: string]: unknown;
}

export interface Groups {
  [template: string]: Contract[];
}

export interface ScoringResult {
  creditScore: number;
  riskBand: 'A' | 'B' | 'C' | 'D';
  decision: 'approve' | 'review' | 'decline';
  recommendedDiscountRate: number;
  annualizedRate: number;
  subScores: { reliability: number; concentration: number; dilution: number; size: number };
  rationale: string[];
}

export interface Recommendation {
  invoiceCid: string;
  description: string;
  amount: number;
  result: ScoringResult;
  memo: string;
}

export interface RoleView {
  role: string;
  displayName: string;
  party: string;
  groups: Groups;
  recommendations?: Recommendation[];
}

export interface AuctionBid {
  bidder: string;
  rate: number;
  faceAmount: number;
}

export interface AuctionView {
  viewer: string;
  displayName: string;
  subtitle: string;
  party: string;
  invoice: { amount: number; description: string; status: string } | null;
  visibleBids: AuctionBid[];
  offer: { rate: number; bidder: string } | null;
  receivable: { faceAmount: number; description: string } | null;
  totalContracts: number;
}

export interface AuctionBidderMeta {
  key: string;
  name: string;
  appetite: string;
}

export interface AuctionMeta {
  invoiceCid: string;
  amount: number;
  bidders: AuctionBidderMeta[];
}
