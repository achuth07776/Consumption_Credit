import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { TransactionCard } from '../components/TransactionCard';
import { transactionApi } from '../api/transactionApi';
import { useAuth } from '../context/AuthContext';
import { Transaction } from '../types';
import { useNavigate } from 'react-router-dom';

export const Transactions = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      transactionApi.getTransactions(user.id)
        .then(setTransactions)
        .finally(() => setLoading(false));
    }
  }, [user]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-fintech-primary mb-4">Transaction History</h1>
      
      <Card>
        {loading ? (
          <div className="text-center py-8 text-fintech-secondary">Loading transactions...</div>
        ) : transactions.length > 0 ? (
          <div className="divide-y divide-fintech-border -mx-5 px-1">
            {transactions.map(txn => (
              <TransactionCard 
                key={txn.id} 
                transaction={txn} 
                onClick={(t) => navigate(`/transactions/${t.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-fintech-secondary">No recent transactions.</div>
        )}
      </Card>
    </div>
  );
};
