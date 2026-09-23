import { FinancialFeatures } from './FinancialFeatureExtractor';

export interface RiskAssessment {
    riskScore: number; // 0-1000
    riskLevel: 'VERY LOW' | 'LOW' | 'MEDIUM' | 'HIGH';
    recommendedLimit: number;
    explanation: string[];
}

export class DynamicRiskEngine {
    assess(features: FinancialFeatures): RiskAssessment {
        let score = 500; // Base score
        const explanation: string[] = [];

        // Evaluate Income
        if (features.monthlyIncome > 40000) {
            score += 200;
            explanation.push('High and stable monthly income');
        } else if (features.monthlyIncome > 10000) {
            score += 100;
            explanation.push('Stable monthly income');
        } else {
            score -= 100;
            explanation.push('Low or irregular income detected');
        }

        // Evaluate Balance
        if (features.averageBalance > 20000) {
            score += 150;
            explanation.push('Healthy average balance');
        } else if (features.averageBalance < 2000) {
            score -= 100;
            explanation.push('Low average account balance');
        }

        // Evaluate Bill Regularity
        if (features.billPaymentRegularity > 0.8) {
            score += 100;
            explanation.push('Consistent bill payments');
        }

        // Evaluate Failed Payments
        if (features.failedPaymentRate > 0.1) {
            score -= 200;
            explanation.push('High failed payment rate');
        } else {
            score += 50;
            explanation.push('Low failed payment rate');
        }

        score = Math.max(0, Math.min(score, 1000));

        let riskLevel: 'VERY LOW' | 'LOW' | 'MEDIUM' | 'HIGH';
        let recommendedLimit = 0;

        if (score >= 800) {
            riskLevel = 'VERY LOW';
            recommendedLimit = 20000;
        } else if (score >= 650) {
            riskLevel = 'LOW';
            recommendedLimit = 10000;
        } else if (score >= 500) {
            riskLevel = 'MEDIUM';
            recommendedLimit = 5000;
        } else {
            riskLevel = 'HIGH';
            recommendedLimit = 2000;
        }

        return {
            riskScore: score,
            riskLevel,
            recommendedLimit,
            explanation
        };
    }
}
