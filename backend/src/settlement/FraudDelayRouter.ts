import { Transaction } from '../core/models';
import { TransactionStatus } from '../core/types';
import { SettlementGateway } from './SettlementGateway';
import { InstantSettler } from './InstantSettler';
import { DelayedSettler } from './DelayedSettler';

export class FraudDelayRouter {
  private instantSettler: InstantSettler;
  private delayedSettler: DelayedSettler;

  constructor(instantSettler: InstantSettler, delayedSettler: DelayedSettler) {
    this.instantSettler = instantSettler;
    this.delayedSettler = delayedSettler;
  }

  route(txn: Transaction): TransactionStatus {
    console.log(`[FraudDelayRouter] Routing settlement for txn ${txn.id} with status ${txn.status}`);
    
    if (txn.status === TransactionStatus.HIGH_RISK) {
      console.warn(`[FraudDelayRouter] High risk detected, routing to DelayedSettler`);
      return this.delayedSettler.process(txn);
    }
    
    return this.instantSettler.process(txn);
  }
}
