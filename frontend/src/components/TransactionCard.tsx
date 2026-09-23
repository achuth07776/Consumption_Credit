import React from 'react';
import { Transaction } from '../types';
import { StatusBadge } from './StatusBadge';

interface Props {
  transaction: Transaction;
  onClick?: (txn: Transaction) => void;
}

export const TransactionCard: React.FC<Props> = ({ transaction, onClick }) => {
  return (
    <div 
      className={`p-4 border-b border-fintech-border flex justify-between items-center ${onClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
      onClick={() => onClick?.(transaction)}
    >
      <div>
        <p className="font-semibold text-fintech-primary">{transaction.merchant}</p>
        <p className="text-xs text-fintech-secondary">
          {new Date(transaction.date).toLocaleDateString()} • {transaction.mode === 'OWN_MONEY' ? 'Paid with Own Money' : (transaction.lender ? `Paid via ${transaction.lender}` : 'Credit Line')}
        </p>
      </div>
      <div className="text-right flex flex-col items-end gap-1">
        <p className="font-bold text-fintech-primary">₹{transaction.amount.toLocaleString()}</p>
        <StatusBadge status={transaction.status} />
      </div>
    </div>
  );
};
