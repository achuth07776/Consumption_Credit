import { Transaction } from '../core/models';
import { ConsentManager, ActionType } from './ConsentManager';

export class ConsentRequiredException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsentRequiredException';
  }
}

export class ConsentValidator {
  private consentManager: ConsentManager;

  constructor(consentManager: ConsentManager) {
    this.consentManager = consentManager;
  }

  validate(txn: Transaction, user: any, merchantMcc?: string): void {
    console.log(`[ConsentValidator] Intercepting transaction ${txn.id}`);
    
    const hasConsent = this.consentManager.verifyConsent(user, ActionType.CREDIT_LINE_USAGE, merchantMcc);
    
    if (!hasConsent) {
      console.warn(`[ConsentValidator] Consent missing for user ${user.id}`);
      throw new ConsentRequiredException(`User ${user.id} has not consented to CREDIT_LINE_USAGE for MCC ${merchantMcc || 'ALL'}`);
    }
    
    console.log(`[ConsentValidator] Consent verified for transaction ${txn.id}`);
  }
}
