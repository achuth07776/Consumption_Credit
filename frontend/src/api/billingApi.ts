import { isMockMode, delay, apiClient } from './apiClient';
import { mockStatement, mockTransactions, mockCreditLines, mockLimitHistory } from './mockData';
import { Statement, StatementItem } from '../types';

export const billingApi = {
  getStatement: async (userId: string): Promise<Statement> => {
    if (isMockMode()) {
      await delay(800);
      return mockStatement;
    }
    const response = await apiClient.get(`/billing/${userId}/statement`);
    return response.data;
  },

  payBill: async (amount: number): Promise<{ 
    success: boolean; 
    newBalance: number; 
    repaymentDetails?: { lenderName: string; amount: number }[];
    limitIncreases?: { lenderName: string; amount: number }[];
  }> => {
    if (isMockMode()) {
      await delay(1000);

      mockStatement.totalAmountDue = Math.max(0, mockStatement.totalAmountDue - amount);
      mockStatement.amountPaid = (mockStatement.amountPaid || 0) + amount;
      
      let remainingPayment = amount;
      const repaymentDetails: { lenderName: string; amount: number }[] = [];
      const limitIncreases: { lenderName: string; amount: number }[] = [];
      const isEarlyRepayment = new Date() <= new Date(mockStatement.dueDate);

      for (const line of mockCreditLines) {
        if (remainingPayment <= 0) break;
        if (line.utilizedLimit > 0) {
          const toPay = Math.min(line.utilizedLimit, remainingPayment);
          line.utilizedLimit -= toPay;
          line.availableLimit += toPay;
          remainingPayment -= toPay;
          
          repaymentDetails.push({ lenderName: line.lenderName || 'Unknown', amount: toPay });
          
          if (isEarlyRepayment) {
            if (line.health.behaviorScore < 90) {
              line.health.behaviorScore = Math.min(90, line.health.behaviorScore + 5);
              if (line.health.behaviorScore >= 80) {
                line.health.riskLevel = 'LOW';
              }
            }
            
            // Trigger 10% limit increase for early repayment
            const increaseAmount = Math.floor(line.totalLimit * 0.1);
            line.totalLimit += increaseAmount;
            line.availableLimit += increaseAmount;
            limitIncreases.push({ lenderName: line.lenderName || 'Unknown', amount: increaseAmount });
            
            mockLimitHistory.push({
              id: `LH-${Date.now()}-${line.id}`,
              date: new Date().toISOString().split('T')[0],
              previousLimit: line.totalLimit - increaseAmount,
              newLimit: line.totalLimit,
              reason: 'Early Repayment Reward'
            });
          }
        }
      }

      import('./mockData').then(({ updateMockCreditLines }) => {
        updateMockCreditLines([...mockCreditLines]);
      });

      mockStatement.items.push({
        id: `P-${Math.floor(Math.random() * 1000)}`,
        type: 'Bill Payment',
        amount: -amount
      });

      return { success: true, newBalance: mockStatement.totalAmountDue, repaymentDetails, limitIncreases };
    }
    
    const response = await apiClient.post(`/billing/pay`, { amount });
    return response.data;
  }
};
