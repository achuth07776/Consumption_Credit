import React, { useState, useEffect } from 'react';
import { Search, Link as LinkIcon, CheckCircle, Loader2 } from 'lucide-react';

interface AccountDiscoveryModalProps {
    pan: string;
    vpa: string;
    onLinked: () => void;
}

export const AccountDiscoveryModal: React.FC<AccountDiscoveryModalProps> = ({ pan, vpa, onLinked }) => {
    const [step, setStep] = useState<'DISCOVERING' | 'FOUND' | 'OTP' | 'LINKED'>('DISCOVERING');
    const [otp, setOtp] = useState('');

    useEffect(() => {
        if (step === 'DISCOVERING') {
            const timer = setTimeout(() => {
                setStep('FOUND');
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [step]);

    const handleSendOtp = () => {
        setStep('OTP');
    };

    const handleVerifyOtp = () => {
        if (otp.length >= 4) {
            setStep('LINKED');
            setTimeout(() => {
                onLinked();
            }, 1500);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in">
                
                {step === 'DISCOVERING' && (
                    <div className="text-center py-8">
                        <div className="relative w-16 h-16 mx-auto mb-6">
                            <div className="absolute inset-0 border-4 border-blue-100 rounded-full animate-ping"></div>
                            <div className="relative bg-blue-600 text-white rounded-full w-full h-full flex items-center justify-center">
                                <Search size={28} />
                            </div>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Discovering Accounts</h2>
                        <p className="text-gray-500">Searching for bank accounts linked to {pan} / {vpa}</p>
                    </div>
                )}

                {step === 'FOUND' && (
                    <div className="text-center animate-fade-in">
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <LinkIcon size={28} />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Accounts Discovered</h2>
                        <p className="text-gray-500 mb-6">We found the following accounts linked to your profile.</p>
                        
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left mb-6">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-gray-900">Demo Bank</p>
                                    <p className="text-sm text-gray-500">Savings ••••1234</p>
                                </div>
                                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded">Active</span>
                            </div>
                        </div>

                        <button 
                            onClick={handleSendOtp}
                            className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl hover:bg-slate-800 transition"
                        >
                            Link Account via OTP
                        </button>
                    </div>
                )}

                {step === 'OTP' && (
                    <div className="text-center animate-fade-in">
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Verify Account</h2>
                        <p className="text-gray-500 mb-6">Enter the OTP sent to your registered mobile number for Demo Bank.</p>
                        
                        <input 
                            type="text" 
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            maxLength={6}
                            placeholder="Enter OTP"
                            className="w-full text-center text-2xl tracking-widest px-4 py-4 border-2 border-slate-200 rounded-xl focus:border-blue-600 outline-none mb-6 font-mono"
                            autoFocus
                        />

                        <button 
                            onClick={handleVerifyOtp}
                            disabled={otp.length < 4}
                            className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
                        >
                            Verify & Link
                        </button>
                    </div>
                )}

                {step === 'LINKED' && (
                    <div className="text-center py-8 animate-fade-in">
                        <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Linked!</h2>
                        <p className="text-gray-500">Successfully linked your Demo Bank account to the Aggregator.</p>
                    </div>
                )}

            </div>
        </div>
    );
};
