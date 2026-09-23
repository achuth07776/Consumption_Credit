import { Transaction } from '../core/models';
import { TransactionStatus } from '../core/types';

export interface SettlementGateway {
  process(txn: Transaction): TransactionStatus;
}
