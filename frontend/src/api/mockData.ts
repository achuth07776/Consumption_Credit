import { CreditLine, Transaction, Statement, ConsentRecord, LimitHistoryRecord } from '../types';

export let mockCreditLines: CreditLine[] = (() => {
  try {
    const stored = localStorage.getItem('super_money_mock_credit');
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return [];
})();

export const resetCreditLine = () => {
  mockCreditLines = [];
  localStorage.removeItem('super_money_mock_credit');
};

export const updateMockCreditLines = (lines: CreditLine[]) => {
  mockCreditLines = lines;
  localStorage.setItem('super_money_mock_credit', JSON.stringify(mockCreditLines));
};

export const initializeCreditLines = (banks: { name: string; approvedLimit: number; interestRate: number }[], score: number) => {
  const newLines = banks.map((bank, idx) => ({
    id: `CL-${12345 + idx}`,
    userId: 'U1',
    totalLimit: bank.approvedLimit,
    availableLimit: bank.approvedLimit,
    utilizedLimit: 0,
    lenderName: bank.name,
    interestRate: bank.interestRate,
    health: {
      behaviorScore: Math.min(90, score),
      riskLevel: (Math.min(90, score) >= 80 ? 'LOW' : Math.min(90, score) >= 60 ? 'MEDIUM' : 'HIGH') as 'LOW' | 'MEDIUM' | 'HIGH',
      recommendedLimit: bank.approvedLimit * 1.2,
      currentLimit: bank.approvedLimit,
      factors: [
        'High daily transaction accuracy',
        'Strong past loan fulfilling history',
        'Low failed transaction rate',
        'Regular bill payments'
      ]
    },
    nextPaymentDue: {
      amount: 0,
      date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15).toISOString().split('T')[0]
    }
  }));
  updateMockCreditLines(newLines);
};

export const mockTransactions: Transaction[] = [
  {
    id: 'TXN-1001',
    amount: 850.00,
    merchant: 'Swiggy',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
    status: 'SETTLED',
    mode: 'CREDIT_LINE'
  },
  {
    id: 'TXN-1002',
    amount: 1250.00,
    merchant: 'Amazon India',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    status: 'SETTLED',
    mode: 'CREDIT_LINE'
  },
  {
    id: 'TXN-1003',
    amount: 150.00,
    merchant: 'Starbucks',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    status: 'SETTLED',
    mode: 'OWN_MONEY'
  },
  {
    id: 'TXN-1004',
    amount: 4500.00,
    merchant: 'Croma Electronics',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    status: 'PENDING',
    mode: 'CREDIT_LINE'
  }
];

export const mockStatement: Statement = {
  id: 'STMT-CURRENT',
  totalAmountDue: 0.00,
  minAmountDue: 0.00,
  dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15).toISOString().split('T')[0],
  items: []
};

export const mockConsentHistory: ConsentRecord[] = [
  {
    id: 'CON-1',
    purpose: 'Credit Line Usage',
    description: 'Allow consumption of credit for UPI payments',
    timestamp: '2026-01-15T10:00:00Z',
    status: 'GRANTED'
  }
];

export const mockLimitHistory: LimitHistoryRecord[] = [
  { id: 'LH-1', previousLimit: 2000, newLimit: 3000, date: '2025-06-01', reason: 'Completed 3 consecutive on-time repayments' },
  { id: 'LH-2', previousLimit: 3000, newLimit: 5000, date: '2026-01-01', reason: 'Limit increased due to healthy credit utilization' }
];

export const mockRiskLogs: any[] = [
  {
    id: 'RL-1004',
    vpa: 'fraudster@axis',
    date: '2026-08-16T10:05:00Z',
    behaviorScore: 0,
    bankA_status: 'SKIPPED',
    bankB_status: 'SKIPPED',
    bankC_status: 'SKIPPED',
    finalOutcome: 'DENIED',
    reason: 'KYC Verification failed. PAN mismatch.'
  },
  {
    id: 'RL-1005',
    vpa: 'badcredit@hdfc',
    date: '2026-08-16T11:15:00Z',
    behaviorScore: 0,
    bankA_status: 'SKIPPED',
    bankB_status: 'SKIPPED',
    bankC_status: 'SKIPPED',
    finalOutcome: 'DENIED',
    reason: 'Rejected due to low bureau score (CIBIL 550).'
  },
  {
    id: 'RL-1001',
    vpa: 'defaulter@axis',
    date: '2026-08-15T09:12:00Z',
    behaviorScore: 42,
    bankA_status: 'REJECTED',
    bankB_status: 'REJECTED',
    bankC_status: 'REJECTED',
    finalOutcome: 'DENIED',
    reason: 'Severe past delinquencies detected.'
  },
  {
    id: 'RL-1002',
    vpa: 'newuser@ybl',
    date: '2026-08-15T14:30:00Z',
    behaviorScore: 78,
    bankA_status: 'REJECTED',
    bankB_status: 'REJECTED',
    bankC_status: 'CONSENT_MISSING',
    finalOutcome: 'DENIED',
    reason: 'Bank C approved, but user declined data sharing consent.'
  },
  {
    id: 'RL-1003',
    vpa: 'highrisk@sbi',
    date: '2026-08-16T08:45:00Z',
    behaviorScore: 84,
    bankA_status: 'REJECTED',
    bankB_status: 'REJECTED',
    bankC_status: 'APPROVED',
    finalOutcome: 'GRANTED',
    reason: 'Fallback to Bank C successful.'
  }
];
