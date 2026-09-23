import React from 'react';
import { TransactionStatus } from '../types';

interface Props {
  status: TransactionStatus | 'GRANTED' | 'REVOKED';
}

export const StatusBadge: React.FC<Props> = ({ status }) => {
  let styles = 'bg-gray-100 text-gray-800';
  
  switch (status) {
    case 'APPROVED':
    case 'SETTLED':
    case 'GRANTED':
      styles = 'bg-green-100 text-green-800';
      break;
    case 'DECLINED':
    case 'CANCELLED':
    case 'REVOKED':
      styles = 'bg-red-100 text-red-800';
      break;
    case 'PENDING':
    case 'INITIATED':
      styles = 'bg-yellow-100 text-yellow-800';
      break;
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
};
