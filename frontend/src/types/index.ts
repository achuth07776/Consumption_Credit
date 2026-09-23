export type TransactionStatus = 'INITIATED' | 'PENDING' | 'APPROVED' | 'DECLINED' | 'SETTLED' | 'CANCELLED';

export type PaymentMode = 'OWN_MONEY' | 'CREDIT_LINE';

export interface User {
  id: string;
  name: string;
  vpa: string;
}

export interface CreditHealth {
  behaviorScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendedLimit: number;
  currentLimit: number;
  hasOverdueBills?: boolean;
  cibilScore?: number;
  factors: string[];
}

export interface LenderOffer {
  id: string;
  name: string;
  type: 'BANK' | 'NBFC';
  approvedLimit: number;
  interestRate: number; // e.g. 14.5 for 14.5%
  processingFee: number;
}

export interface SplitAllocation {
  creditLineId: string;
  amount: number;
  interestAmount: number;
}

export interface CreditLine {
  id: string;
  totalLimit: number;
  availableLimit: number;
  utilizedLimit: number;
  health: CreditHealth;
  lenderName?: string;
  interestRate?: number;
  nextPaymentDue?: {
    amount: number;
    date: string;
  };
  hasRequestedEmergency?: boolean;
  lastEmergencyRequestDate?: string;
  emergencySecurityType?: string;
  emergencySecurityDetails?: string;
}

export interface Transaction {
  id: string;
  merchant: string;
  amount: number;
  mode: PaymentMode;
  date: string;
  status: TransactionStatus;
  lender?: string;
  interestRate?: number;
  timeline?: { status: string; timestamp: string }[];
  splits?: { lenderName: string; amount: number }[];
}

export interface StatementItem {
  id: string;
  type: string; // 'Credit Line', 'BNPL', etc.
  amount: number;
  description?: string;
  transactionId?: string;
  lenderName?: string;
}

export interface Statement {
  id: string;
  totalAmountDue: number;
  minAmountDue: number;
  dueDate: string;
  amountPaid?: number;
  items: StatementItem[];
}

export interface ConsentRecord {
  id: string;
  purpose: string;
  description: string;
  timestamp: string;
  status: 'GRANTED' | 'REVOKED';
}

export interface RiskLogRecord {
  id: string;
  vpa: string;
  date: string;
  behaviorScore: number;
  bankA_status: 'APPROVED' | 'REJECTED' | 'SKIPPED';
  bankB_status: 'APPROVED' | 'REJECTED' | 'SKIPPED';
  bankC_status: 'APPROVED' | 'REJECTED' | 'SKIPPED' | 'CONSENT_MISSING';
  finalOutcome: 'GRANTED' | 'DENIED';
  reason?: string;
}

export interface LimitHistoryRecord {
  id: string;
  previousLimit: number;
  newLimit: number;
  date: string;
  reason: string;
}
