import { Transaction, User } from '../core/models';

export interface LenderResponse {
  success: boolean;
  reason?: string;
  lenderId: string;
}

export interface LenderGateway {
  authorize(txn: Transaction, user: User): Promise<LenderResponse>;
}
