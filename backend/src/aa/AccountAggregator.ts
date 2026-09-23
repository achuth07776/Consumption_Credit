export type ConsentPurpose = 'CREDIT_ASSESSMENT' | 'WEALTH_MANAGEMENT' | 'FRAUD_CHECK';

export type ConsentStatus = 'CREATED' | 'PENDING' | 'GRANTED' | 'REJECTED' | 'EXPIRED' | 'REVOKED' | 'FAILED';

export interface AAConsentRecord {
    consentId: string;
    userId: string;
    purpose: ConsentPurpose;
    status: ConsentStatus;
    createdAt: string;
    expiresAt: string;
    grantedAt?: string;
    revokedAt?: string;
    dataTypes: string[];
}

export interface Account {
    accountId: string;
    accountType: string;
    maskedAccountNumber: string;
    institutionName: string;
    balance: number;
}

export interface TransactionRecord {
    transactionId: string;
    date: string;
    amount: number;
    type: 'CREDIT' | 'DEBIT';
    category: string;
    description?: string;
}

export interface FinancialData {
    userId: string;
    accounts: Account[];
    transactions: TransactionRecord[];
}

export interface AccountAggregator {
    fetchFinancialData(consentId: string): Promise<FinancialData>;
}
