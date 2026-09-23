import { RiskScorer } from './RiskScorer';
import { User, Transaction } from '../core/models';
import { RiskScore, TransactionStatus } from '../core/types';

export class AggregateRiskEngine {
  private scorers: RiskScorer[];
  private readonly RISK_THRESHOLD = 75; // Score above this is rejected

  constructor(scorers: RiskScorer[]) {
    this.scorers = scorers;
  }

  evaluate(user: User, txn: Transaction): Transaction {
    console.log(`[RiskEngine] Evaluating transaction ${txn.id} for user ${user.id}`);
    
    let totalScore = 0;
    
    for (const scorer of this.scorers) {
      const result = scorer.evaluate(user, txn);
      console.log(`[RiskEngine] Scorer ${scorer.constructor.name} returned score: ${result.score}, acceptable: ${result.isAcceptable}`);
      
      if (!result.isAcceptable) {
        // Fail closed on any critical rejection
        console.warn(`[RiskEngine] Transaction rejected by ${scorer.constructor.name}: ${result.reason}`);
        return { ...txn, status: TransactionStatus.DECLINED };
      }
      totalScore += result.score;
    }

    const averageScore = totalScore / this.scorers.length;
    console.log(`[RiskEngine] Aggregate Risk Score: ${averageScore}`);

    if (averageScore > this.RISK_THRESHOLD) {
      console.warn(`[RiskEngine] Transaction marked HIGH_RISK (Score: ${averageScore})`);
      return { ...txn, status: TransactionStatus.HIGH_RISK };
    }

    return txn;
  }
}
