import { PrudentialRule, RuleResult } from './PrudentialRule';
import { Transaction, User } from '../core/models';

export class CoolingOffRule implements PrudentialRule {
  private readonly COOLING_OFF_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly LARGE_TXN_THRESHOLD = 20000; // 20k INR

  evaluate(txn: Transaction, user: User): RuleResult {
    if (txn.amount < this.LARGE_TXN_THRESHOLD) {
      return { passed: true }; // Rule doesn't apply to small transactions
    }

    // Mocking fetching the last large transaction timestamp for the user
    // In reality, this queries the Ledger or Transaction History DB
    const lastLargeTxnTime = Date.now() - (12 * 60 * 60 * 1000); // 12 hours ago (Mock)

    if (Date.now() - lastLargeTxnTime < this.COOLING_OFF_MS) {
      return { 
        passed: false, 
        reason: 'Cooling-off period active due to a recent large drawdown.'
      };
    }

    return { passed: true };
  }
}
