export enum EntryType {
  DEBIT = 'DEBIT', // Spends
  CREDIT = 'CREDIT' // Repayments
}

export interface LedgerEntry {
  id: string;
  userId: string;
  lenderId: string;
  transactionId?: string;
  amount: number;
  type: EntryType;
  timestamp: Date;
}

export class LedgerService {
  private entries: LedgerEntry[] = [];

  recordDebit(userId: string, lenderId: string, amount: number, transactionId: string): void {
    this.entries.push({
      id: Math.random().toString(36).substring(7),
      userId,
      lenderId,
      transactionId,
      amount,
      type: EntryType.DEBIT,
      timestamp: new Date()
    });
    console.log(`[Ledger] Recorded DEBIT of ${amount} for user ${userId} to lender ${lenderId}`);
  }

  recordCredit(userId: string, lenderId: string, amount: number): void {
    this.entries.push({
      id: Math.random().toString(36).substring(7),
      userId,
      lenderId,
      amount,
      type: EntryType.CREDIT,
      timestamp: new Date()
    });
    console.log(`[Ledger] Recorded CREDIT of ${amount} for user ${userId} to lender ${lenderId}`);
  }

  getOutstandingBalance(userId: string, lenderId?: string): number {
    return this.entries
      .filter(e => e.userId === userId && (!lenderId || e.lenderId === lenderId))
      .reduce((sum, e) => sum + (e.type === EntryType.DEBIT ? e.amount : -e.amount), 0);
  }

  getEntriesForUser(userId: string): LedgerEntry[] {
    return this.entries.filter(e => e.userId === userId);
  }
}
