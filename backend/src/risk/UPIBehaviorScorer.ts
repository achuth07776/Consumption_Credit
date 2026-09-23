import { RiskScorer } from './RiskScorer';
import { User, Transaction } from '../core/models';
import { RiskScore } from '../core/types';

export class UPIBehaviorScorer implements RiskScorer {
  evaluate(user: User, txn: Transaction): RiskScore {
    // In a real system, this would fetch user's transaction history
    // and analyze frequency, value, and diversity of merchants.
    // Here we simulate it.
    
    // For simulation, let's say a small transaction amount is low risk.
    if (txn.amount < 500) {
      return { score: 10, isAcceptable: true, reason: 'Low value transaction' };
    } else if (txn.amount < 5000) {
      return { score: 40, isAcceptable: true, reason: 'Medium value transaction' };
    } else {
      return { score: 80, isAcceptable: false, reason: 'High value transaction without sufficient UPI history' };
    }
  }
}
