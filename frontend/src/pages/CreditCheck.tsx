import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { eligibilityApi } from '../api/eligibilityApi';
import { creditApi } from '../api/creditApi';
import { ShieldCheck, Target, Loader2, Info, Activity, Zap, Building2, ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export const CreditCheck = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [score, setScore] = useState<number | null | undefined>(undefined);
  const [isAlternative, setIsAlternative] = useState(false);

  const fetchScore = () => {
    setScore(undefined);
    if (user && user.vpa) {
      eligibilityApi.fetchCibilScore(user.vpa, 'ABCDE1234F').then((res) => {
        if (res.score === null) {
          creditApi.getCreditStatus(user.id).then((credit) => {
            setScore(credit.health.behaviorScore);
            setIsAlternative(true);
          }).catch(() => {
            setScore(null);
          });
        } else {
          setScore(res.score);
          setIsAlternative(false);
        }
      });
    }
  };

  useEffect(() => {
    fetchScore();
  }, [user]);

  if (score === undefined) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-fintech-secondary">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-emerald-500" />
        <p>Running Credit Check...</p>
      </div>
    );
  }

  // Calculate tier
  const isHighTier = score !== null && score >= 800;
  const isMidTier = score !== null && score >= 650 && score < 800;
  const isLowTier = score !== null && score < 650;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Official Credit Check & Risk Assessment</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAlternative ? 'Thin-File Path: Alternative 9-Signal UPI Behavioral Risk Assessment' : 'Standard Path: Official Bureau Assessment'}
          </p>
        </div>
        <button 
          onClick={fetchScore}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-semibold hover:bg-slate-800 transition-colors"
        >
          <Activity size={16} /> Re-Run Credit Check
        </button>
      </div>

      {isAlternative ? (
        // Thin-File UI
        <Card className="p-8 bg-[#1a174c] text-white border-0 shadow-lg relative overflow-hidden">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-xs font-bold text-slate-300 tracking-wider mb-1">ALTERNATIVE UNDERWRITING PATH</p>
              <h2 className="text-2xl font-bold">9-Signal UPI Behavioral Risk Score</h2>
            </div>
            <Zap className="text-yellow-400" size={32} />
          </div>

          <div className="flex items-start gap-3 bg-white/10 p-4 rounded-xl mb-8 border border-white/5">
            <Zap className="text-yellow-400 shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-slate-200 leading-relaxed">
              No CIBIL bureau history found (Thin-File). Evaluated using 9 quantitative signals from your UPI transaction behavior (frequency, consistency, utility bill punctuality, cash-flow inflows, and balance stability).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white/5 p-6 rounded-xl border border-white/5">
            <div>
              <p className="text-xs font-bold text-slate-400 tracking-wider mb-1">DYNAMIC SCORE</p>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-5xl font-black">{score}</span>
                <span className="text-xl text-slate-400 font-medium">/ 1000</span>
              </div>
              <div className="inline-block px-3 py-1 bg-indigo-500/30 text-indigo-200 rounded-full text-xs font-bold tracking-wider border border-indigo-500/50">
                LOW RISK THIN-FILE PROFILE
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-400 tracking-wider mb-3">Conservative Starting Limit Matrix:</p>
              <ul className="space-y-3 text-sm font-medium">
                <li className={`flex items-center gap-2 ${isHighTier ? 'text-emerald-400' : 'text-slate-300'}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  800 - 1000: ₹20,000 Starting Limit {isHighTier && '(Current Tier)'}
                </li>
                <li className={`flex items-center gap-2 ${isMidTier ? 'text-emerald-400' : 'text-slate-300'}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  650 - 799: ₹10,000 Starting Limit {isMidTier && '(Current Tier)'}
                </li>
                <li className={`flex items-center gap-2 ${isLowTier ? 'text-emerald-400' : 'text-slate-300'}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  500 - 649: ₹5,000 Starting Limit {isLowTier && '(Current Tier)'}
                </li>
              </ul>
            </div>
          </div>
        </Card>
      ) : (
        // Standard Bureau UI
        <Card className={`text-center p-8 bg-gradient-to-b ${isHighTier ? 'from-emerald-50' : isMidTier ? 'from-yellow-50' : 'from-rose-50'} to-white`}>
          <div className={`inline-flex justify-center items-center w-20 h-20 rounded-full mb-4 ${isHighTier ? 'bg-emerald-100 text-emerald-600' : isMidTier ? 'bg-yellow-100 text-yellow-600' : 'bg-rose-100 text-rose-600'}`}>
            <Target size={40} />
          </div>
          <p className="text-fintech-secondary font-medium mb-1">Your Bureau Score</p>
          
          <h2 className={`text-6xl font-black mb-2 ${isHighTier ? 'text-emerald-600' : isMidTier ? 'text-yellow-500' : 'text-rose-600'}`}>
            {score}
          </h2>
          <div className={`inline-block px-4 py-1 rounded-full text-sm font-bold tracking-wide ${isHighTier ? 'bg-emerald-100 text-emerald-800' : isMidTier ? 'bg-yellow-100 text-yellow-800' : 'bg-rose-100 text-rose-800'}`}>
            {isHighTier ? 'EXCELLENT' : isMidTier ? 'FAIR' : 'POOR'}
          </div>
        </Card>
      )}

      {(isAlternative || isHighTier || isMidTier) && (
        <Card className="bg-emerald-50 border border-emerald-100 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <Building2 size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">4 Partner Credit Lines Unlocked</h3>
              <p className="text-sm text-gray-600">
                Based on your credit assessment, pre-approved credit lines from partner lenders are ready for instant activation.
              </p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/marketplace')}
            className="w-full md:w-auto whitespace-nowrap flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors"
          >
            Open Lenders Marketplace <ArrowRight size={18} />
          </button>
        </Card>
      )}
    </div>
  );
};
