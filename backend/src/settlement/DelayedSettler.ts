import { SettlementGateway } from './SettlementGateway';
import { Transaction } from '../core/models';
import { TransactionStatus } from '../core/types';

export class DelayedSettler implements SettlementGateway {
  process(txn: Transaction): TransactionStatus {
    console.log(`[DelayedSettler] Escrowing funds for high-risk txn ${txn.id}`);
    // Mock API call to place funds in a pending/escrow account
    return TransactionStatus.PENDING_SETTLEMENT;
  }
}
