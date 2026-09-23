import { PrudentialRule, RuleResult } from './PrudentialRule';
import { Transaction, User } from '../core/models';

export class OverduePaymentRule implements PrudentialRule {
  evaluate(txn: Transaction, user: User): RuleResult {
    if (user.hasOverdueBills) {
      return { 
        passed: false, 
        reason: 'Payment Blocked: User has delayed past payments. Must clear outstanding dues before using credit.' 
      };
    }
    return { passed: true };
  }
}
