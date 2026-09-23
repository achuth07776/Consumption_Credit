import { LedgerService } from './LedgerService';
import { Statement } from './StatementGenerator';

export class RepaymentRouter {
  private ledger: LedgerService;

  constructor(ledger: LedgerService) {
    this.ledger = ledger;
  }

  processRepayment(userId: string, amount: number, statement: Statement): void {
    console.log(`[RepaymentRouter] Processing repayment of ${amount} for user ${userId}`);
    
    let remainingAmount = amount;
    
    // Proportional repayment routing
    for (const [lenderId, amountDue] of Object.entries(statement.lenderBreakdown)) {
      if (amountDue > 0 && remainingAmount > 0) {
        const proportion = amountDue / statement.totalAmountDue;
        const allocation = Math.min(amountDue, remainingAmount * proportion);
        
        this.ledger.recordCredit(userId, lenderId, allocation);
        remainingAmount -= allocation;
      }
    }
    
    if (remainingAmount > 0) {
      console.warn(`[RepaymentRouter] Repayment exceeded total amount due. Extra ${remainingAmount} left unallocated (or kept as positive balance).`);
    }
  }
}
