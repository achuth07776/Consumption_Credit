import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Landmark, Zap, ArrowRight, Percent, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { creditApi } from '../api/creditApi';
import { CreditLine } from '../types';
import { useNavigate } from 'react-router-dom';

export const LendersMarketplace = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [score, setScore] = useState<number | null>(null);
  const [creditLines, setCreditLines] = useState<CreditLine[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'prime' | 'nbfc'>('all');

  useEffect(() => {
    if (user) {
      creditApi.getAllCreditLines(user.id).then(lines => {
        setCreditLines(lines);
        if (lines.length > 0) {
          setScore(lines[0].health.behaviorScore);
        }
      }).catch(() => setScore(780)); // fallback
    }
  }, [user]);

  const handleActivate = (lenderName: string) => {
    alert(`Successfully activated ${lenderName} and granted VPA mandate!`);
    navigate('/');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header Card */}
      <Card className="bg-[#101426] text-white border-0 shadow-lg p-6 md:p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center shrink-0">
              <Landmark className="text-emerald-400" size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Lenders Marketplace</h1>
          </div>
          <div className="px-4 py-1.5 bg-emerald-900/40 border border-emerald-500/30 text-emerald-400 rounded-full text-sm font-semibold tracking-wide">
            Score-Mapped Marketplace
          </div>
        </div>

        <div className="flex items-start gap-3 bg-white/5 p-4 rounded-xl border border-white/5">
          <Zap className="text-yellow-400 shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-slate-300">
            Based on your <strong className="text-white">Thin-File UPI Behavioral Score {score || 780} / 1000</strong>, partner banks & NBFCs have pre-approved credit lines matching your risk tier.
          </p>
        </div>
      </Card>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button 
            onClick={() => setActiveTab('all')}
            className={`py-4 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'all' ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            All Score-Mapped Offers ({creditLines.length})
          </button>
          <button 
            onClick={() => setActiveTab('prime')}
            className={`py-4 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'prime' ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Prime Banks ({creditLines.filter(c => c.lenderName.toLowerCase().includes('bank') || c.lenderName.toLowerCase().includes('sbi') || c.lenderName.toLowerCase().includes('icici') || c.lenderName.toLowerCase().includes('hdfc')).length})
          </button>
          <button 
            onClick={() => setActiveTab('nbfc')}
            className={`py-4 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'nbfc' ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Partner NBFCs ({creditLines.filter(c => !(c.lenderName.toLowerCase().includes('bank') || c.lenderName.toLowerCase().includes('sbi') || c.lenderName.toLowerCase().includes('icici') || c.lenderName.toLowerCase().includes('hdfc'))).length})
          </button>
        </nav>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {creditLines.length === 0 ? (
          <div className="col-span-1 md:col-span-2 text-center py-12 text-gray-500">
            No credit lines available. Complete onboarding to get pre-approved offers.
          </div>
        ) : (
          creditLines.filter(line => {
            const isBank = line.lenderName.toLowerCase().includes('bank') || line.lenderName.toLowerCase().includes('sbi') || line.lenderName.toLowerCase().includes('icici') || line.lenderName.toLowerCase().includes('hdfc');
            if (activeTab === 'prime') return isBank;
            if (activeTab === 'nbfc') return !isBank;
            return true;
          }).map((line) => (
            <Card key={line.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-gray-900">{line.lenderName}</h3>
                  <span className="inline-block mt-2 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold uppercase tracking-wider">
                    APPROVED PARTNER
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-0.5">Approved Limit</p>
                  <p className="text-xl font-black text-emerald-600">₹{line.totalLimit.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-6 mb-6 text-sm text-gray-600">
                <div className="flex items-center gap-1.5">
                  <Percent size={14} className="text-gray-400" />
                  <span>{line.interestRate}% p.a.</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FileText size={14} className="text-gray-400" />
                  <span>Fee: ₹0</span>
                </div>
              </div>

              <button 
                onClick={() => handleActivate(line.lenderName)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#101426] text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors text-sm"
              >
                Activate Line & Grant VPA Mandate <ArrowRight size={16} />
              </button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
