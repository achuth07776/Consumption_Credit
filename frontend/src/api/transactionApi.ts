import { isMockMode, delay, apiClient } from './apiClient';
import { mockTransactions } from './mockData';
import { Transaction } from '../types';

export const transactionApi = {
  getTransactions: async (userId: string): Promise<Transaction[]> => {
    if (isMockMode()) {
      await delay(700);
      return mockTransactions;
    }
    const response = await apiClient.get(`/transactions?userId=${userId}`);
    return response.data;
  },
  
  getTransactionDetails: async (txnId: string): Promise<Transaction | undefined> => {
    if (isMockMode()) {
      await delay(400);
      return mockTransactions.find(t => t.id === txnId);
    }
    const response = await apiClient.get(`/transactions/${txnId}`);
    return response.data;
  }
};
