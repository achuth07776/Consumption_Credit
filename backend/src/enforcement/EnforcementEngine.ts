import { Transaction, User } from '../core/models';
import { PrudentialRule } from './PrudentialRule';

export class EnforcementEngine {
  private rules: PrudentialRule[];

  constructor(rules: PrudentialRule[]) {
    this.rules = rules;
  }

  evaluateAll(txn: Transaction, user: User): void {
    console.log(`[EnforcementEngine] Running prudential rules for txn ${txn.id}`);
    
    for (const rule of this.rules) {
      const result = rule.evaluate(txn, user);
      if (!result.passed) {
        console.error(`[EnforcementEngine] Rule failed: ${result.reason}`);
        // A failure here is an absolute block, regardless of lender willingness
        throw new Error(`Prudential Norm Violation: ${result.reason}`);
      }
    }
    
    console.log(`[EnforcementEngine] All prudential rules passed for txn ${txn.id}`);
  }
}
