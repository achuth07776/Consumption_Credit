import { LimitEvaluator } from './LimitEvaluator';
import { CreditLine, User } from '../core/models';

export class LimitIncreaseService {
  private evaluators: LimitEvaluator[];

  constructor(evaluators: LimitEvaluator[]) {
    this.evaluators = evaluators;
  }

  evaluateAndIncrease(user: User, creditLine: CreditLine): void {
    console.log(`[LimitIncreaseService] Running batch job for user ${user.id}`);
    
    const isEligible = this.evaluators.every(evaluator => evaluator.isEligibleForIncrease(user));
    
    if (isEligible) {
      const oldLimit = creditLine.totalLimit;
      const increase = oldLimit * 0.2; // 20% increase
      
      creditLine.totalLimit += increase;
      creditLine.availableLimit += increase;
      
      console.log(`[LimitIncreaseService] Limit increased for user ${user.id}. Old: ${oldLimit}, New: ${creditLine.totalLimit}`);
    } else {
      console.log(`[LimitIncreaseService] User ${user.id} not eligible for limit increase.`);
    }
  }
}
