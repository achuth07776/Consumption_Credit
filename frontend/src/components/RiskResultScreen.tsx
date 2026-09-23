import React from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { RiskAssessmentResponse } from '../api/aaApi';

interface RiskResultScreenProps {
    assessment: RiskAssessmentResponse;
    onContinue: () => void;
}

export const RiskResultScreen: React.FC<RiskResultScreenProps> = ({ assessment, onContinue }) => {
    return (
        <div className="max-w-md mx-auto animate-fade-in p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck size={32} />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Credit Assessment</h2>
                <p className="text-sm text-gray-500 mt-2">
                    ConsumptionCredit Behavioral Risk Score
                </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 mb-6 text-center border border-slate-200">
                <h3 className="text-5xl font-black text-slate-800 mb-2">{assessment.riskScore} <span className="text-2xl text-gray-400 font-medium">/ 1000</span></h3>
                <div className="inline-block px-4 py-1 bg-green-100 text-green-800 rounded-full text-sm font-bold tracking-wide mb-4">
                    {assessment.riskLevel} RISK
                </div>
                
                <div className="border-t border-slate-200 pt-4 mt-2">
                    <p className="text-sm text-gray-500 mb-1">Recommended Limit</p>
                    <p className="text-3xl font-bold text-blue-600">₹{assessment.recommendedLimit.toLocaleString()}</p>
                </div>
            </div>

            <div className="mb-8">
                <h4 className="font-bold text-gray-900 mb-3">Why?</h4>
                <ul className="space-y-3">
                    {assessment.explanation.map((reason, idx) => (
                        <li key={idx} className="flex gap-3 text-sm text-gray-700">
                            <Check size={18} className="text-green-500 shrink-0" />
                            <span>{reason}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <button 
                onClick={onContinue}
                className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl hover:bg-slate-800 transition"
            >
                View Dashboard
            </button>
        </div>
    );
};
