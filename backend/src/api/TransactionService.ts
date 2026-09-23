import { Transaction, User, CreditLine } from '../core/models';
import { TransactionStatus } from '../core/types';
import { ConsentValidator, ConsentRequiredException } from '../consent/ConsentValidator';
import { AggregateRiskEngine } from '../risk/AggregateRiskEngine';
import { EnforcementEngine } from '../enforcement/EnforcementEngine';
import { MultiLenderOrchestrator } from '../orchestration/MultiLenderOrchestrator';
import { FraudDelayRouter } from '../settlement/FraudDelayRouter';
import { LedgerService } from '../billing/LedgerService';

export class TransactionService {
  constructor(
    private consentValidator: ConsentValidator,
    private riskEngine: AggregateRiskEngine,
    private enforcementEngine: EnforcementEngine,
    private orchestrator: MultiLenderOrchestrator,
    private settlementRouter: FraudDelayRouter,
    private ledgerService: LedgerService
  ) {}

  async processUPIPayment(user: User, txn: Transaction, userCreditLines: CreditLine[]): Promise<Transaction> {
    console.log(`\n=== Starting UPI Payment ${txn.id} for ${txn.amount} INR ===`);
    
    try {
      // 1. Consent Layer
      this.consentValidator.validate(txn, user);

      // 2. Risk Engine Scoring
      txn = this.riskEngine.evaluate(user, txn);
      if (txn.status === TransactionStatus.DECLINED) {
        return txn;
      }

      // 3. Prudential Norms Enforcement
      this.enforcementEngine.evaluateAll(txn, user);

      // 4. Multi-Lender Orchestration
      const authResponse = await this.orchestrator.authorize(txn, userCreditLines, user);
      if (!authResponse.success) {
        txn.status = TransactionStatus.DECLINED;
        console.warn(`[TransactionService] Lenders declined: ${authResponse.reason}`);
        return txn;
      }
      txn.creditLineId = authResponse.lenderId; // Link the transaction to the chosen lender

      // 5. Fraud-Safe Settlement
      const settlementStatus = this.settlementRouter.route(txn);
      txn.status = settlementStatus;

      // 6. Billing/Ledger
      if (settlementStatus === TransactionStatus.SETTLED) {
        this.ledgerService.recordDebit(user.id, txn.creditLineId, txn.amount, txn.id);
      }

      console.log(`=== Completed UPI Payment ${txn.id} with status ${txn.status} ===\n`);
      return txn;

    } catch (error: any) {
      console.error(`[TransactionService] Error processing txn ${txn.id}:`, error.message);
      txn.status = TransactionStatus.DECLINED;
      return txn;
    }
  }
}
