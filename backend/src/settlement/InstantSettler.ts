import { SettlementGateway } from './SettlementGateway';
import { Transaction } from '../core/models';
import { TransactionStatus } from '../core/types';

export class InstantSettler implements SettlementGateway {
  process(txn: Transaction): TransactionStatus {
    console.log(`[InstantSettler] Moving funds immediately for txn ${txn.id} to merchant ${txn.merchantId}`);
    // Mock API call to bank to move funds
    return TransactionStatus.SETTLED;
  }
}
