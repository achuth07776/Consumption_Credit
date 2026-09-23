import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { creditApi } from '../api/creditApi';
import { useAuth } from '../context/AuthContext';
import { CreditLine } from '../types';
import { ShieldCheck, TrendingUp, Zap, ArrowRight, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

export const CreditHealth = () => {
  const { user } = useAuth();
  const [credit, setCredit] = useState<CreditLine | null>(null);
  const [activeTab, setActiveTab] = useState<'signals' | 'history'>('signals');
  const [loadingAction, setLoadingAction] = useState(false);

  useEffect(() => {
    if (user) {
      creditApi.getCreditStatus(user.id).then(setCredit);
    }
  }, [user]);

  if (!credit) return <div className="text-center p-8 text-fintech-secondary">Loading health data...</div>;

  const signals = [
    { name: 'Transaction Frequency', score: 85, status: 'OPTIMAL', color: 'emerald', evidence: '28 transactions/month spread regularly across 90 days.' },
    { name: 'Transaction Consistency', score: 88, status: 'OPTIMAL', color: 'emerald', evidence: 'High activity spread across daily small-ticket payments.' },
    { name: 'Bill Payment Regularity', score: 100, status: 'OPTIMAL', color: 'emerald', evidence: '3/3 utility bills paid on time every month.' },
    { name: 'Category Diversity', score: 80, status: 'GOOD', color: 'blue', evidence: 'Active across 5 merchant categories.' },
    { name: 'Average Txn Value', score: 82, status: 'GOOD', color: 'blue', evidence: 'Avg transaction ticket size ₹450.' },
    { name: 'Cash-Flow Inflows', score: 90, status: 'OPTIMAL', color: 'emerald', evidence: 'Verified monthly salary credit inflows.' },
    { name: 'Cash-Flow Stability', score: 85, status: 'OPTIMAL', color: 'emerald', evidence: 'Stable cash balance reserves maintained.' },
    { name: 'Failed Txn Rate', score: 95, status: 'OPTIMAL', color: 'emerald', evidence: 'Clean history with 0 payment failures.' },
    { name: 'Platform Repayments', score: 80, status: 'GOOD', color: 'blue', evidence: '2 consecutive on-time bill repayments.' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credit Health & Bureau Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Thin-File User: Scored via 9-Signal UPI Behavior Engine</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-sm font-semibold border border-emerald-100">
          <Activity size={16} />
          Closed-Loop Dynamic Limits Active
        </div>
      </div>

      {/* Top Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Behavioral Score Card */}
        <Card className="bg-[#101426] text-white p-6 border-0 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-slate-400 tracking-wider">BEHAVIORAL SCORE</p>
            <ShieldCheck className="text-indigo-400" size={20} />
          </div>
          <div className="flex items-baseline gap-2 mb-8">
            <span className="text-5xl font-black">{Math.min(90, credit.health.behaviorScore)}</span>
            <span className="text-xl text-slate-400 font-medium">/ 100</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400">Status Badge:</span>
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-xs font-bold tracking-wider uppercase">
              {credit.health.riskLevel} RISK
            </span>
          </div>
        </Card>

        {/* Current Limit Card */}
        <Card className="p-6 border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-gray-500 tracking-wider">CURRENT CREDIT LIMIT</p>
            <TrendingUp className="text-blue-500" size={20} />
          </div>
          <h2 className="text-4xl font-black text-gray-900 mb-8">₹{credit.health.currentLimit.toLocaleString()}</h2>
          <div className="flex justify-between items-center pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-500">On-Time Streak:</span>
            <span className="text-sm font-bold text-gray-900">2 Repayment Cycles</span>
          </div>
        </Card>

        {/* Next Growth Step Card */}
        <Card className="bg-indigo-50 border border-indigo-100 p-6 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-bold text-indigo-400 tracking-wider mb-4">NEXT GROWTH STEP</p>
          <div>
            <h2 className="text-4xl font-black text-gray-900 mb-2">₹{(credit.health.recommendedLimit || credit.health.currentLimit * 1.5).toLocaleString()}</h2>
            <p className="text-sm text-indigo-800 mb-6">Achieved via 1 more on-time repayment cycle</p>
          </div>
          <div className="space-y-3">
            <button 
              onClick={async () => {
                if (!user) return;
                setLoadingAction(true);
                const updated = await creditApi.simulateOnTimePayment(user.id);
                setCredit(updated);
                setLoadingAction(false);
              }}
              disabled={loadingAction}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors text-sm shadow-sm disabled:opacity-50"
            >
              Test Closed-Loop Growth <ArrowRight size={16} />
            </button>
            <button 
              onClick={async () => {
                if (!user) return;
                setLoadingAction(true);
                const updated = await creditApi.simulateLatePayment(user.id);
                setCredit(updated);
                setLoadingAction(false);
              }}
              disabled={loadingAction}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-rose-50 text-rose-600 rounded-lg font-semibold hover:bg-rose-100 transition-colors text-sm border border-rose-200 disabled:opacity-50"
            >
              Simulate Late Payment
            </button>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mt-8">
        <nav className="flex space-x-8">
          <button 
            onClick={() => setActiveTab('signals')}
            className={`py-4 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'signals' ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            9 UPI Behavioral Signals
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`py-4 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'history' ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Raw UPI Payment History (5)
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6 mt-6">
        {activeTab === 'signals' && (
          <>
            <div className="flex items-start gap-3 text-sm text-gray-600 mb-6">
              <Zap className="text-yellow-500 shrink-0 mt-0.5" size={18} />
              <p>
                Our alternative underwriting engine extracts <strong className="text-gray-900">9 quantitative signals</strong> directly from your UPI transaction behavior to determine your initial credit limit and dynamic growth trajectory.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {signals.map((signal, idx) => (
                <Card key={idx} className="p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-gray-900">{signal.name}</h3>
                    <span className={`text-sm font-bold text-${signal.color}-600`}>
                      {signal.score}/100 ({signal.status})
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
                    <div 
                      className={`h-2 rounded-full bg-${signal.color}-500`} 
                      style={{ width: `${signal.score}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500">
                    <strong className="text-gray-700">Evidence:</strong> {signal.evidence}
                  </p>
                </Card>
              ))}
            </div>
          </>
        )}

        {activeTab === 'history' && (
          <Card className="p-0 overflow-hidden border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white">
              <h3 className="font-bold text-gray-900">UPI Payments & Cash-Flow History</h3>
              <span className="text-xs text-gray-500">90-Day Transaction Log</span>
            </div>
            <div className="divide-y divide-gray-100 bg-white">
              {[
                { name: 'BESCOM Electricity Bill', category: 'Utility & Bills', date: '8/17/2026', amount: '-₹1,450', status: 'SUCCESS', type: 'debit', iconColor: 'text-orange-500', bg: 'bg-orange-50' },
                { name: 'Blinkit Grocery', category: 'Grocery & Supermarket', date: '8/16/2026', amount: '-₹640', status: 'SUCCESS', type: 'debit', iconColor: 'text-gray-500', bg: 'bg-gray-50' },
                { name: 'Swiggy Food', category: 'Food & Dining', date: '8/15/2026', amount: '-₹380', status: 'SUCCESS', type: 'debit', iconColor: 'text-gray-500', bg: 'bg-gray-50' },
                { name: 'Employer Salary Inflow', category: 'Income Inflow', date: '8/14/2026', amount: '+₹45,000', status: 'SUCCESS', type: 'credit', iconColor: 'text-emerald-500', bg: 'bg-emerald-50' },
                { name: 'Uber Ride', category: 'Travel & Commute', date: '8/13/2026', amount: '-₹240', status: 'SUCCESS', type: 'debit', iconColor: 'text-gray-500', bg: 'bg-gray-50' },
              ].map((txn, idx) => (
                <div key={idx} className="flex justify-between items-center p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${txn.bg} ${txn.iconColor}`}>
                      <Zap size={16} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{txn.name}</p>
                      <p className="text-xs text-gray-500">{txn.category} • {txn.date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-sm ${txn.type === 'credit' ? 'text-emerald-600' : 'text-gray-900'}`}>{txn.amount}</p>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">{txn.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

    </div>
  );
};
