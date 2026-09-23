import { User } from '../core/models';
import { ConsentStatus } from '../core/types';
import { ActionType, ConsentManager } from './ConsentManager';

interface ConsentRecord {
  id: string;
  userId: string;
  action: ActionType;
  merchantMcc?: string;
  status: ConsentStatus;
  timestamp: Date;
}

export class ConsentLedger implements ConsentManager {
  private ledger: ConsentRecord[] = [];

  verifyConsent(user: User, action: ActionType, merchantMcc?: string): boolean {
    console.log(`[ConsentLedger] Verifying consent for user ${user.id}, action ${action}`);
    
    // Find the most recent record for this user and action
    const records = this.ledger
      .filter(r => r.userId === user.id && r.action === action && r.merchantMcc === merchantMcc)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (records.length === 0) {
      return false;
    }

    return records[0]!.status === ConsentStatus.GRANTED;
  }

  grantConsent(user: User, action: ActionType, merchantMcc?: string): void {
    console.log(`[ConsentLedger] Granting consent for user ${user.id}, action ${action}`);
    const record: ConsentRecord = {
      id: Math.random().toString(36).substring(7),
      userId: user.id,
      action,
      status: ConsentStatus.GRANTED,
      timestamp: new Date()
    };
    if (merchantMcc !== undefined) record.merchantMcc = merchantMcc;
    this.ledger.push(record);
  }

  revokeConsent(user: User, action: ActionType, merchantMcc?: string): void {
    console.log(`[ConsentLedger] Revoking consent for user ${user.id}, action ${action}`);
    const record: ConsentRecord = {
      id: Math.random().toString(36).substring(7),
      userId: user.id,
      action,
      status: ConsentStatus.REVOKED,
      timestamp: new Date()
    };
    if (merchantMcc !== undefined) record.merchantMcc = merchantMcc;
    this.ledger.push(record);
  }
}
