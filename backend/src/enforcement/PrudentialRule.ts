import { Transaction } from '../core/models';

export interface RuleResult {
  passed: boolean;
  reason?: string;
}

import { User } from '../core/models';

export interface PrudentialRule {
  evaluate(context: Transaction, user: User): RuleResult;
}
