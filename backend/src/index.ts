import express from 'express';
import { User, Transaction, CreditLine } from './core/models';
import { TransactionStatus } from './core/types';
import { ConsentLedger } from './consent/ConsentLedger';
import { ConsentValidator } from './consent/ConsentValidator';

import { AggregateRiskEngine } from './risk/AggregateRiskEngine';
import { UPIBehaviorScorer } from './risk/UPIBehaviorScorer';
import { MerchantCategoryScorer } from './risk/MerchantCategoryScorer';
import { EnforcementEngine } from './enforcement/EnforcementEngine';
import { MaxExposureRule } from './enforcement/MaxExposureRule';
import { CoolingOffRule } from './enforcement/CoolingOffRule';
import { OverduePaymentRule } from './enforcement/OverduePaymentRule';
import { CibilScoreRule } from './enforcement/CibilScoreRule';
import { LenderGateway, LenderResponse } from './orchestration/LenderGateway';
import { LenderPreferenceService } from './orchestration/LenderPreferenceService';
import { MultiLenderOrchestrator } from './orchestration/MultiLenderOrchestrator';
import { InstantSettler } from './settlement/InstantSettler';
import { DelayedSettler } from './settlement/DelayedSettler';
import { FraudDelayRouter } from './settlement/FraudDelayRouter';
import { LedgerService } from './billing/LedgerService';
import { TransactionService } from './api/TransactionService';
import bodyParser from 'body-parser';

import { ActionType, ConsentManager } from './consent/ConsentManager';
// --- MOCK LENDERS ---
class MockBankALender implements LenderGateway {
  async authorize(txn: Transaction, user: User): Promise<LenderResponse> {
    const score = user.upiBehaviorScore || 0;
    if (score < 90) {
      return { success: false, reason: `User score ${score} is below Bank A strict threshold (90)`, lenderId: 'LENDER_BANK_A' };
    }
    return { success: true, lenderId: 'LENDER_BANK_A' };
  }
}
class MockBankBLender implements LenderGateway {
  async authorize(txn: Transaction, user: User): Promise<LenderResponse> {
    const score = user.upiBehaviorScore || 0;
    if (score < 85) {
      return { success: false, reason: `User score ${score} is below Bank B threshold (85)`, lenderId: 'LENDER_BANK_B' };
    }
    return { success: true, lenderId: 'LENDER_BANK_B' };
  }
}
class MockBankCLender implements LenderGateway {
  async authorize(txn: Transaction, user: User): Promise<LenderResponse> {
    // Bank C is the fallback lender for thin-file users. It accepts all scores but relies on explicit consent.
    return { success: true, lenderId: 'LENDER_BANK_C' };
  }
}

// --- DEPENDENCY INJECTION / WIRING ---
const consentLedger = new ConsentLedger();
const consentValidator = new ConsentValidator(consentLedger);
const upiScorer = new UPIBehaviorScorer();
const mccScorer = new MerchantCategoryScorer();
const riskEngine = new AggregateRiskEngine([upiScorer, mccScorer]);

const maxExposure = new MaxExposureRule();
const coolingOff = new CoolingOffRule();
const overduePayment = new OverduePaymentRule();
const cibilScore = new CibilScoreRule();
const enforcementEngine = new EnforcementEngine([maxExposure, coolingOff, overduePayment, cibilScore]);

const gateways = new Map<string, LenderGateway>();
gateways.set('LENDER_BANK_A', new MockBankALender());
gateways.set('LENDER_BANK_B', new MockBankBLender());
gateways.set('LENDER_BANK_C', new MockBankCLender());
const preferenceService = new LenderPreferenceService();
const orchestrator = new MultiLenderOrchestrator(preferenceService, gateways, consentLedger);
const instantSettler = new InstantSettler();
const delayedSettler = new DelayedSettler();
const fraudDelayRouter = new FraudDelayRouter(instantSettler, delayedSettler);
const ledgerService = new LedgerService();

const transactionService = new TransactionService(
  consentValidator,
  riskEngine,
  enforcementEngine,
  orchestrator,
  fraudDelayRouter,
  ledgerService
);

// --- MOCK DB ---
// NOTE: Set hasOverdueBills: true or cibilScore: 500 to simulate blocks
const mockUser: User = { 
  id: 'U1', 
  name: 'John Doe', 
  vpa: 'john@ybl', 
  phone: '9999999999',
  hasOverdueBills: false,
  cibilScore: 750,
  upiBehaviorScore: 82 // Will trigger Bank A and Bank B rejection, fallback to Bank C
};
consentLedger.grantConsent(mockUser, ActionType.CREDIT_LINE_USAGE); // Grant initial consent
consentLedger.grantConsent(mockUser, ActionType.LENDER_SPECIFIC_CONSENT, 'LENDER_BANK_C'); // Grant specific consent for Bank C

const userCreditLines: CreditLine[] = [
  { id: 'CL1', userId: 'U1', lenderId: 'LENDER_BANK_A', isActive: true, availableLimit: 50000, totalLimit: 50000, interestRate: 15 },
  { id: 'CL2', userId: 'U1', lenderId: 'LENDER_BANK_B', isActive: true, availableLimit: 30000, totalLimit: 30000, interestRate: 16 },
  { id: 'CL3', userId: 'U1', lenderId: 'LENDER_BANK_C', isActive: true, availableLimit: 10000, totalLimit: 10000, interestRate: 18 }
];

import { aaRouter } from './api/AARouter';
import cors from 'cors';

// --- EXPRESS APP ---
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Mount Account Aggregator endpoints
app.use('/api/v1/aa', aaRouter);

app.post('/api/v1/pay', async (req, res) => {
  const { amount, merchantId } = req.body;
  
  if (!amount || !merchantId) {
    return res.status(400).json({ error: 'amount and merchantId are required' });
  }

  const txn: Transaction = {
    id: `TXN-${Math.floor(Math.random() * 10000)}`,
    userId: mockUser.id,
    merchantId,
    amount,
    timestamp: new Date(),
    status: TransactionStatus.INITIATED
  };

  const processedTxn = await transactionService.processUPIPayment(mockUser, txn, userCreditLines);
  
  res.json({
    transactionId: processedTxn.id,
    status: processedTxn.status,
    amount: processedTxn.amount,
    merchantId: processedTxn.merchantId,
    lenderUsed: processedTxn.creditLineId || null
  });
});

app.get('/api/v1/ledger', (req, res) => {
  const entries = ledgerService.getEntriesForUser(mockUser.id);
  res.json({ balance: ledgerService.getOutstandingBalance(mockUser.id), entries });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n--- SUPER.MONEY CONSUMPTION CREDIT SERVER ---`);
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Test payment: curl -X POST http://localhost:${PORT}/api/v1/pay -H "Content-Type: application/json" -d "{\\"amount\\": 350, \\"merchantId\\": \\"M-SWIGGY-123\\"}"`);
  console.log(`Test ledger: curl http://localhost:${PORT}/api/v1/ledger\n`);
});
