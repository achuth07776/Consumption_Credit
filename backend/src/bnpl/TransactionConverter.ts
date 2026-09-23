import { Transaction } from '../core/models';
import { TransactionStatus } from '../core/types';

export class TransactionConverter {
  private readonly MIN_AMOUNT_FOR_EMI = 3000;
  private readonly MAX_DAYS_SINCE_TXN = 15;

  canConvert(txn: Transaction): boolean {
    if (txn.status !== TransactionStatus.SETTLED) {
      console.warn(`[TransactionConverter] Txn ${txn.id} is not settled.`);
      return false;
    }
    
    if (txn.amount < this.MIN_AMOUNT_FOR_EMI) {
      console.warn(`[TransactionConverter] Txn ${txn.id} is below minimum amount for EMI.`);
      return false;
    }

    const daysSince = (Date.now() - txn.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > this.MAX_DAYS_SINCE_TXN) {
      console.warn(`[TransactionConverter] Txn ${txn.id} is too old to convert.`);
      return false;
    }

    return true;
  }
}
