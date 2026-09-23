import { isMockMode } from './apiClient';
import { initializeCreditLines, mockRiskLogs } from './mockData';
import { LenderOffer } from '../types';

export type EligibilityResult = {
  success: boolean;
  score: number;
  offers?: LenderOffer[];
  reason?: string;
  timeline: { status: string; timestamp: string }[];
};

export type CibilResult = {
  score: number | null;
  reason?: string;
};

export const eligibilityApi = {
  fetchCibilScore: async (vpa: string, pan: string): Promise<CibilResult> => {
    if (isMockMode()) {
      const isBadCredit = vpa.toLowerCase().includes('bad') || pan.toLowerCase().includes('poor');
      const isThinFile = vpa.toLowerCase().includes('thin') || vpa.toLowerCase().includes('new') || pan.toLowerCase().includes('new');

      if (isThinFile) {
        return { score: null };
      }
      if (isBadCredit) {
        return { score: 550, reason: 'Rejected due to low external bureau score.' };
      }
      return { score: 750 };
    }
    return { score: 0 };
  },

  evaluateEligibility: async (vpa: string, name: string, pan: string): Promise<EligibilityResult> => {
    if (isMockMode()) {
      const timeline: { status: string; timestamp: string }[] = [];
      const addLog = (status: string) => {
        timeline.push({ status, timestamp: new Date().toISOString() });
      };

      const isFraud = vpa.toLowerCase().includes('fraud') || pan.toLowerCase().includes('bad');
      const isBadCredit = vpa.toLowerCase().includes('bad') || pan.toLowerCase().includes('poor');
      const isThinFile = vpa.toLowerCase().includes('thin') || pan.toLowerCase().includes('new');

      addLog('Verifying Identity via NSDL for PAN: ' + pan.toUpperCase());

      // Simulate a KYC rejection for 'fraud' VPA or 'bad' PAN
      if (isFraud) {
        addLog('KYC Failed: Identity mismatch or invalid PAN.');
        
        mockRiskLogs.unshift({
          id: `RL-${Math.floor(Math.random() * 10000)}`,
          vpa,
          date: new Date().toISOString(),
          behaviorScore: 0,
          bankA_status: 'SKIPPED',
          bankB_status: 'SKIPPED',
          bankC_status: 'SKIPPED',
          finalOutcome: 'DENIED',
          reason: 'KYC Verification failed.'
        });

        return {
          success: false,
          score: 0,
          reason: 'KYC Verification failed. The details provided do not match official records.',
          timeline
        };
      }

      addLog('KYC Verified Successfully. Name matches official records.');
      addLog('Fetching Bureau Score from CIBIL...');

      // Simulate a CIBIL rejection for 'bad' VPA or 'poor' PAN
      if (isBadCredit) {
        addLog('CIBIL Score retrieved: 550 (HIGH RISK)');
        
        mockRiskLogs.unshift({
          id: `RL-${Math.floor(Math.random() * 10000)}`,
          vpa,
          date: new Date().toISOString(),
          behaviorScore: 0,
          bankA_status: 'SKIPPED',
          bankB_status: 'SKIPPED',
          bankC_status: 'SKIPPED',
          finalOutcome: 'DENIED',
          reason: 'Rejected due to low external bureau score.'
        });

        return {
          success: false,
          score: 0,
          reason: 'Your application was rejected due to a low external bureau score (CIBIL < 600).',
          timeline
        };
      }

      // NEW TO CREDIT PATH: User has no CIBIL score
      if (isThinFile) {
        addLog('Bureau Data: Thin-File Detected. No history available.');
        addLog('Fallback to Dynamic Alternative-Credit Risk Engine...');
        addLog('Analyzing UPI Behavioral Signals (Cash-Flow Stability, Consistency)...');
      } else {
        addLog('CIBIL Score retrieved: 750 (LOW RISK)');
      }

      addLog('Calculating Dynamic Risk Score...');
      
      // Simulate a rejection for bad UPI actor
      if (vpa.toLowerCase().includes('decline') || vpa.toLowerCase().includes('fail')) {
        addLog('High Risk Detected. Dynamic Risk Score: 420 / 1000');
        
        if (isThinFile) {
          addLog('Evaluate LENDER_BANK_A -> Declined (Requires Bureau > 700)');
          addLog('Evaluate LENDER_BANK_B -> Declined (Requires Bureau > 650)');
          addLog('Evaluate LENDER_BANK_C -> Declined (Dynamic Score < 500)');
        } else {
          addLog('Evaluate LENDER_BANK_A -> Declined (Bureau < 600)');
          addLog('Evaluate LENDER_BANK_B -> Declined (Bureau < 600)');
          addLog('Evaluate LENDER_BANK_C -> Declined (Bureau < 600)');
        }
        
        mockRiskLogs.unshift({
          id: `RL-${Math.floor(Math.random() * 10000)}`,
          vpa,
          date: new Date().toISOString(),
          behaviorScore: 55,
          bankA_status: 'REJECTED',
          bankB_status: 'REJECTED',
          bankC_status: 'REJECTED',
          finalOutcome: 'DENIED',
          reason: 'Your UPI transaction history does not meet the minimum requirements for a credit line.'
        });

        return {
          success: false,
          score: 55,
          reason: 'Your UPI transaction history does not meet the minimum requirements for a credit line.',
          timeline
        };
      }

      addLog('Stable Cash-Flow & Consistent Repayment Behavior Detected.');
      addLog('Dynamic Risk Score Calculated: 820 / 1000');
      addLog('Assigning Conservative Initial Limit based on Risk Band...');
      
      if (isThinFile) {
        addLog('Evaluate LENDER_BANK_A -> Declined (Requires Bureau > 700)');
        addLog('Evaluate LENDER_BANK_B -> Declined (Requires Bureau > 650)');
        addLog('Evaluate LENDER_BANK_C -> Approved (Dynamic Risk Score Validated)');
      } else {
        addLog('Evaluate LENDER_BANK_A -> Declined (Bureau < 600)');
        addLog('Evaluate LENDER_BANK_B -> Declined (Bureau < 600)');
        addLog('Evaluate LENDER_BANK_C -> Approved');
      }
      
      addLog('Requesting LENDER_SPECIFIC_CONSENT for BANK_C');

      mockRiskLogs.unshift({
        id: `RL-${Math.floor(Math.random() * 10000)}`,
        vpa,
        date: new Date().toISOString(),
        behaviorScore: 82,
        bankA_status: 'REJECTED',
        bankB_status: 'REJECTED',
        bankC_status: 'APPROVED',
        finalOutcome: 'GRANTED',
        reason: 'Bank A/B rejected due to score. Fallback to Bank C successful.'
      });

      // Define the marketplace offers
      let offers: LenderOffer[] = [];

      if (isThinFile) {
        offers = [
          { id: 'LND-3', name: 'Bajaj Finserv', type: 'NBFC', approvedLimit: 20000, interestRate: 24.5, processingFee: 299 },
          { id: 'LND-4', name: 'Tata Capital', type: 'NBFC', approvedLimit: 15000, interestRate: 26.0, processingFee: 199 },
          { id: 'LND-5', name: 'KreditBee', type: 'NBFC', approvedLimit: 10000, interestRate: 28.0, processingFee: 399 },
          { id: 'LND-6', name: 'Navi', type: 'NBFC', approvedLimit: 25000, interestRate: 22.0, processingFee: 0 },
          { id: 'LND-7', name: 'PayU Finance', type: 'NBFC', approvedLimit: 12000, interestRate: 25.5, processingFee: 249 },
          { id: 'LND-8', name: 'Aditya Birla Finance', type: 'NBFC', approvedLimit: 20000, interestRate: 21.0, processingFee: 499 },
          { id: 'LND-9', name: 'Kissht', type: 'NBFC', approvedLimit: 5000, interestRate: 32.0, processingFee: 500 },
          { id: 'LND-10', name: 'Muthoot Finance', type: 'NBFC', approvedLimit: 18000, interestRate: 19.5, processingFee: 299 },
          { id: 'LND-11', name: 'InCred', type: 'NBFC', approvedLimit: 7500, interestRate: 27.5, processingFee: 350 },
          { id: 'LND-12', name: 'Home Credit', type: 'NBFC', approvedLimit: 10000, interestRate: 30.0, processingFee: 450 }
        ];
      } else {
        offers = [
          { id: 'LND-1', name: 'HDFC Bank', type: 'BANK', approvedLimit: 15000, interestRate: 14.5, processingFee: 0 },
          { id: 'LND-2', name: 'ICICI Bank', type: 'BANK', approvedLimit: 12000, interestRate: 15.0, processingFee: 0 },
          { id: 'LND-13', name: 'IDFC First Bank', type: 'BANK', approvedLimit: 18000, interestRate: 16.5, processingFee: 499 },
          { id: 'LND-14', name: 'Axis Bank', type: 'BANK', approvedLimit: 14000, interestRate: 15.5, processingFee: 299 },
          { id: 'LND-15', name: 'State Bank of India', type: 'BANK', approvedLimit: 10000, interestRate: 13.5, processingFee: 0 },
          { id: 'LND-16', name: 'Kotak Mahindra Bank', type: 'BANK', approvedLimit: 13500, interestRate: 16.0, processingFee: 399 },
          { id: 'LND-17', name: 'Yes Bank', type: 'BANK', approvedLimit: 20000, interestRate: 17.5, processingFee: 599 },
          { id: 'LND-18', name: 'IndusInd Bank', type: 'BANK', approvedLimit: 16000, interestRate: 16.8, processingFee: 499 },
          { id: 'LND-19', name: 'RBL Bank', type: 'BANK', approvedLimit: 25000, interestRate: 18.0, processingFee: 999 },
          { id: 'LND-20', name: 'Standard Chartered', type: 'BANK', approvedLimit: 11000, interestRate: 14.8, processingFee: 199 }
        ];
      }

      return {
        success: true,
        score: 82,
        offers,
        timeline
      };
    }

    // Fallback if not mock mode (not implemented yet in real backend API)
    return { success: false, score: 0, reason: 'Not implemented', timeline: [] };
  }
};
