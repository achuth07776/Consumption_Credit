import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { creditApi } from '../api/creditApi';
import { useAuth } from '../context/AuthContext';
import { LimitHistoryRecord } from '../types';
import { ArrowLeft, ArrowDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const LimitHistory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState<LimitHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      creditApi.getLimitHistory(user.id)
        .then(setHistory)
        .finally(() => setLoading(false));
    }
  }, [user]);

  if (loading) return <div className="text-center p-8 text-fintech-secondary">Loading history...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="text-fintech-secondary hover:text-fintech-primary flex items-center gap-2 mb-4">
        <ArrowLeft size={18} /> Back to Credit Health
      </button>

      <h1 className="text-2xl font-bold text-fintech-primary">Credit Limit History</h1>

      <div className="space-y-4">
        {history.map((record, index) => (
          <React.Fragment key={record.id}>
            <Card className="text-center">
              <div className="flex justify-around items-center">
                <div>
                  <p className="text-sm text-fintech-secondary">Previous Limit</p>
                  <p className="text-xl font-bold text-gray-400 line-through">₹{record.previousLimit.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-fintech-secondary">New Limit</p>
                  <p className="text-2xl font-bold text-green-600">₹{record.newLimit.toLocaleString()}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-fintech-border text-sm text-fintech-primary bg-gray-50 rounded-lg p-3 text-left">
                <span className="font-semibold text-gray-500 mr-2">{new Date(record.date).toLocaleDateString()}</span>
                {record.reason}
              </div>
            </Card>
            {index !== history.length - 1 && (
              <div className="flex justify-center text-gray-300">
                <ArrowDown size={24} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
