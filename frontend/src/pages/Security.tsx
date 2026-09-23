import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { mockConsentHistory } from '../api/mockData';
import { ConsentRecord } from '../types';
import { ShieldAlert, Shield } from 'lucide-react';

export const Security = () => {
  const [history, setHistory] = useState<ConsentRecord[]>([]);

  useEffect(() => {
    // In reality this would be an API call to a consentApi
    setTimeout(() => {
      setHistory(mockConsentHistory);
    }, 500);
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="text-fintech-primary" size={28} />
        <h1 className="text-2xl font-bold text-fintech-primary">Security & Consent</h1>
      </div>

      <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-xl text-sm flex gap-3">
        <ShieldAlert size={20} className="shrink-0 mt-0.5" />
        <p>ConsumptionCredit never silently assumes consent. Every action requiring access to your data or credit line is logged here immutably.</p>
      </div>

      <Card>
        <h3 className="font-bold text-fintech-primary mb-4 border-b pb-2">Consent Audit Log</h3>
        
        {history.length > 0 ? (
          <div className="space-y-4">
            {history.map(record => (
              <div key={record.id} className="flex justify-between items-start border-b border-fintech-border last:border-0 pb-4 last:pb-0">
                <div>
                  <p className="font-bold text-fintech-primary mb-1">{record.purpose}</p>
                  <p className="text-sm text-fintech-secondary mb-1">{record.description}</p>
                  <p className="text-xs text-gray-400">{new Date(record.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <StatusBadge status={record.status} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-fintech-secondary">No consent records found.</div>
        )}
      </Card>
    </div>
  );
};
