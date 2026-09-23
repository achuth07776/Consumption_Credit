import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, X } from 'lucide-react';
import { aaApi, ConsentRecord } from '../api/aaApi';

interface ConsentModalProps {
    userId: string;
    onGranted: (consent: ConsentRecord) => void;
    onDeclined: () => void;
}

export const ConsentModal: React.FC<ConsentModalProps> = ({ userId, onGranted, onDeclined }) => {
    const [loading, setLoading] = useState(false);
    const [consent, setConsent] = useState<ConsentRecord | null>(null);
    const [error, setError] = useState('');

    const handleCreateConsent = async () => {
        setLoading(true);
        try {
            const newConsent = await aaApi.createConsent(userId, 'CREDIT_ASSESSMENT', ['TRANSACTIONS', 'BALANCE']);
            setConsent(newConsent);
        } catch (err: any) {
            setError(err.message || 'Failed to create consent request');
        } finally {
            setLoading(false);
        }
    };

    // Auto-create consent on mount
    React.useEffect(() => {
        handleCreateConsent();
    }, []);

    const handleApprove = async () => {
        if (!consent) return;
        setLoading(true);
        try {
            const granted = await aaApi.approveConsent(consent.consentId);
            onGranted(granted);
        } catch (err: any) {
            setError(err.message || 'Failed to approve consent');
            setLoading(false);
        }
    };

    const handleDecline = async () => {
        if (consent) {
            try {
                await aaApi.rejectConsent(consent.consentId);
            } catch (e) {}
        }
        onDeclined();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-fade-in">
                <button onClick={handleDecline} className="absolute right-4 top-4 text-gray-400 hover:text-gray-600">
                    <X size={20} />
                </button>

                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ShieldAlert size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">Financial Information Consent</h2>
                    <p className="text-sm text-gray-500 mt-2 text-left">
                        ConsumptionCredit wants to use your financial information to assess credit eligibility using an Account Aggregator.
                    </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-200">
                    <p className="text-sm font-bold text-gray-700 mb-2">Information requested:</p>
                    <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-green-500" /> Transaction information</li>
                        <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-green-500" /> Account balance information</li>
                    </ul>
                    <p className="text-sm font-bold text-gray-700 mt-4 mb-1">Purpose:</p>
                    <p className="text-sm text-gray-600">Credit Assessment</p>
                </div>

                {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

                <div className="flex gap-4">
                    <button 
                        onClick={handleDecline}
                        disabled={loading}
                        className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200 transition disabled:opacity-50"
                    >
                        Decline
                    </button>
                    <button 
                        onClick={handleApprove}
                        disabled={loading || !consent}
                        className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
                    >
                        {loading ? 'Processing...' : 'Give Consent'}
                    </button>
                </div>
            </div>
        </div>
    );
};
