import { apiClient } from './apiClient';
import { AAConsentRecord } from '../../../backend/src/aa/AccountAggregator'; // Will use any or redefine types

// Re-declare types in frontend to avoid direct backend dependency if preferred,
// but for now we can rely on standard API definitions.
export type ConsentPurpose = 'CREDIT_ASSESSMENT' | 'WEALTH_MANAGEMENT' | 'FRAUD_CHECK';
export type ConsentStatus = 'CREATED' | 'PENDING' | 'GRANTED' | 'REJECTED' | 'EXPIRED' | 'REVOKED' | 'FAILED';

export interface ConsentRecord {
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

export interface RiskAssessmentResponse {
    userId: string;
    riskScore: number;
    riskLevel: 'VERY LOW' | 'LOW' | 'MEDIUM' | 'HIGH';
    recommendedLimit: number;
    explanation: string[];
}

export const aaApi = {
    createConsent: async (userId: string, purpose: ConsentPurpose, dataTypes: string[]): Promise<ConsentRecord> => {
        const response = await apiClient.post('/aa/consents', { userId, purpose, dataTypes });
        return response.data;
    },
    
    approveConsent: async (consentId: string): Promise<ConsentRecord> => {
        const response = await apiClient.post(`/aa/consents/${consentId}/approve`);
        return response.data;
    },
    
    rejectConsent: async (consentId: string): Promise<ConsentRecord> => {
        const response = await apiClient.post(`/aa/consents/${consentId}/reject`);
        return response.data;
    },
    
    revokeConsent: async (consentId: string): Promise<ConsentRecord> => {
        const response = await apiClient.post(`/aa/consents/${consentId}/revoke`);
        return response.data;
    },
    
    getConsentStatus: async (consentId: string): Promise<ConsentRecord> => {
        const response = await apiClient.get(`/aa/consents/${consentId}`);
        return response.data;
    },
    
    getUserConsents: async (userId: string): Promise<ConsentRecord[]> => {
        const response = await apiClient.get(`/aa/users/${userId}/consents`);
        return response.data;
    },
    
    getFinancialData: async (consentId: string): Promise<FinancialData> => {
        const response = await apiClient.get(`/aa/consents/${consentId}/financial-data`);
        return response.data;
    },
    
    runRiskAssessment: async (userId: string, consentId: string): Promise<RiskAssessmentResponse> => {
        const response = await apiClient.post('/aa/risk/assess', { userId, consentId });
        return response.data;
    }
};
