import { FinancialData } from '../aa/AccountAggregator';

export interface FinancialFeatures {
    monthlyIncome: number;
    monthlyExpense: number;
    averageBalance: number;
    failedPaymentRate: number;
    billPaymentRegularity: number; // 0 to 1
    incomeStability: number; // 0 to 1
}

export class FinancialFeatureExtractor {
    extractFeatures(data: FinancialData): FinancialFeatures {
        let totalIncome = 0;
        let totalExpense = 0;
        let failedPayments = 0;
        let billPayments = 0;

        for (const txn of data.transactions) {
            if (txn.type === 'CREDIT' && txn.category === 'SALARY') {
                totalIncome += txn.amount;
            } else if (txn.type === 'DEBIT') {
                totalExpense += txn.amount;
                if (txn.category === 'UTILITY') billPayments++;
            }
        }

        const avgBalance = data.accounts.reduce((acc, a) => acc + a.balance, 0) / (data.accounts.length || 1);
        
        // Mock calculations for demo purposes
        const failedPaymentRate = failedPayments / (data.transactions.length || 1);
        const billPaymentRegularity = Math.min(billPayments / 2, 1); // Mock: 2+ bills is good
        const incomeStability = totalIncome > 10000 ? 0.9 : (totalIncome > 0 ? 0.5 : 0.1);

        return {
            monthlyIncome: totalIncome,
            monthlyExpense: totalExpense,
            averageBalance: avgBalance,
            failedPaymentRate,
            billPaymentRegularity,
            incomeStability
        };
    }
}
