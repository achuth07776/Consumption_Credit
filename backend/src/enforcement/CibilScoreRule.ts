import { PrudentialRule, RuleResult } from './PrudentialRule';
import { Transaction, User } from '../core/models';

export class CibilScoreRule implements PrudentialRule {
  private readonly MIN_SCORE_THRESHOLD = 600;

  evaluate(txn: Transaction, user: User): RuleResult {
    // If the user has a CIBIL score available, evaluate it.
    // (If not available, we rely on the internal UPI behavior risk engine).
    if (user.cibilScore !== undefined && user.cibilScore < this.MIN_SCORE_THRESHOLD) {
      return { 
        passed: false, 
        reason: `Payment Blocked: User CIBIL score (${user.cibilScore}) is below the required threshold of ${this.MIN_SCORE_THRESHOLD}.` 
      };
    }
    return { passed: true };
  }
}
