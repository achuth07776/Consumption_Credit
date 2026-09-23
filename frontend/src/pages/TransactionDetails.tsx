import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { transactionApi } from '../api/transactionApi';
import { Transaction } from '../types';
import { ArrowLeft, CheckCircle2, Clock } from 'lucide-react';

export const TransactionDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [txn, setTxn] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      transactionApi.getTransactionDetails(id)
        .then(data => {
          if (data) setTxn(data);
        })
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) return <div className="p-8 text-center text-fintech-secondary">Loading details...</div>;
  if (!txn) return <div className="p-8 text-center text-fintech-danger">Transaction not found.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="text-fintech-secondary hover:text-fintech-primary flex items-center gap-2 mb-4">
        <ArrowLeft size={18} /> Back
      </button>

      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-fintech-primary mb-2">₹{txn.amount.toLocaleString()}</h1>
        <p className="text-lg font-medium text-fintech-secondary">Paid to {txn.merchant}</p>
        <div className="mt-4"><StatusBadge status={txn.status} /></div>
      </div>

      <Card>
        <h3 className="font-bold text-fintech-primary mb-4 border-b pb-2">Transaction Info</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-fintech-secondary">Transaction ID</span>
            <span className="font-medium text-fintech-primary">{txn.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fintech-secondary">Date</span>
            <span className="font-medium text-fintech-primary">{new Date(txn.date).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fintech-secondary">Payment Mode</span>
            <span className="font-medium text-fintech-primary">{txn.mode === 'OWN_MONEY' ? 'Paid with Own Money' : 'Credit Line'}</span>
          </div>
          {txn.lender && (
            <div className="flex justify-between">
              <span className="text-fintech-secondary">Lender</span>
              <span className="font-medium text-fintech-primary">{txn.lender}</span>
            </div>
          )}
        </div>
      </Card>

      {txn.splits && txn.splits.length > 0 && (
        <Card>
          <h3 className="font-bold text-fintech-primary mb-4 border-b pb-2">Split Breakdown</h3>
          <div className="space-y-3 text-sm">
            {txn.splits.map((s, i) => (
              <div key={i} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                <span className="text-fintech-secondary font-medium">{s.lenderName}</span>
                <span className="font-bold text-fintech-primary">₹{s.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {txn.timeline && txn.timeline.length > 0 && (
        <Card>
          <h3 className="font-bold text-fintech-primary mb-4 border-b pb-2">Processing Timeline</h3>
          <div className="space-y-4">
            {txn.timeline.map((step, idx) => (
              <div key={idx} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step.status.includes('Declined') ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                    {step.status.includes('Declined') ? <Clock size={14} /> : <CheckCircle2 size={14} />}
                  </div>
                  {idx !== txn.timeline!.length - 1 && <div className="w-0.5 h-full bg-gray-200 my-1" />}
                </div>
                <div className="pb-4">
                  <p className="font-medium text-sm text-fintech-primary">{step.status}</p>
                  <p className="text-xs text-fintech-secondary">{new Date(step.timestamp).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
