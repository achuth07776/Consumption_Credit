import React from 'react';
import { ShieldAlert, CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react';
import { mockRiskLogs } from '../api/mockData';
import { RiskLogRecord } from '../types';

export const RiskLogs = () => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
      case 'GRANTED':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</span>;
      case 'REJECTED':
      case 'DENIED':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800"><XCircle className="w-3 h-3 mr-1" /> Rejected</span>;
      case 'CONSENT_MISSING':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800"><AlertCircle className="w-3 h-3 mr-1" /> Consent Missing</span>;
      default:
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><Info className="w-3 h-3 mr-1" /> Skipped</span>;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center">
            <ShieldAlert className="w-6 h-6 mr-2 text-indigo-600" />
            Risk Engine Logs
          </h1>
          <p className="text-gray-500 mt-1">Admin view of the Multi-Lender Orchestration and Onboarding results.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-100">
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date & Time</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">User VPA</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">UPI Score</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bank A (Min 90)</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bank B (Min 85)</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bank C (Fallback)</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Final Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mockRiskLogs.map((log: RiskLogRecord) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition">
                  <td className="p-4 text-sm text-gray-600">
                    <div>{new Date(log.date).toLocaleDateString()}</div>
                    <div className="text-xs text-gray-400">{new Date(log.date).toLocaleTimeString()}</div>
                  </td>
                  <td className="p-4 font-medium text-slate-900">{log.vpa}</td>
                  <td className="p-4">
                    <div className={`font-bold ${log.behaviorScore >= 80 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {log.behaviorScore}
                    </div>
                  </td>
                  <td className="p-4">{getStatusBadge(log.bankA_status)}</td>
                  <td className="p-4">{getStatusBadge(log.bankB_status)}</td>
                  <td className="p-4">{getStatusBadge(log.bankC_status)}</td>
                  <td className="p-4">
                    <div className="flex flex-col items-start gap-1">
                      {getStatusBadge(log.finalOutcome)}
                      {log.reason && (
                        <span className="text-[10px] text-gray-500 max-w-[150px] leading-tight">
                          {log.reason}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
