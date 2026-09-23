import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { billingApi } from '../api/billingApi';
import { useAuth } from '../context/AuthContext';
import { Statement } from '../types';
import { CheckCircle2 } from 'lucide-react';

export const Bills = () => {
  const { user } = useAuth();
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [repaymentDetails, setRepaymentDetails] = useState<{ lenderName: string; amount: number }[] | undefined>();
  const [limitIncreases, setLimitIncreases] = useState<{ lenderName: string; amount: number }[] | undefined>();

  useEffect(() => {
    if (user) {
      billingApi.getStatement(user.id)
        .then(setStatement)
        .finally(() => setLoading(false));
    }
  }, [user]);

  const [customAmount, setCustomAmount] = useState<string>('');

  const handleRepay = async (amountToPay?: number) => {
    if (!statement || !user) return;
    
    const amount = amountToPay ?? statement.totalAmountDue;
    if (amount <= 0) return;

    setPaying(true);
    try {
      const result = await billingApi.payBill(amount);
      setSuccess(true);
      if (result.repaymentDetails) {
        setRepaymentDetails(result.repaymentDetails);
      }
      if (result.limitIncreases) {
        setLimitIncreases(result.limitIncreases);
      }
      setStatement({ 
        ...statement, 
        totalAmountDue: result.newBalance,
        minAmountDue: Math.max(0, statement.minAmountDue - amount)
      }); 
      setCustomAmount('');
    } catch (e) {
      console.error(e);
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="text-center p-8 text-fintech-secondary">Loading bills...</div>;
  if (!statement) return <div className="text-center p-8 text-fintech-danger">Failed to load statement.</div>;

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-fintech-primary">Unified Bill</h1>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl flex items-center gap-3">
          <CheckCircle2 size={24} />
          <div>
            <p className="font-bold">Payment Successful!</p>
            <p className="text-sm">Your bill payment has been processed.</p>
            {repaymentDetails && repaymentDetails.length > 0 && (
              <ul className="mt-2 text-xs list-disc pl-4 opacity-80 space-y-1">
                {repaymentDetails.map((rd, i) => (
                  <li key={i}>Cleared ₹{rd.amount.toLocaleString()} from {rd.lenderName}</li>
                ))}
              </ul>
            )}
            {limitIncreases && limitIncreases.length > 0 && (
              <div className="mt-3 bg-white/50 p-2 rounded text-sm text-green-800">
                <p className="font-bold mb-1 flex items-center gap-1">🎉 Early Repayment Reward!</p>
                <ul className="text-xs list-disc pl-4 opacity-90 space-y-1">
                  {limitIncreases.map((li, i) => (
                    <li key={i}>Credit Limit with {li.lenderName} increased by ₹{li.amount.toLocaleString()}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <Card className="bg-gradient-to-br from-fintech-primary to-fintech-accent text-white border-none shadow-xl">
        <p className="text-gray-300 text-sm mb-1">Total Amount Due</p>
        <h2 className="text-4xl font-bold mb-4">₹{statement.totalAmountDue.toLocaleString()}</h2>
        
        {statement.totalAmountDue > 0 ? (
          <>
            <div className="flex justify-between items-center bg-white/10 p-3 rounded-lg text-sm mb-6">
              <span>Due Date</span>
              <span className="font-bold text-red-200">{new Date(statement.dueDate).toLocaleDateString()}</span>
            </div>

            <div className="space-y-4">
              <button 
                onClick={() => handleRepay()}
                disabled={paying}
                className="w-full bg-white text-fintech-primary font-bold py-3 rounded-xl hover:bg-gray-100 transition"
              >
                {paying ? 'Processing...' : `Pay Full ₹${statement.totalAmountDue.toLocaleString()}`}
              </button>

              <div className="flex flex-col gap-2 pt-4 border-t border-white/20">
                <p className="text-sm text-gray-300">Or pay custom installment</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fintech-primary">₹</span>
                    <input 
                      type="number" 
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="Amount"
                      className="w-full pl-8 pr-3 py-3 rounded-xl bg-white text-fintech-primary font-bold focus:outline-none focus:ring-2 focus:ring-fintech-accent"
                    />
                  </div>
                  <button
                    onClick={() => handleRepay(Number(customAmount))}
                    disabled={paying || !customAmount || Number(customAmount) <= 0 || Number(customAmount) > statement.totalAmountDue}
                    className="bg-white/20 text-white px-6 py-3 rounded-xl font-bold hover:bg-white/30 transition disabled:opacity-50 disabled:cursor-not-allowed border border-white/30"
                  >
                    Pay
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white/10 p-4 rounded-xl flex items-center justify-center gap-3 mt-2">
            <CheckCircle2 className="text-green-400 w-6 h-6" />
            <span className="font-medium text-white">All caught up! No pending bills.</span>
          </div>
        )}
      </Card>

      {statement.totalAmountDue > 0 && (
        <Card>
          <h3 className="font-bold text-fintech-primary mb-4 border-b pb-2">Bill Breakdown</h3>
          <div className="space-y-4">
            {statement.items.map(item => (
              <div key={item.id} className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-fintech-primary font-medium">{item.description || item.type}</span>
                  <span className="text-xs text-fintech-secondary">
                    {item.type} {item.lenderName ? `• ${item.lenderName}` : ''}
                  </span>
                </div>
                <span className="font-bold text-fintech-primary">₹{item.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t flex justify-between items-center">
            <span className="text-sm text-fintech-secondary">Minimum Due</span>
            <span className="font-bold text-fintech-primary">₹{statement.minAmountDue.toLocaleString()}</span>
          </div>
        </Card>
      )}
    </div>
  );
};
