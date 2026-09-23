import { Transaction, CreditLine, User } from '../core/models';
import { LenderGateway, LenderResponse } from './LenderGateway';
import { LenderPreferenceService } from './LenderPreferenceService';
import { ConsentManager, ActionType } from '../consent/ConsentManager';

export class MultiLenderOrchestrator {
  private preferenceService: LenderPreferenceService;
  private lenderGateways: Map<string, LenderGateway>;
  private consentManager: ConsentManager;

  constructor(preferenceService: LenderPreferenceService, lenderGateways: Map<string, LenderGateway>, consentManager: ConsentManager) {
    this.preferenceService = preferenceService;
    this.lenderGateways = lenderGateways;
    this.consentManager = consentManager;
  }

  async authorize(txn: Transaction, userCreditLines: CreditLine[], user: User): Promise<LenderResponse> {
    const preferredLines = this.preferenceService.getPreferredLenders(userCreditLines);

    if (preferredLines.length === 0) {
      return { success: false, reason: 'No active credit lines available', lenderId: '' };
    }

    for (const line of preferredLines) {
      if (txn.amount > line.availableLimit) {
        console.log(`[Orchestrator] Skipping lender ${line.lenderId} due to insufficient limit`);
        continue;
      }

      const gateway = this.lenderGateways.get(line.lenderId);
      if (!gateway) {
        console.warn(`[Orchestrator] No gateway configured for lender ${line.lenderId}`);
        continue;
      }

      console.log(`[Orchestrator] Attempting authorization with lender ${line.lenderId}`);
      try {
        const response = await gateway.authorize(txn, user);
        if (response.success) {
          console.log(`[Orchestrator] Authorization successful with lender ${line.lenderId}. Checking explicit consent...`);
          
          // Waterfall Step: Explicit Consent Check for the chosen lender
          const hasConsent = this.consentManager.verifyConsent(user, ActionType.LENDER_SPECIFIC_CONSENT, line.lenderId);
          if (!hasConsent) {
            console.warn(`[Orchestrator] Transaction halted. User lacks LENDER_SPECIFIC_CONSENT for ${line.lenderId}`);
            return { success: false, reason: `User has not provided consent for lender ${line.lenderId}`, lenderId: line.lenderId };
          }
          
          console.log(`[Orchestrator] Explicit consent verified for ${line.lenderId}. Payment proceeding.`);
          return response;
        } else {
          console.warn(`[Orchestrator] Lender ${line.lenderId} declined: ${response.reason}. Falling back...`);
        }
      } catch (error) {
        console.error(`[Orchestrator] Lender ${line.lenderId} timeout/error. Falling back...`);
      }
    }

    return { success: false, reason: 'All available lenders declined or timed out', lenderId: '' };
  }
}
