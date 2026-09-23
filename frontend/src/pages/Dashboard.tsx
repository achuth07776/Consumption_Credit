import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { CreditUtilizationBar } from '../components/CreditUtilizationBar';
import { TransactionCard } from '../components/TransactionCard';
import { useAuth } from '../context/AuthContext';
import { creditApi } from '../api/creditApi';
import { transactionApi } from '../api/transactionApi';
import { CreditLine, Transaction } from '../types';
import { ArrowRight, ShieldCheck, Calendar, Activity, AlertTriangle, Loader2, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Dashboard = () => {
  const { user } = useAuth();
  const [creditLines, setCreditLines] = useState<CreditLine[]>([]);
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Emergency Modal States
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [requestingEmergency, setRequestingEmergency] = useState(false);
  const [emergencyAmount, setEmergencyAmount] = useState('5000');
  const [emergencySuccess, setEmergencySuccess] = useState(false);
  const [emergencyTargetId, setEmergencyTargetId] = useState<string>('');
  const [emergencySecurityType, setEmergencySecurityType] = useState('Guarantor');
  const [emergencySecurityDetails, setEmergencySecurityDetails] = useState('');

  const isEmergencyAllowed = (line: any) => {
    if (line.hasRequestedEmergency && !line.lastEmergencyRequestDate) return false;
    if (line.lastEmergencyRequestDate) {
      const diffTime = Math.abs(new Date().getTime() - new Date(line.lastEmergencyRequestDate).getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 30;
    }
    return true;
  };

  const handleEmergencyRequest = async () => {
    if (!user || !emergencyTargetId) return;
    setRequestingEmergency(true);
    try {
      const res = await creditApi.requestEmergencyLimit(user.id, Number(emergencyAmount), emergencyTargetId, emergencySecurityType, emergencySecurityDetails);
      setCreditLines(prev => prev.map(line => line.id === emergencyTargetId ? {
        ...line,
        totalLimit: res.newLimit,
        availableLimit: line.availableLimit + Number(emergencyAmount),
        interestRate: res.newInterestRate,
        hasRequestedEmergency: true,
        lastEmergencyRequestDate: new Date().toISOString(),
        emergencySecurityType,
        emergencySecurityDetails
      } : line));
      setEmergencySuccess(true);
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Failed to request emergency package.');
    } finally {
      setRequestingEmergency(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      try {
        const [lines, txns] = await Promise.all([
          creditApi.getAllCreditLines(user.id),
          transactionApi.getTransactions(user.id)
        ]);
        setCreditLines(lines);
        setRecentTxns(txns.slice(0, 3)); // top 3
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  if (loading) return <div className="p-8 text-center text-fintech-secondary">Loading your dashboard...</div>;
  if (!creditLines || creditLines.length === 0) return <div className="p-8 text-center text-fintech-danger">Failed to load credit data.</div>;

  const combinedNextPaymentDue = creditLines.reduce((acc, line) => acc + (line.nextPaymentDue?.amount || 0), 0);
  const primaryLine = creditLines[0];

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-fintech-primary">Hello, {user?.name.split(' ')[0]} 👋</h1>
        <p className="text-fintech-secondary">Here is your ConsumptionCredit summary.</p>
      </header>

      <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar">
        {creditLines.map(creditInfo => (
          <Card key={creditInfo.id} className="min-w-[340px] flex-1 snap-start bg-gradient-to-br from-fintech-primary to-fintech-accent text-white border-none shadow-xl flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-gray-300 text-sm">Available Limit</p>
                <h2 className="text-4xl font-bold mt-1">₹{creditInfo.availableLimit.toLocaleString()}</h2>
              </div>
              {creditInfo.lenderName && (
                <div className="text-right shrink-0 ml-4">
                  <p className="text-[10px] text-emerald-300 font-medium uppercase tracking-wider mb-1">Provided By</p>
                  <p className="text-sm font-bold text-white whitespace-nowrap bg-white/10 px-2 py-1 rounded border border-white/20">
                    {creditInfo.lenderName}
                  </p>
                </div>
              )}
            </div>
            
            <div className="bg-white/10 rounded-xl p-4 mb-4 backdrop-blur-sm">
              <CreditUtilizationBar total={creditInfo.totalLimit} used={creditInfo.utilizedLimit} />
            </div>

            <div className="mt-auto pt-4 border-t border-white/20">
              <button 
                onClick={() => {
                  if (!isEmergencyAllowed(creditInfo)) return;
                  setEmergencyTargetId(creditInfo.id);
                  setShowEmergencyModal(true);
                  setEmergencySecurityType('Guarantor');
                  setEmergencySecurityDetails('');
                }}
                disabled={!isEmergencyAllowed(creditInfo)}
                className={`w-full flex items-center justify-center gap-2 transition py-2.5 rounded-lg font-medium text-sm ${
                  !isEmergencyAllowed(creditInfo)
                  ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30 cursor-not-allowed' 
                  : 'bg-rose-500/20 text-rose-200 border border-rose-500/30 hover:bg-rose-500/30'
                }`}
              >
                <AlertTriangle size={16} /> {!isEmergencyAllowed(creditInfo) ? 'Used within 30 days' : 'Request Emergency Package'}
              </button>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex gap-4">
        <Link to="/pay" className="flex-1 bg-fintech-primary text-white text-center py-3 rounded-lg font-bold hover:bg-slate-800 transition">
          Pay Now
        </Link>
        <Link to="/bills" className="flex-1 bg-white border-2 border-fintech-primary text-fintech-primary text-center py-3 rounded-lg font-bold hover:bg-gray-50 transition">
          View Unified Bill
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="flex items-center gap-4 hover:shadow-md transition">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-full"><Calendar size={24} /></div>
          <div>
            <p className="text-sm text-fintech-secondary">Unified Next Payment Due</p>
            <p className="font-bold text-lg">₹{combinedNextPaymentDue.toLocaleString()}</p>
            <p className="text-xs text-fintech-secondary">Due by {primaryLine.nextPaymentDue?.date}</p>
          </div>
        </Card>

        <Link to="/credit-health">
          <Card className="flex items-center gap-4 hover:shadow-md transition cursor-pointer">
            <div className="p-3 bg-green-50 text-green-600 rounded-full"><ShieldCheck size={24} /></div>
            <div>
              <p className="text-sm text-fintech-secondary">Credit Line Score</p>
              <div className="flex items-baseline gap-2">
                <p className="font-bold text-lg text-green-700">{Math.min(90, primaryLine.health.behaviorScore)}/100</p>
                <span className="text-xs font-medium text-green-600 uppercase">({primaryLine.health.riskLevel} RISK)</span>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      <Card>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-fintech-primary flex items-center gap-2">
            <Activity size={18} /> Recent Transactions
          </h3>
          <Link to="/transactions" className="text-sm text-blue-600 hover:underline flex items-center">
            View All <ArrowRight size={14} className="ml-1" />
          </Link>
        </div>
        <div className="divide-y divide-fintech-border -mx-5 px-1">
          {recentTxns.map(txn => (
            <TransactionCard key={txn.id} transaction={txn} />
          ))}
        </div>
      </Card>

      {/* Emergency Modal */}
      {showEmergencyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-fade-in">
            <button 
              onClick={() => { setShowEmergencyModal(false); setEmergencySuccess(false); }}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={32} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Emergency Package</h2>
              <p className="text-sm text-gray-500 mt-2">
                Instantly increase your credit limit for emergencies. This comes with a +5% interest rate penalty on your total limit.
              </p>
            </div>

            {emergencySuccess ? (
              <div className="text-center py-4">
                <div className="bg-green-50 text-green-700 p-4 rounded-xl border border-green-200 mb-6">
                  <p className="font-bold">Emergency Limit Approved!</p>
                  <p className="text-sm mt-1">Your new limit is active.</p>
                </div>
                <button 
                  onClick={() => { setShowEmergencyModal(false); setEmergencySuccess(false); }}
                  className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Amount</label>
                  <select 
                    value={emergencyAmount} 
                    onChange={(e) => setEmergencyAmount(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition bg-white"
                  >
                    <option value="5000">₹5,000 Extra</option>
                    <option value="10000">₹10,000 Extra</option>
                    <option value="25000">₹25,000 Extra</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Security Type</label>
                  <select 
                    value={emergencySecurityType} 
                    onChange={(e) => setEmergencySecurityType(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition bg-white"
                  >
                    <option value="Guarantor">Guarantor</option>
                    <option value="Fixed Deposit">Fixed Deposit</option>
                    <option value="Vehicle">Vehicle</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Security Details</label>
                  <input 
                    type="text"
                    value={emergencySecurityDetails} 
                    onChange={(e) => setEmergencySecurityDetails(e.target.value)}
                    placeholder="Enter relevant details (e.g., account no, name)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition bg-white"
                  />
                </div>

                <div className="bg-orange-50 border border-orange-200 text-orange-800 p-3 rounded-xl text-xs font-medium flex gap-2 items-start">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <p>By proceeding, you agree to a higher interest rate (+5% p.a.) on all future utilizations.</p>
                </div>

                <button
                  onClick={handleEmergencyRequest}
                  disabled={requestingEmergency}
                  className="w-full bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {requestingEmergency ? <Loader2 className="animate-spin" size={20} /> : 'Accept & Increase Limit'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
