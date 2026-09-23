import { TransactionStatus } from './types';

export interface User {
  id: string;
  vpa: string;
  name: string;
  phone: string;
  hasOverdueBills?: boolean;
  cibilScore?: number;
  upiBehaviorScore?: number;
}

export interface Merchant {
  id: string;
  vpa: string;
  name: string;
  mcc: string; // Merchant Category Code
}

export interface Lender {
  id: string;
  name: string;
  creditLineId?: string; // Optional until assigned by multi-lender orchestration
}

export interface Transaction {
  id: string;
  amount: number;
  merchantId: string;
  status: TransactionStatus;
  userId: string;
  creditLineId?: string;
  timestamp: Date;
}

export interface CreditLine {
  id: string;
  lenderId: string;
  availableLimit: number;
  totalLimit: number;
  interestRate: number;
  userId: string;
  isActive: boolean;
}
