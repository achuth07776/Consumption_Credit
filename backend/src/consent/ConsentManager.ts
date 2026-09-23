import { User } from '../core/models';
import { ConsentStatus } from '../core/types';

export enum ActionType {
  CREDIT_LINE_USAGE = 'CREDIT_LINE_USAGE',
  DATA_SHARING = 'DATA_SHARING',
  AUTO_DEBIT_SETUP = 'AUTO_DEBIT_SETUP',
  LENDER_SPECIFIC_CONSENT = 'LENDER_SPECIFIC_CONSENT'
}

export interface ConsentManager {
  verifyConsent(user: User, action: ActionType, merchantMcc?: string): boolean;
  grantConsent(user: User, action: ActionType, merchantMcc?: string): void;
  revokeConsent(user: User, action: ActionType, merchantMcc?: string): void;
}
