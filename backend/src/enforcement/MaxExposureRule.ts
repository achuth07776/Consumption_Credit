import { PrudentialRule, RuleResult } from './PrudentialRule';
import { Transaction, User } from '../core/models';

export class MaxExposureRule implements PrudentialRule {
  private readonly MAX_EXPOSURE_LIMIT = 100000; // 1 Lakh INR

  evaluate(txn: Transaction, user: User): RuleResult {
    // In a real application, we would calculate the sum of all outstanding balances
    // across all credit lines for this user.
    // Here we simulate it.
    const mockOutstandingBalance = 80000;
    
    if (mockOutstandingBalance + txn.amount > this.MAX_EXPOSURE_LIMIT) {
      return { 
        passed: false, 
        reason: `Transaction exceeds maximum exposure limit of ${this.MAX_EXPOSURE_LIMIT}` 
      };
    }

    return { passed: true };
  }
}
