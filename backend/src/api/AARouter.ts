import { Router, Request, Response } from 'express';
import { AAConsentService } from '../consent/AAConsentService';
import { MockAccountAggregator } from '../aa/MockAccountAggregator';
import { FinancialFeatureExtractor } from '../risk/FinancialFeatureExtractor';
import { DynamicRiskEngine } from '../risk/DynamicRiskEngine';
import { ConsentPurpose } from '../aa/AccountAggregator';

export const aaRouter = Router();

const consentService = new AAConsentService();
const accountAggregator = new MockAccountAggregator();
const featureExtractor = new FinancialFeatureExtractor();
const riskEngine = new DynamicRiskEngine();

// --- CONSENT FLOW ---

aaRouter.post('/consents', async (req: Request, res: Response) => {
    const { userId, purpose, dataTypes } = req.body;
    if (!userId || !purpose || !dataTypes) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    const consent = await consentService.createConsent(userId, purpose as ConsentPurpose, dataTypes);
    res.json(consent);
});

aaRouter.post('/consents/:consentId/approve', async (req: Request, res: Response) => {
    try {
        const consent = await consentService.approveConsent(req.params.consentId as string);
        res.json(consent);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

aaRouter.post('/consents/:consentId/reject', async (req: Request, res: Response) => {
    try {
        const consent = await consentService.rejectConsent(req.params.consentId as string);
        res.json(consent);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

aaRouter.post('/consents/:consentId/revoke', async (req: Request, res: Response) => {
    try {
        const consent = await consentService.revokeConsent(req.params.consentId as string);
        res.json(consent);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

aaRouter.get('/users/:userId/consents', async (req: Request, res: Response) => {
    const consents = await consentService.getConsentsByUser(req.params.userId as string);
    res.json(consents);
});

aaRouter.get('/consents/:consentId', async (req: Request, res: Response) => {
    const consent = await consentService.getConsent(req.params.consentId as string);
    if (!consent) return res.status(404).json({ error: 'Not found' });
    res.json(consent);
});

// --- DATA FLOW ---

aaRouter.get('/consents/:consentId/financial-data', async (req: Request, res: Response) => {
    const consentId = req.params.consentId as string;
    const isValid = await consentService.validateConsent(consentId);
    
    if (!isValid) {
        return res.status(403).json({ error: 'Access Denied: Consent is missing, expired, revoked, or not granted.' });
    }

    try {
        const data = await accountAggregator.fetchFinancialData(consentId);
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch financial data from Account Aggregator' });
    }
});

// --- RISK INTEGRATION ---

aaRouter.post('/risk/assess', async (req: Request, res: Response) => {
    const { userId, consentId } = req.body;
    if (!userId || !consentId) return res.status(400).json({ error: 'Missing userId or consentId' });

    const isValid = await consentService.validateConsent(consentId);
    if (!isValid) {
        return res.status(403).json({ error: 'Access Denied: Cannot perform risk assessment without active AA consent.' });
    }

    try {
        const data = await accountAggregator.fetchFinancialData(consentId);
        const features = featureExtractor.extractFeatures(data);
        const assessment = riskEngine.assess(features);

        res.json({
            userId,
            ...assessment
        });
    } catch (err: any) {
        res.status(500).json({ error: 'Assessment failed' });
    }
});
