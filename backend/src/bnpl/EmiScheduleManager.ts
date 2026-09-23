import { Transaction } from '../core/models';
import { LedgerService } from '../billing/LedgerService';
import { EmiCalculator } from './EmiCalculator';
import { TransactionConverter } from './TransactionConverter';

export class EmiScheduleManager {
  private ledger: LedgerService;
  private calculator: EmiCalculator;
  private converter: TransactionConverter;

  constructor(ledger: LedgerService, calculator: EmiCalculator, converter: TransactionConverter) {
    this.ledger = ledger;
    this.calculator = calculator;
    this.converter = converter;
  }

  convertToEmi(txn: Transaction, tenureMonths: number, annualRate: number): void {
    console.log(`[EmiScheduleManager] Attempting to convert txn ${txn.id} to ${tenureMonths} month EMI`);

    if (!this.converter.canConvert(txn)) {
      throw new Error('Transaction is not eligible for BNPL conversion.');
    }

    // A real system would ensure we have explicit Consent via ConsentManager for this action

    const schedule = this.calculator.calculate(txn.amount, annualRate, tenureMonths);
    console.log(`[EmiScheduleManager] EMI Schedule calculated:`, schedule);

    // In a real system, we'd record these future dues in the ledger or a dedicated BNPL Schedule table
    // For now, we simulate recording the first EMI
    this.ledger.recordDebit(txn.userId, txn.creditLineId || 'UNKNOWN', schedule[0]!, `${txn.id}-EMI-1`);
    
    console.log(`[EmiScheduleManager] Txn ${txn.id} successfully converted to BNPL.`);
  }
}
