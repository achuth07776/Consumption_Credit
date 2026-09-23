import { LedgerService, EntryType, LedgerEntry } from './LedgerService';

export interface Statement {
  userId: string;
  totalAmountDue: number;
  dueDate: Date;
  lenderBreakdown: Record<string, number>;
  entries: LedgerEntry[];
}

export class StatementGenerator {
  private ledger: LedgerService;

  constructor(ledger: LedgerService) {
    this.ledger = ledger;
  }

  generateMonthlyStatement(userId: string, month: number, year: number): Statement {
    console.log(`[StatementGenerator] Generating statement for user ${userId} for ${month}/${year}`);
    const entries = this.ledger.getEntriesForUser(userId)
      .filter(e => e.timestamp.getMonth() === month && e.timestamp.getFullYear() === year);

    const lenderBreakdown: Record<string, number> = {};
    let totalAmountDue = 0;

    entries.forEach(e => {
      const lenderId = e.lenderId || 'UNKNOWN';
      if (!lenderBreakdown[lenderId]) lenderBreakdown[lenderId] = 0;
      if (e.type === EntryType.DEBIT) {
        lenderBreakdown[lenderId] += e.amount;
        totalAmountDue += e.amount;
      } else {
        lenderBreakdown[lenderId] -= e.amount;
        totalAmountDue -= e.amount;
      }
    });

    const dueDate = new Date(year, month + 1, 5); // 5th of next month

    return {
      userId,
      totalAmountDue,
      dueDate,
      lenderBreakdown,
      entries
    };
  }
}
