import { LimitEvaluator } from './LimitEvaluator';
import { User } from '../core/models';

export class UtilizationAnalyzer implements LimitEvaluator {
  isEligibleForIncrease(user: User): boolean {
    // In reality, this queries the current CreditLine available limit vs total limit
    console.log(`[UtilizationAnalyzer] Checking credit utilization for user ${user.id}`);
    
    // Mocking: Assume user utilizes >50% but pays on time
    const utilization = 0.6; // 60%

    return utilization > 0.5;
  }
}
