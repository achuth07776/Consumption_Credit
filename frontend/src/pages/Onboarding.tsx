import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { eligibilityApi } from '../api/eligibilityApi';
import { ShieldCheck, Loader2, AlertCircle, CheckCircle, Landmark, Percent, CreditCard, Camera, Fingerprint, ScanFace } from 'lucide-react';
import { LenderOffer } from '../types';
import { ConsentModal } from '../components/ConsentModal';
import { RiskResultScreen } from '../components/RiskResultScreen';
import { AccountDiscoveryModal } from '../components/AccountDiscoveryModal';
import { aaApi, ConsentRecord, RiskAssessmentResponse } from '../api/aaApi';
import { initializeCreditLines } from '../api/mockData';

export const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [vpa, setVpa] = useState(user?.vpa || '');
  const [name, setName] = useState(user?.name || '');
  const [pan, setPan] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [employment, setEmployment] = useState('');
  const [income, setIncome] = useState('');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'KYC_PROOF' | 'CIBIL_CHECK' | 'CIBIL_RESULT' | 'SCANNING' | 'SELECT_LENDER' | 'FINALIZING' | 'APPROVED' | 'REJECTED' | 'AA_DISCOVERY' | 'AA_CONSENT' | 'AA_ASSESSING' | 'AA_RESULT'>('IDLE');
  const [timeline, setTimeline] = useState<{ status: string; timestamp: string }[]>([]);
  const [offers, setOffers] = useState<LenderOffer[]>([]);
  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);
  const [acceptedTc, setAcceptedTc] = useState(false);
  const [finalScore, setFinalScore] = useState<number>(0);
  const [rejectReason, setRejectReason] = useState<string | undefined>();
  const [assessmentResult, setAssessmentResult] = useState<RiskAssessmentResponse | null>(null);
  const [cibilScore, setCibilScore] = useState<number | null>(null);

  // KYC States
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fingerprintProgress, setFingerprintProgress] = useState(0);
  const [isPressing, setIsPressing] = useState(false);
  const [kycCompleted, setKycCompleted] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPressing && fingerprintProgress < 100) {
      interval = setInterval(() => {
        setFingerprintProgress(p => {
          if (p >= 100) {
            setIsPressing(false);
            return 100;
          }
          return p + 2;
        });
      }, 30);
    }
    return () => clearInterval(interval);
  }, [isPressing, fingerprintProgress]);

  useEffect(() => {
    if (status === 'KYC_PROOF') {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => console.error("Camera access denied", err));
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
         const stream = videoRef.current.srcObject as MediaStream;
         stream.getTracks().forEach(track => track.stop());
      }
    }
  }, [status]);

  useEffect(() => {
    if (fingerprintProgress === 100) {
      if (pan.toUpperCase().includes('FAIL')) {
        setTimeout(() => {
          setRejectReason("Biometric verification failed. Your facial features or fingerprint do not match the official records for this PAN.");
          setTimeline([
            { status: 'Initializing biometric sensors...', timestamp: new Date().toISOString() },
            { status: 'Capturing facial landmarks...', timestamp: new Date().toISOString() },
            { status: 'Scanning fingerprint...', timestamp: new Date().toISOString() },
            { status: 'ERROR: Biometric Mismatch Detected.', timestamp: new Date().toISOString() }
          ]);
          setStatus('REJECTED');
        }, 500);
      } else {
        setTimeout(() => setKycCompleted(true), 500);
      }
    }
  }, [fingerprintProgress, pan]);

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);

  if (!user) {
    return null;
  }

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vpa || !name || !pan) return;
    
    setStatus('KYC_PROOF');
  };

  const handleKycContinue = async () => {
    setStatus('CIBIL_CHECK');
    
    // Simulate API delay for checking CIBIL
    setTimeout(async () => {
      const result = await eligibilityApi.fetchCibilScore(vpa, pan);
      setCibilScore(result.score);
      if (result.reason && result.score !== null && result.score < 600) {
          setRejectReason(result.reason);
      }
      setStatus('CIBIL_RESULT');
    }, 1500);
  };

  const handleCibilContinue = async () => {
    if (cibilScore === null) {
      // Thin file, go to AA
      setStatus('AA_DISCOVERY');
      return;
    }
    
    if (cibilScore < 600) {
      setStatus('REJECTED');
      return;
    }

    setStatus('SCANNING');
    setTimeline([]);
    const result = await eligibilityApi.evaluateEligibility(vpa, name, pan);
    
    // Animate the actual timeline returned by the API
    let logIndex = 0;
    const interval = setInterval(() => {
      if (result.timeline && logIndex < result.timeline.length) {
        const nextLog = result.timeline[logIndex];
        if (nextLog) {
          setTimeline(prev => [...prev, nextLog]);
        }
        logIndex++;
      } else {
        clearInterval(interval);
        if (result.success) {
          // Sort offers by approvedLimit (ascending), then interestRate (ascending)
          const sortedOffers = (result.offers || []).sort((a, b) => {
            if (a.approvedLimit === b.approvedLimit) {
              return a.interestRate - b.interestRate;
            }
            return a.approvedLimit - b.approvedLimit;
          });
          setOffers(sortedOffers);
          setFinalScore(result.score);
          setStatus('SELECT_LENDER');
        } else {
          setRejectReason(result.reason);
          setStatus('REJECTED');
        }
      }
    }, 800);
  };

  const handleAAGranted = async (consent: ConsentRecord) => {
    setStatus('AA_ASSESSING');
    try {
        const result = await aaApi.runRiskAssessment(user!.id, consent.consentId);
        setAssessmentResult(result);
        setStatus('AA_RESULT');
    } catch (err: any) {
        setRejectReason(err.message || 'Risk assessment failed');
        setStatus('REJECTED');
    }
  };

  const handleAADeclined = () => {
    setRejectReason("Consent to access financial information was declined. We cannot assess your eligibility without bureau data.");
    setStatus('REJECTED');
  };

  const handleAAContinue = () => {
    if (!assessmentResult) return;
    if (assessmentResult.riskLevel === 'HIGH') {
        setRejectReason("Behavioral risk level is too high based on financial data.");
        setStatus('REJECTED');
        return;
    }
    
    // Generate multiple offers based on AA recommendation
    const baseLimit = assessmentResult.recommendedLimit;
    setOffers([
        {
            id: `aa-offer-${Date.now()}-1`,
            name: 'SBI Credit Line',
            type: 'BANK',
            approvedLimit: baseLimit,
            interestRate: 12.5,
            processingFee: 199
        },
        {
            id: `aa-offer-${Date.now()}-2`,
            name: 'ICICI Instant Line',
            type: 'BANK',
            approvedLimit: baseLimit * 1.1, // slightly higher
            interestRate: 13.0,
            processingFee: 299
        },
        {
            id: `aa-offer-${Date.now()}-3`,
            name: 'HDFC FlexiPay',
            type: 'BANK',
            approvedLimit: baseLimit * 0.9, // slightly lower
            interestRate: 11.5,
            processingFee: 149
        },
        {
            id: `aa-offer-${Date.now()}-4`,
            name: 'Axis Bank Express Line',
            type: 'BANK',
            approvedLimit: baseLimit,
            interestRate: 12.0,
            processingFee: 199
        }
    ]);
    setFinalScore(assessmentResult.riskScore);
    setStatus('SELECT_LENDER');
  };

  const handleApplyOffers = () => {
    if (selectedOfferIds.length === 0) return;
    
    setStatus('FINALIZING');
    
    setTimeout(() => {
      const selectedBanks = offers.filter(o => selectedOfferIds.includes(o.id));
      
      // Provision ALL selected credit lines globally
      initializeCreditLines(selectedBanks, finalScore);
      setStatus('APPROVED');
    }, 2500);
  };

  const toggleBankSelection = (id: string) => {
    setSelectedOfferIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-900 p-8 text-white text-center">
          <ShieldCheck className="w-16 h-16 mx-auto mb-4 text-emerald-400" />
          <h1 className="text-2xl font-bold mb-2">Check Your Eligibility</h1>
          <p className="text-slate-400 text-sm">
            UPI transaction behavior is used as an alternative risk signal for thin-file users when traditional bureau data is unavailable.
          </p>
        </div>

        <div className="p-8">
          
          {status === 'IDLE' && (
            <form onSubmit={handleScan}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name (as per PAN)</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition" placeholder="E.g. Rahul Sharma" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number</label>
                  <input type="text" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition uppercase" placeholder="ABCDE1234F" maxLength={10} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition" placeholder="+91" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
                  <select value={employment} onChange={(e) => setEmployment(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition bg-white" required>
                    <option value="" disabled>Select Type</option>
                    <option value="salaried">Salaried</option>
                    <option value="self_employed">Self-Employed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Income</label>
                  <input type="number" value={income} onChange={(e) => setIncome(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition" placeholder="₹" required />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Address</label>
                  <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition" placeholder="Enter your full address" required />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm your UPI ID</label>
                  <input type="text" value={vpa} onChange={(e) => setVpa(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition" placeholder="name@bank" required />
                  <p className="text-xs text-gray-500 mt-2">
                    Tip: Enter "thin@ybl" (No CIBIL, Good UPI), or "thin-fail@ybl" (No CIBIL, Bad UPI).
                  </p>
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-slate-900 text-white font-semibold py-3 rounded-lg hover:bg-slate-800 transition shadow-lg"
              >
                Continue to KYC
              </button>
            </form>
          )}

          {status === 'KYC_PROOF' && (
            <div className="animate-fade-in space-y-8">
              <div className="text-center">
                <ScanFace className="w-12 h-12 mx-auto text-emerald-600 mb-3" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Identity Verification</h2>
                <p className="text-gray-600 text-sm">
                  Complete your KYC securely with a live video and fingerprint scan.
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border-2 border-slate-200">
                <h3 className="font-semibold text-slate-900 flex items-center mb-4">
                  <Camera className="w-5 h-5 mr-2 text-slate-500" />
                  1. Live Video Proof
                </h3>
                <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-inner">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover"
                  ></video>
                  <div className="absolute inset-0 border-4 border-emerald-500/30 rounded-xl pointer-events-none mix-blend-overlay"></div>
                  <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-white text-xs font-medium">REC</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border-2 border-slate-200 text-center">
                <h3 className="font-semibold text-slate-900 flex items-center justify-center mb-6">
                  <Fingerprint className="w-5 h-5 mr-2 text-slate-500" />
                  2. Biometric Verification
                </h3>
                
                <div className="relative flex justify-center items-center mb-4">
                  <div 
                    className={`w-32 h-32 rounded-full border-4 flex items-center justify-center cursor-pointer transition-all duration-300 ${fingerprintProgress === 100 ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-100'} ${isPressing ? 'scale-95 border-emerald-500 shadow-lg' : ''}`}
                    onMouseDown={() => { setFingerprintProgress(p => p < 100 ? p : p); setIsPressing(true); }}
                    onMouseUp={() => setIsPressing(false)}
                    onMouseLeave={() => setIsPressing(false)}
                    onTouchStart={() => { setFingerprintProgress(p => p < 100 ? p : p); setIsPressing(true); }}
                    onTouchEnd={() => setIsPressing(false)}
                  >
                    {fingerprintProgress === 100 ? (
                      <CheckCircle className="w-16 h-16 text-emerald-500" />
                    ) : (
                      <Fingerprint className={`w-16 h-16 ${isPressing ? 'text-emerald-500' : 'text-slate-400'}`} />
                    )}

                    {/* Progress Ring */}
                    <svg className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none" viewBox="0 0 128 128">
                      <circle
                        cx="64"
                        cy="64"
                        r="60"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="transparent"
                        className="text-emerald-500"
                        strokeDasharray={2 * Math.PI * 60}
                        strokeDashoffset={2 * Math.PI * 60 * (1 - fingerprintProgress / 100)}
                        style={{ transition: 'stroke-dashoffset 0.1s linear' }}
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-sm font-medium text-slate-600">
                  {fingerprintProgress === 100 ? 'Verification Complete' : 'Press and hold to scan fingerprint'}
                </p>
              </div>

              <button
                onClick={handleKycContinue}
                disabled={!kycCompleted}
                className="w-full bg-slate-900 text-white font-semibold py-4 rounded-xl hover:bg-slate-800 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-lg"
              >
                Continue <CheckCircle className="ml-2 w-5 h-5" />
              </button>
            </div>
          )}

          {status === 'CIBIL_CHECK' && (
            <div className="text-center animate-fade-in p-8">
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-emerald-600 mb-6" />
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Checking Bureau Score</h2>
              <p className="text-gray-600 text-sm">
                Securely fetching your credit history from CIBIL...
              </p>
            </div>
          )}

          {status === 'CIBIL_RESULT' && (
            <div className="text-center animate-fade-in p-8">
              <ShieldCheck className="w-16 h-16 mx-auto text-emerald-500 mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Bureau Check Complete</h2>
              
              <div className="bg-slate-50 rounded-2xl p-6 border-2 border-slate-200 my-6">
                <p className="text-sm font-semibold text-slate-500 mb-2">Your CIBIL Score</p>
                {cibilScore !== null ? (
                  <div>
                    <div className={`text-5xl font-bold mb-2 ${cibilScore >= 700 ? 'text-emerald-600' : cibilScore >= 600 ? 'text-yellow-500' : 'text-rose-600'}`}>
                      {cibilScore}
                    </div>
                    <p className={`text-sm font-semibold ${cibilScore >= 700 ? 'text-emerald-600' : cibilScore >= 600 ? 'text-yellow-600' : 'text-rose-600'}`}>
                      {cibilScore >= 700 ? 'EXCELLENT' : cibilScore >= 600 ? 'FAIR' : 'POOR'}
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="text-3xl font-bold text-slate-700 mb-2">
                      No Score Found
                    </div>
                    <p className="text-sm text-slate-500">
                      Thin-File / New to Credit
                    </p>
                  </div>
                )}
              </div>

              <p className="text-gray-600 text-sm mb-8">
                {cibilScore !== null 
                  ? (cibilScore >= 600 ? "Great! Your score meets our requirements. Let's fetch your offers." : "Unfortunately, your score is too low to proceed with a standard credit line.")
                  : "We couldn't find a CIBIL score for you. We will use your UPI transaction history as an alternative signal."}
              </p>

              <button
                onClick={handleCibilContinue}
                className="w-full bg-slate-900 text-white font-semibold py-4 rounded-xl hover:bg-slate-800 transition shadow-lg flex items-center justify-center text-lg"
              >
                Continue <CheckCircle className="ml-2 w-5 h-5" />
              </button>
            </div>
          )}

          {status === 'SCANNING' && (
            <div className="text-center">
              <Loader2 className="w-10 h-10 mx-auto animate-spin text-slate-900 mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Analyzing Profile...</h2>
              
              <div className="bg-slate-50 rounded-lg p-4 text-left border border-slate-100">
                {timeline.map((log, idx) => (
                  <div key={idx} className="flex items-start mb-3 last:mb-0">
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-emerald-500 mr-3 flex-shrink-0"></div>
                    <span className="text-sm text-gray-600 font-mono">{log?.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {status === 'AA_DISCOVERY' && (
            <AccountDiscoveryModal 
              pan={pan} 
              vpa={vpa} 
              onLinked={() => setStatus('AA_CONSENT')} 
            />
          )}

          {status === 'AA_CONSENT' && (
            <ConsentModal 
              userId={vpa} 
              onGranted={handleAAGranted} 
              onDeclined={handleAADeclined} 
            />
          )}

          {status === 'AA_ASSESSING' && (
            <div className="text-center animate-fade-in p-8">
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-blue-600 mb-6" />
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Analyzing Financial Data</h2>
              <p className="text-gray-600 text-sm">
                Securely extracting features from connected Account Aggregator accounts.
              </p>
            </div>
          )}

          {status === 'AA_RESULT' && assessmentResult && (
            <RiskResultScreen 
              assessment={assessmentResult} 
              onContinue={handleAAContinue} 
            />
          )}

          {status === 'SELECT_LENDER' && (
            <div className="animate-fade-in">
              <div className="text-center mb-6">
                <Landmark className="w-12 h-12 mx-auto text-slate-900 mb-3" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Your Lender</h2>
                <p className="text-gray-600 text-sm">
                  Great news! Based on your UPI profile, multiple lending partners have pre-approved you. Select your preferred offer below.
                </p>
              </div>

              <div className="space-y-4 mb-6">
                {offers.map(offer => {
                  const isSelected = selectedOfferIds.includes(offer.id);
                  return (
                    <div 
                      key={offer.id}
                      onClick={() => toggleBankSelection(offer.id)}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-emerald-500 bg-emerald-50 shadow-md' 
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center">
                          <div className={`w-5 h-5 rounded border flex items-center justify-center mr-3 ${
                            isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 bg-white'
                          }`}>
                            {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900">{offer.name}</h3>
                            <span className="text-xs font-medium bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                              {offer.type}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">Approved Limit</p>
                          <p className="font-bold text-emerald-600 text-lg">₹{offer.approvedLimit.toLocaleString()}</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-4 mt-4 pt-3 border-t border-gray-200/60 ml-8">
                        <div className="flex items-center text-sm text-gray-600">
                          <Percent className="w-4 h-4 mr-1 text-slate-400" />
                          {offer.interestRate}% p.a.
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <CreditCard className="w-4 h-4 mr-1 text-slate-400" />
                          ₹{offer.processingFee} Fee
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-start mb-6">
                <input
                  type="checkbox"
                  id="tc-checkbox"
                  checked={acceptedTc}
                  onChange={(e) => setAcceptedTc(e.target.checked)}
                  className="mt-1 mr-3 w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                />
                <label htmlFor="tc-checkbox" className="text-sm text-gray-600 text-left cursor-pointer">
                  I agree to the <span className="text-slate-900 underline">Terms and Conditions</span> and authorize the lenders to evaluate my profile for the best offer.
                </label>
              </div>

              <button
                onClick={handleApplyOffers}
                disabled={selectedOfferIds.length === 0 || !acceptedTc}
                className="w-full bg-slate-900 text-white font-semibold py-3 rounded-lg hover:bg-slate-800 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply to Selected Banks ({selectedOfferIds.length})
              </button>
            </div>
          )}

          {status === 'FINALIZING' && (
            <div className="text-center animate-fade-in">
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-emerald-600 mb-6" />
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Negotiating Offers...</h2>
              <p className="text-gray-600 text-sm max-w-xs mx-auto">
                We are evaluating your UPI profile against your {selectedOfferIds.length} selected lenders to automatically lock in the best possible terms for you.
              </p>
            </div>
          )}

          {status === 'APPROVED' && (
            <div className="text-center">
              <CheckCircle className="w-16 h-16 mx-auto text-emerald-500 mb-4" />
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Congratulations!</h2>
              <p className="text-gray-600 mb-6">
                <strong>{selectedOfferIds.length} credit lines</strong> have been instantly approved and provisioned based on your stellar UPI history.
              </p>
              
              <button
                onClick={() => navigate('/')}
                className="w-full bg-slate-900 text-white font-semibold py-3 rounded-lg hover:bg-slate-800 transition shadow-lg"
              >
                Go to Dashboard
              </button>
            </div>
          )}

          {status === 'REJECTED' && (
            <div className="text-center">
              <AlertCircle className="w-16 h-16 mx-auto text-rose-500 mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Not Eligible</h2>
              <p className="text-gray-600 mb-6">
                {rejectReason}
              </p>
              
              <div className="bg-rose-50 rounded-lg p-4 text-left border border-rose-100 mb-6">
                {timeline.map((log, idx) => {
                  const isLast = idx === timeline.length - 1;
                  return (
                    <div key={idx} className="flex items-start mb-3 last:mb-0">
                      <div className={`w-2 h-2 mt-1.5 rounded-full ${isLast ? 'bg-rose-500' : 'bg-emerald-500'} mr-3 flex-shrink-0`}></div>
                      <span className={`text-sm ${isLast ? 'text-rose-700 font-medium' : 'text-gray-600'}`}>{log?.status}</span>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setStatus('IDLE')}
                className="w-full bg-slate-200 text-slate-800 font-semibold py-3 rounded-lg hover:bg-slate-300 transition"
              >
                Try Another Account
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
