import { RiskScorer } from './RiskScorer';
import { User, Transaction } from '../core/models';
import { RiskScore } from '../core/types';

export class MerchantCategoryScorer implements RiskScorer {
  // High-risk MCCs (e.g., 7995 = Betting/Casino)
  private readonly highRiskMccs = new Set(['7995', '6051', '6012']);

  evaluate(user: User, txn: Transaction): RiskScore {
    // Fetch merchant details (mocking it here since txn only has merchantId)
    // Assuming merchant is somehow resolved. We'll simulate based on ID for now.
    // In real scenario, we'd inject a MerchantRepository.
    
    // Simulating MCC check
    if (txn.merchantId.includes('CASINO')) {
      return { score: 95, isAcceptable: false, reason: 'High-risk Merchant Category (Betting)' };
    }
    
    return { score: 5, isAcceptable: true, reason: 'Safe Merchant Category' };
  }
}
