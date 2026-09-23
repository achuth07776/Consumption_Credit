import { isMockMode, delay, apiClient } from './apiClient';
import { Transaction, SplitAllocation } from '../types';
import { mockTransactions, mockCreditLines, mockStatement } from './mockData';

export const paymentApi = {
  pay: async (amount: number, merchantId: string, mode: 'OWN_MONEY' | 'CREDIT_LINE', creditLineId?: string, totalAmountToDeduct?: number, splits?: SplitAllocation[]): Promise<{ success: boolean; transaction: Transaction; reason?: string }> => {
    if (isMockMode()) {
      await delay(1200);
      
      const targetLine = mode === 'CREDIT_LINE' 
        ? mockCreditLines.find(c => c.id === creditLineId) || mockCreditLines[0]
        : null;
      
      if (mode === 'CREDIT_LINE' && !targetLine) {
        return { success: false, reason: 'No credit line found.', transaction: {} as Transaction };
      }

      // Enforce Prudential Rules
      if (targetLine && targetLine.health.hasOverdueBills) {
        return { success: false, reason: 'Payment Blocked: You have overdue payments. Please clear your dues.', transaction: {} as Transaction };
      }
      if (targetLine && targetLine.health.cibilScore !== undefined && targetLine.health.cibilScore < 600) {
        return { success: false, reason: 'Payment Blocked: External bureau score is below required threshold.', transaction: {} as Transaction };
      }

      // Simulate backend risk engine behavior
      if (mode === 'CREDIT_LINE' && targetLine && amount > 10000) {
        // Dynamically decrease behavior score for high risk declines
        targetLine.health.behaviorScore = Math.max(0, targetLine.health.behaviorScore - 8);
        if (targetLine.health.behaviorScore < 75) {
          targetLine.health.riskLevel = 'MEDIUM';
        }
        return { success: false, reason: 'High Risk Transaction Declined', transaction: {} as Transaction };
      }
      
      const isMultiLender = mode === 'CREDIT_LINE' && splits && splits.length > 0;
      
      const newTxn: Transaction = {
        id: `TXN-${Math.floor(Math.random() * 10000)}`,
        merchant: merchantId,
        amount,
        mode,
        date: new Date().toISOString(),
        status: 'SETTLED',
        lender: isMultiLender ? 'Multiple Lenders' : (targetLine ? targetLine.lenderName : undefined),
        splits: isMultiLender ? splits.map(s => ({ 
          lenderName: mockCreditLines.find(c => c.id === s.creditLineId)?.lenderName || 'Unknown', 
          amount: s.amount 
        })) : undefined,
        timeline: mode === 'CREDIT_LINE' ? [
          { status: 'Transaction Created', timestamp: new Date(Date.now() - 5000).toISOString() },
          { status: 'Check Platform Consent', timestamp: new Date(Date.now() - 4500).toISOString() },
          { status: 'Evaluate LENDER', timestamp: new Date(Date.now() - 3000).toISOString() },
          { status: 'Payment Settled', timestamp: new Date().toISOString() }
        ] : [
          { status: 'Transaction Created', timestamp: new Date(Date.now() - 5000).toISOString() },
          { status: 'Bank Authorization', timestamp: new Date(Date.now() - 2500).toISOString() },
          { status: 'Payment Settled', timestamp: new Date().toISOString() }
        ]
      };
      
      // Push to in-memory mock array so it appears in the list
      mockTransactions.unshift(newTxn);
      
      if (mode === 'CREDIT_LINE') {
        if (isMultiLender && splits) {
          for (const split of splits) {
            const line = mockCreditLines.find(c => c.id === split.creditLineId);
            if (line) {
              const deductAmount = split.amount + split.interestAmount;
              line.availableLimit -= deductAmount;
              line.utilizedLimit += deductAmount;
              
              mockStatement.totalAmountDue += deductAmount;
              mockStatement.items.push({
                id: `I-${Math.floor(Math.random() * 1000)}`,
                type: 'Split Credit Purchase',
                amount: deductAmount,
                description: merchantId,
                lenderName: line.lenderName
              });
            }
          }
        } else if (targetLine) {
          // Mutate the mock credit line to simulate limit deduction
          const deductAmount = totalAmountToDeduct || amount;
          targetLine.availableLimit -= deductAmount;
          targetLine.utilizedLimit += deductAmount;
          
          // Generate bill
          mockStatement.totalAmountDue += deductAmount;
          mockStatement.items.push({
            id: `I-${Math.floor(Math.random() * 1000)}`,
            type: 'Credit Line Purchase',
            amount: deductAmount,
            description: merchantId,
            lenderName: targetLine.lenderName
          });

          // Set as active/primary credit line on dashboard
          const index = mockCreditLines.findIndex(c => c.id === targetLine.id);
          if (index > 0) {
            mockCreditLines.splice(index, 1);
            mockCreditLines.unshift(targetLine);
          }
        }
      }

      return { 
        success: true, 
        transaction: newTxn
      };
    }
    
    const response = await apiClient.post(`/pay`, { amount, merchantId, mode });
    return response.data;
  }
};
