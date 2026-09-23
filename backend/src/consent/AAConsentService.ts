import { AAConsentRecord, ConsentPurpose, ConsentStatus } from '../aa/AccountAggregator';

export class AAConsentService {
    private consents: Map<string, AAConsentRecord> = new Map();

    async createConsent(userId: string, purpose: ConsentPurpose, dataTypes: string[]): Promise<AAConsentRecord> {
        let suffix = '';
        if (userId.toLowerCase().includes('fail') || userId.toLowerCase().includes('high_risk')) {
            suffix = '_HIGH_RISK';
        } else if (userId.toLowerCase().includes('medium')) {
            suffix = '_MEDIUM_RISK';
        }
        const consentId = `CONS-${Math.floor(Math.random() * 100000)}${suffix}`;
        const record: AAConsentRecord = {
            consentId,
            userId,
            purpose,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h expiry
            dataTypes
        };
        this.consents.set(consentId, record);
        return record;
    }

    async getConsent(consentId: string): Promise<AAConsentRecord | undefined> {
        return this.consents.get(consentId);
    }

    async getConsentsByUser(userId: string): Promise<AAConsentRecord[]> {
        return Array.from(this.consents.values()).filter(c => c.userId === userId);
    }

    async approveConsent(consentId: string): Promise<AAConsentRecord> {
        const record = this.consents.get(consentId);
        if (!record) throw new Error('Consent not found');
        if (record.status !== 'PENDING') throw new Error(`Cannot approve consent in ${record.status} state`);
        
        record.status = 'GRANTED';
        record.grantedAt = new Date().toISOString();
        this.consents.set(consentId, record);
        return record;
    }

    async rejectConsent(consentId: string): Promise<AAConsentRecord> {
        const record = this.consents.get(consentId);
        if (!record) throw new Error('Consent not found');
        if (record.status !== 'PENDING') throw new Error(`Cannot reject consent in ${record.status} state`);
        
        record.status = 'REJECTED';
        this.consents.set(consentId, record);
        return record;
    }

    async revokeConsent(consentId: string): Promise<AAConsentRecord> {
        const record = this.consents.get(consentId);
        if (!record) throw new Error('Consent not found');
        if (record.status !== 'GRANTED') throw new Error(`Cannot revoke consent in ${record.status} state`);
        
        record.status = 'REVOKED';
        record.revokedAt = new Date().toISOString();
        this.consents.set(consentId, record);
        return record;
    }

    async validateConsent(consentId: string): Promise<boolean> {
        const record = this.consents.get(consentId);
        if (!record) return false;
        if (record.status !== 'GRANTED') return false;
        if (new Date(record.expiresAt) < new Date()) {
            record.status = 'EXPIRED';
            this.consents.set(consentId, record);
            return false;
        }
        return true;
    }
}
