import { AccountAggregator, FinancialData, Account, TransactionRecord } from './AccountAggregator';

export class MockAccountAggregator implements AccountAggregator {
    async fetchFinancialData(consentId: string): Promise<FinancialData> {
        // In a real AA, the consentId would be validated by the AA against the FIU's request.
        // For this mock, we just use deterministic generation based on the consentId hash or mock rules.
        
        // Simulating network delay
        await new Promise(resolve => setTimeout(resolve, 800));

        // For the sake of the mock, we simulate high/medium/low risk profiles 
        // depending on the character of the consentId (or we just return a standard profile)
        const isHighRisk = consentId.includes('HIGH_RISK');
        const isMediumRisk = consentId.includes('MEDIUM_RISK');

        let accounts: Account[] = [
            {
                accountId: 'ACC001',
                accountType: 'SAVINGS',
                maskedAccountNumber: 'XXXX1234',
                institutionName: 'Demo Bank',
                balance: isHighRisk ? 1500 : (isMediumRisk ? 8000 : 15000)
            }
        ];

        let transactions: TransactionRecord[] = [];
        
        const now = new Date();
        const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0] as string;

        if (isHighRisk) {
            transactions = [
                { transactionId: 'T1', date: daysAgo(2), amount: 500, type: 'CREDIT', category: 'SALARY' },
                { transactionId: 'T2', date: daysAgo(5), amount: 450, type: 'DEBIT', category: 'ENTERTAINMENT' },
                { transactionId: 'T3', date: daysAgo(10), amount: 1000, type: 'DEBIT', category: 'UTILITY' },
                // Frequent overdraft-like behavior or high spending
            ];
        } else if (isMediumRisk) {
            transactions = [
                { transactionId: 'T1', date: daysAgo(1), amount: 15000, type: 'CREDIT', category: 'SALARY' },
                { transactionId: 'T2', date: daysAgo(3), amount: 5000, type: 'DEBIT', category: 'UTILITY' },
                { transactionId: 'T3', date: daysAgo(15), amount: 2000, type: 'DEBIT', category: 'FOOD' },
            ];
        } else {
            // Low risk profile
            transactions = [
                { transactionId: 'T1', date: daysAgo(1), amount: 45000, type: 'CREDIT', category: 'SALARY' },
                { transactionId: 'T2', date: daysAgo(3), amount: 2000, type: 'DEBIT', category: 'UTILITY' },
                { transactionId: 'T3', date: daysAgo(5), amount: 5000, type: 'DEBIT', category: 'INVESTMENT' },
                { transactionId: 'T4', date: daysAgo(15), amount: 3000, type: 'DEBIT', category: 'GROCERY' },
                { transactionId: 'T5', date: daysAgo(30), amount: 45000, type: 'CREDIT', category: 'SALARY' },
            ];
        }

        return {
            userId: 'U_MOCK', // In real life, mapped from the consent
            accounts,
            transactions
        };
    }
}
