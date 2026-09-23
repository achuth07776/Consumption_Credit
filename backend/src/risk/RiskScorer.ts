import { User, Transaction } from '../core/models';
import { RiskScore } from '../core/types';

export interface RiskScorer {
  evaluate(user: User, txn: Transaction): RiskScore;
}
