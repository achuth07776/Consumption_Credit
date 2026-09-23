import { CreditLine } from '../core/models';

export class LenderPreferenceService {
  // Returns credit lines ordered by preference (e.g. lowest interest rate first, or user preference)
  getPreferredLenders(creditLines: CreditLine[]): CreditLine[] {
    return creditLines
      .filter(line => line.isActive && line.availableLimit > 0)
      .sort((a, b) => a.interestRate - b.interestRate);
  }
}
