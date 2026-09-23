import { LimitEvaluator } from './LimitEvaluator';
import { User } from '../core/models';

export class RepaymentHistoryAnalyzer implements LimitEvaluator {
  isEligibleForIncrease(user: User): boolean {
    // In reality, this checks the LedgerService/Statement DB
    // Simulating logic: if user has never missed a payment in last 6 months, return true
    console.log(`[RepaymentHistoryAnalyzer] Checking 6-month history for user ${user.id}`);
    
    // Mocking positive behavior
    const hasGoodHistory = true; 
    
    return hasGoodHistory;
  }
}
