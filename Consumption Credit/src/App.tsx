import { useState, useEffect, useCallback, useRef } from 'react'
import {
  authApi, api, session, setUnauthorizedHandler,
  type User, type CreditLine, type Transaction, type Statement,
  type StatementLineItem, type BNPLPlan, type AuditLog, type Dashboard,
  type RoutingAttempt, type Notification, type LimitProposal,
  type KeyFactStatement, type GrievanceTicket, type SpendInsight,
  type RepaymentMandate,
} from './lib/api'

// ── i18n ──────────────────────────────────────────────────────────────────────
type Lang = 'en' | 'hi'
const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    passbook: 'Passbook', pay: 'Pay', statement: 'Statement', alerts: 'Alerts', audit: 'Audit',
    signIn: 'Sign in or create account', sendOtp: 'Send OTP', verify: 'Verify OTP',
    creditLine: 'Credit line', available: 'available', signOut: 'Sign out',
    acceptLimit: 'Accept new limit', notNow: 'Not now',
    raiseGrievance: 'Raise a concern', nodalOfficer: 'Nodal Grievance Officer',
    kfsTitle: 'Key Fact Statement', coolingOff: 'Exit cooling-off period',
    autopayFull: 'Autopay full due', autopayMin: 'Autopay minimum due', autopayOff: 'Off',
    insights: 'Spending insights', download: 'Download statement',
    repayNow: 'Repay Now', confirmPayment: 'Confirm Payment',
    ownMoney: 'Own Money', creditLineBtn: 'Credit Line',
  },
  hi: {
    passbook: 'पासबुक', pay: 'भुगतान', statement: 'विवरण', alerts: 'सूचनाएं', audit: 'लेखा',
    signIn: 'साइन इन या खाता बनाएं', sendOtp: 'OTP भेजें', verify: 'OTP सत्यापित करें',
    creditLine: 'क्रेडिट लाइन', available: 'उपलब्ध', signOut: 'साइन आउट',
    acceptLimit: 'नई सीमा स्वीकार करें', notNow: 'अभी नहीं',
    raiseGrievance: 'शिकायत दर्ज करें', nodalOfficer: 'नोडल शिकायत अधिकारी',
    kfsTitle: 'मुख्य तथ्य विवरण', coolingOff: 'कूलिंग-ऑफ अवधि में बाहर निकलें',
    autopayFull: 'पूरा स्वतः भुगतान', autopayMin: 'न्यूनतम स्वतः भुगतान', autopayOff: 'बंद',
    insights: 'खर्च की जानकारी', download: 'विवरण डाउनलोड करें',
    repayNow: 'अभी चुकाएं', confirmPayment: 'भुगतान पुष्टि करें',
    ownMoney: 'अपना पैसा', creditLineBtn: 'क्रेडिट लाइन',
  },
}
// Context passed down via prop drilling (no context API needed at this scale)
let _lang: Lang = 'en'
const t = (key: string) => STRINGS[_lang][key] ?? key

// ── Tokens ───────────────────────────────────────────────────────────────────
const T = {
  paper: '#F7F3EA', ink: '#1C1A17', faint: '#8B7355',
  indigo: '#2B3A67', indigoLight: '#EDF0F6',
  rust: '#A8532E', rustLight: '#FAF0EB',
  line: '#C9C0AC', lineLight: 'rgba(201,192,172,0.35)',
  green: '#3F6B4A', greenLight: '#EEF4F0', surface: '#EDE8DC',
} as const

type AppScreen = 'boot' | 'home' | 'payment' | 'pending' | 'statement'
  | 'repayment' | 'limit-growth' | 'bnpl' | 'declined' | 'audit-log' | 'notifications'
  | 'kfs' | 'grievance' | 'insights' | 'limit-proposal' | 'cooling-off-exit'
type AuthStage = 'checking' | 'phone-entry' | 'otp-verify' | 'kyc-simulate' | 'done'
type StampStatus = 'settled' | 'pending' | 'declined' | 'grown' | 'granted'
type PayMode = 'own' | 'credit'

// ── Primitive components ──────────────────────────────────────────────────────

function Rs({ n, credit, size = 14 }: { n: string | number; credit?: boolean; size?: number }) {
  const str = typeof n === 'number' ? `₹${n.toLocaleString('en-IN')}` : String(n)
  return <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontVariantNumeric: 'tabular-nums', fontSize: size, color: credit ? T.rust : 'inherit', lineHeight: 1 }}>{str}</span>
}

const STAMP_CFG: Record<StampStatus, { label: string; color: string; bg: string; r: string }> = {
  settled:  { label: 'SETTLED',   color: T.green,  bg: T.greenLight,  r: '-3deg' },
  pending:  { label: 'PENDING',   color: T.faint,  bg: '#F0EBE0',     r: '2deg'  },
  declined: { label: 'DECLINED',  color: T.rust,   bg: T.rustLight,   r: '-2deg' },
  grown:    { label: 'INCREASED', color: T.indigo, bg: T.indigoLight, r: '3deg'  },
  granted:  { label: 'GRANTED',   color: T.indigo, bg: T.indigoLight, r: '-3deg' },
}

function Stamp({ status, size = 52, animate }: { status: StampStatus; size?: number; animate?: boolean }) {
  const c = STAMP_CFG[status]
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', border: `${size > 60 ? 2 : 1.5}px solid ${c.color}`, backgroundColor: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${c.r})`, flexShrink: 0, ['--stamp-r' as string]: c.r, ...(animate ? { animation: 'stamp-in 200ms ease-out forwards' } : {}) }}>
      <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: size * 0.105, fontWeight: 600, color: c.color, letterSpacing: '0.05em', textAlign: 'center', lineHeight: 1.2, transform: `rotate(${c.r})`, display: 'block', padding: '0 4px' }}>{c.label}</span>
    </div>
  )
}

function ModeToggle({ mode, onChange }: { mode: PayMode; onChange: (m: PayMode) => void }) {
  return (
    <div style={{ display: 'flex', border: `1px solid ${T.line}`, borderRadius: 4, overflow: 'hidden', backgroundColor: T.surface }}>
      {(['own', 'credit'] as PayMode[]).map(m => (
        <button key={m} onClick={() => onChange(m)} style={{ flex: 1, padding: '11px 8px', fontSize: 12.5, fontWeight: mode === m ? 600 : 400, letterSpacing: '0.02em', border: 'none', cursor: 'pointer', backgroundColor: mode === m ? (m === 'own' ? T.indigo : T.rust) : 'transparent', color: mode === m ? T.paper : T.faint, fontFamily: "'Public Sans', sans-serif", transition: 'all 150ms ease' }}>
          {m === 'own' ? t('ownMoney') : t('creditLineBtn')}
        </button>
      ))}
    </div>
  )
}

function CTABtn({ label, onClick, variant = 'primary', disabled }: { label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }) {
  const bg = disabled ? T.line : variant === 'primary' ? T.indigo : variant === 'danger' ? T.rust : 'transparent'
  return <button onClick={onClick} disabled={disabled} style={{ width: '100%', padding: '14px 24px', backgroundColor: bg, color: disabled ? T.faint : variant === 'secondary' ? T.faint : T.paper, border: variant === 'secondary' ? `1px solid ${T.line}` : 'none', borderRadius: 4, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: "'Public Sans', sans-serif", transition: 'background-color 150ms ease' }}>{label}</button>
}

function ProgressRule({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min((used / limit) * 100, 100)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Credit line</span>
        <div style={{ fontSize: 10, color: T.faint }}><Rs n={`₹${used.toLocaleString('en-IN')}`} credit size={11} /><span style={{ margin: '0 3px' }}>of</span><Rs n={`₹${limit.toLocaleString('en-IN')}`} size={11} /></div>
      </div>
      <div style={{ position: 'relative', height: 2, backgroundColor: T.line, borderRadius: 1 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: T.rust, borderRadius: 1, transition: 'width 500ms ease' }} />
        {[25, 50, 75].map(p => <div key={p} style={{ position: 'absolute', left: `${p}%`, top: -3, bottom: -3, width: 1, backgroundColor: T.line, opacity: 0.7 }} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 5 }}>
        <span style={{ fontSize: 10, color: T.faint }}><Rs n={`₹${(limit - used).toLocaleString('en-IN')}`} size={10} /> available</span>
      </div>
    </div>
  )
}

function LedgerRow({ date, desc, sub, amount, credit, stamp, last, onPress, animateStamp }: { date: string; desc: string; sub?: string; amount: string; credit?: boolean; stamp?: StampStatus; last?: boolean; onPress?: () => void; animateStamp?: boolean }) {
  return (
    <div onClick={onPress} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', alignItems: 'center', padding: '11px 16px 11px 0', borderBottom: last ? 'none' : `1px solid ${T.line}`, cursor: onPress ? 'pointer' : 'default', animation: animateStamp ? 'fade-slide-in 300ms ease-out' : undefined }}>
      <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}><span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 10, color: T.faint, lineHeight: 1.3, display: 'block' }}>{date}</span></div>
      <div>
        <div style={{ fontSize: 13, color: T.ink, fontWeight: 500, lineHeight: 1.3 }}>{desc}</div>
        {sub && <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Rs n={amount} credit={credit} size={13} />
        {stamp && <Stamp status={stamp} size={40} animate={animateStamp} />}
      </div>
    </div>
  )
}

function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: `1px solid ${T.line}`, backgroundColor: T.paper, flexShrink: 0 }}>
      {onBack && <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.faint, fontSize: 20, lineHeight: 1, padding: '2px 4px 0', marginLeft: -4 }}>←</button>}
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.ink }}>{title}</span>
      {right}
    </div>
  )
}

function Spinner({ full }: { full?: boolean }) {
  const inner = (
    <svg width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="16" fill="none" stroke={T.line} strokeWidth="1.5" />
      <circle cx="20" cy="20" r="16" fill="none" stroke={T.indigo} strokeWidth="1.5" strokeDasharray="100" style={{ animation: 'draw-circle 1.4s ease-in-out infinite', transformOrigin: 'center', transform: 'rotate(-90deg)' }} />
    </svg>
  )
  if (!full) return inner
  return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inner}</div>
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div style={{ margin: '0 16px 16px', padding: '11px 14px', borderRadius: 4, border: `1px solid ${T.rust}`, backgroundColor: T.rustLight, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 12.5, color: T.rust, flex: 1, lineHeight: 1.5 }}>{message}</span>
      {onDismiss && <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: T.rust, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function txStamp(status: string): StampStatus {
  if (status === 'SETTLED' || status === 'EXPIRED_AUTO_SETTLED') return 'settled'
  if (status === 'PENDING_CONFIRMATION') return 'pending'
  return 'declined'
}

function txAmount(tx: Transaction) {
  const sign = tx.mode === 'CREDIT_LINE' ? '-' : '+'
  return `${sign}₹${tx.amount.toLocaleString('en-IN')}`
}

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }

// ── Auth Screens ─────────────────────────────────────────────────────────────

function PhoneEntryScreen({ onSubmit, loading, error }: { onSubmit: (phone: string) => void; loading: boolean; error: string }) {
  const [phone, setPhone] = useState('')
  const valid = /^[6-9]\d{9}$/.test(phone.replace(/\s/g, ''))

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 16px 14px', borderBottom: `1px solid ${T.line}` }}>
        <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, color: T.ink }}>ConsumptionCredit</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 16px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 24, color: T.ink, lineHeight: 1.25, marginBottom: 8 }}>Sign in or create account</div>
          <div style={{ fontSize: 13, color: T.faint, lineHeight: 1.65 }}>Enter your mobile number. We'll send a one-time passcode.</div>
        </div>

        <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: '0 12px', padding: '18px 0', borderBottom: `1px solid ${T.line}`, alignItems: 'center' }}>
            <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}>
              <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 14, color: T.faint }}>+91</span>
            </div>
            <input
              value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="9900 000 000" maxLength={10}
              style={{ border: 'none', background: 'none', fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontVariantNumeric: 'tabular-nums', color: T.ink, letterSpacing: '0.05em', width: '100%' }}
              onKeyDown={e => e.key === 'Enter' && valid && !loading && onSubmit(phone)}
            />
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        <CTABtn label={loading ? 'Sending OTP…' : 'Send OTP'} onClick={() => onSubmit(phone)} disabled={!valid || loading} />

        <div style={{ marginTop: 20, padding: '12px 14px', border: `1px solid ${T.line}`, borderRadius: 4, backgroundColor: '#F0EBE0' }}>
          <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Demo mode</div>
          <div style={{ fontSize: 11, color: T.ink, lineHeight: 1.5 }}>
            Use demo numbers to try pre-seeded profiles:<br />
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontVariantNumeric: 'tabular-nums' }}>9900000001</span> · Priya Mehta (MEDIUM)<br />
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontVariantNumeric: 'tabular-nums' }}>9900000003</span> · Rahul Verma (HIGH)<br />
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontVariantNumeric: 'tabular-nums' }}>9900000004</span> · Sneha Patel (new user)
          </div>
        </div>
      </div>
    </div>
  )
}

function OtpVerifyScreen({ phone, expiresAt, demoOtp, isNewUser, onVerify, onResend, onBack, loading, error }: {
  phone: string; expiresAt: string; demoOtp: string; isNewUser: boolean;
  onVerify: (otp: string) => void; onResend: () => void; onBack: () => void;
  loading: boolean; error: string
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [secondsLeft, setSecondsLeft] = useState(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)))
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [expiresAt])

  const otp = digits.join('')

  const handleDigit = (i: number, val: string) => {
    const d = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]; next[i] = d
    setDigits(next)
    if (d && i < 5) refs.current[i + 1]?.focus()
    if (!d && i > 0) refs.current[i - 1]?.focus()
    if (next.every(x => x) && next.join('').length === 6) onVerify(next.join(''))
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) { refs.current[i - 1]?.focus() }
    if (e.key === 'Enter' && otp.length === 6 && !loading) onVerify(otp)
  }

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title={isNewUser ? 'Create account' : 'Sign in'} onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 16px' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 21, color: T.ink, marginBottom: 8 }}>Verify your number</div>
          <div style={{ fontSize: 13, color: T.faint, lineHeight: 1.6 }}>OTP sent to +91 {phone}. Expires in {mins}:{String(secs).padStart(2, '0')}.</div>
        </div>

        {/* Demo OTP banner — clearly labeled, not production behaviour */}
        <div style={{ padding: '10px 14px', border: `1px solid ${T.line}`, borderRadius: 4, marginBottom: 24, backgroundColor: '#F0EBE0' }}>
          <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Demo mode — OTP shown here</div>
          <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 26, fontVariantNumeric: 'tabular-nums', color: T.ink, letterSpacing: '0.15em' }}>{demoOtp}</span>
          <div style={{ fontSize: 10, color: T.faint, marginTop: 3 }}>In production this would be delivered via SMS, not shown here.</div>
        </div>

        {/* 6-digit OTP input */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 24 }}>
          {digits.map((d, i) => (
            <input
              key={i} ref={el => { refs.current[i] = el }} value={d}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              maxLength={1}
              style={{ textAlign: 'center', fontFamily: "'Fraunces', Georgia, serif", fontVariantNumeric: 'tabular-nums', fontSize: 22, padding: '12px 0', border: `1px solid ${d ? T.indigo : T.line}`, borderRadius: 4, backgroundColor: d ? T.indigoLight : T.paper, color: T.ink, outline: 'none', transition: 'border-color 100ms' }}
            />
          ))}
        </div>

        {error && <ErrorBanner message={error} />}

        <CTABtn label={loading ? 'Verifying…' : 'Verify OTP'} onClick={() => onVerify(otp)} disabled={otp.length < 6 || loading || secondsLeft === 0} />

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          {secondsLeft > 0
            ? <span style={{ fontSize: 12, color: T.faint }}>Resend in {mins}:{String(secs).padStart(2, '0')}</span>
            : <button onClick={onResend} style={{ background: 'none', border: 'none', fontSize: 12, color: T.indigo, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif", textDecoration: 'underline' }}>Resend OTP</button>
          }
        </div>
      </div>
    </div>
  )
}

function KycSimulateScreen({ onSubmit, onBack, loading, error }: { onSubmit: (pan: string, name: string, dob: string) => void; onBack: () => void; loading: boolean; error: string }) {
  const [pan, setPan] = useState('')
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')

  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase())
  const valid = panValid && name.trim().length > 1 && dob.length > 0

  const inputStyle = { width: '100%', border: 'none', background: 'none', fontSize: 14, color: T.ink, fontFamily: "'Public Sans', sans-serif", outline: 'none', padding: '0' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="KYC verification" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, color: T.ink, lineHeight: 1.25, marginBottom: 8 }}>Simulated verification</div>
          <div style={{ fontSize: 13, color: T.faint, lineHeight: 1.65 }}>This simulates Aadhaar+PAN verification for demo purposes. No real UIDAI integration is used.</div>
        </div>

        <div style={{ padding: '10px 14px', border: `1px solid ${T.line}`, borderRadius: 4, marginBottom: 22, backgroundColor: '#F0EBE0' }}>
          <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Demo note</div>
          <div style={{ fontSize: 11, color: T.ink, lineHeight: 1.5 }}>Use any valid PAN format (ABCDE1234F). kycStatus will be set to SIMULATED_VERIFIED, not a real regulatory check.</div>
        </div>

        <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 24 }}>
          {[
            { label: 'PAN number', value: pan, onChange: (v: string) => setPan(v.toUpperCase().slice(0, 10)), placeholder: 'ABCDE1234F', hint: panValid ? '✓ Valid format' : pan.length > 0 ? 'Format: ABCDE1234F' : '' },
            { label: 'Full name (as per Aadhaar)', value: name, onChange: (v: string) => setName(v), placeholder: 'Priya Mehta', hint: '' },
            { label: 'Date of birth', value: dob, onChange: (v: string) => setDob(v), placeholder: 'YYYY-MM-DD', hint: '' },
          ].map((f, i) => (
            <div key={f.label} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: '0 12px', padding: '14px 0', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}`, paddingTop: 1 }}>
                <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 11, color: T.faint }}>{String(i + 1).padStart(2, '0')}</span>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{f.label}</div>
                <input value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder} style={inputStyle} />
                {f.hint && <div style={{ fontSize: 10, color: panValid && i === 0 ? T.green : T.faint, marginTop: 3 }}>{f.hint}</div>}
              </div>
            </div>
          ))}
        </div>

        {error && <ErrorBanner message={error} />}
        <CTABtn label={loading ? 'Verifying…' : 'Submit — Simulated verification'} onClick={() => onSubmit(pan, name, dob)} disabled={!valid || loading} />
      </div>
    </div>
  )
}

// ── App Screens ───────────────────────────────────────────────────────────────

function HomeScreen({ dash, onLimitGrowth, onPending, onLimitProposal, onInsights, onGrievance, onKfs, onCoolingOff }: { dash: Dashboard; onLimitGrowth: () => void; onPending: (txId: string) => void; onLimitProposal: () => void; onInsights: () => void; onGrievance: () => void; onKfs: (cl: CreditLine) => void; onCoolingOff: (cl: CreditLine) => void }) {
  const cls = dash.creditLines
  const totalLimit = cls.reduce((s, c) => s + c.limit, 0)
  const totalUtilized = cls.reduce((s, c) => s + c.utilized, 0)
  const pendingTx = dash.transactions.find(t => t.status === 'PENDING_CONFIRMATION')
  const pendingProposals = dash.pendingLimitProposals ?? []
  const coolingOffLines = cls.filter(cl => cl.coolingOffExpiresAt && new Date(cl.coolingOffExpiresAt) > new Date())

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ padding: '20px 16px 18px', borderBottom: `1px solid ${T.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Own money</div>
            <Rs n="₹—" size={26} />
            <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>{dash.user.upiVpa}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: T.rust, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Credit used</div>
            <Rs n={totalUtilized} credit size={26} />
            <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>{cls.length} line{cls.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <ProgressRule used={totalUtilized} limit={totalLimit || 1} />
      </div>

      {/* Pending limit proposals — actionable, not passive */}
      {pendingProposals.length > 0 && (
        <div onClick={onLimitProposal} style={{ padding: '11px 16px', backgroundColor: T.indigoLight, borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <Stamp status="grown" size={38} animate />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.indigo }}>{pendingProposals.length} limit increase proposal{pendingProposals.length > 1 ? 's' : ''}</div>
            <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>Requires your explicit consent — tap to review</div>
          </div>
          <span style={{ color: T.faint, fontSize: 16 }}>›</span>
        </div>
      )}

      {/* Cooling-off banners — RBI requires these to be easy to find */}
      {coolingOffLines.map(cl => {
        const daysLeft = Math.ceil((new Date(cl.coolingOffExpiresAt!).getTime() - Date.now()) / 86400000)
        return (
          <div key={cl.id} onClick={() => onCoolingOff(cl)} style={{ padding: '11px 16px', backgroundColor: '#FAF5EE', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', border: `1.5px solid ${T.faint}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: T.faint }}>↩</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{t('coolingOff')} — {cl.lenderName}</div>
              <div style={{ fontSize: 10, color: T.rust, marginTop: 1 }}>{daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining · No penalty</div>
            </div>
            <span style={{ color: T.faint, fontSize: 16 }}>›</span>
          </div>
        )
      })}

      {dash.recentLimitGrowth && pendingProposals.length === 0 && (
        <div onClick={onLimitGrowth} style={{ padding: '11px 16px', backgroundColor: T.indigoLight, borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <Stamp status="grown" size={38} animate />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.indigo }}>Limit increased</div>
            <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>{dash.recentLimitGrowth.reason}</div>
          </div>
          <span style={{ color: T.faint, fontSize: 16 }}>›</span>
        </div>
      )}

      {pendingTx && (
        <div onClick={() => onPending(pendingTx.id)} style={{ padding: '11px 16px', backgroundColor: '#FAF5EE', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <Stamp status="pending" size={38} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>₹{pendingTx.amount.toLocaleString('en-IN')} held — {pendingTx.merchantName}</div>
            <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>Tap to cancel or confirm early.</div>
          </div>
          <span style={{ color: T.faint, fontSize: 16 }}>›</span>
        </div>
      )}

      {/* Quick-links row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: `1px solid ${T.line}` }}>
        {[{ label: t('insights'), icon: '◎', action: onInsights }, { label: 'KFS', icon: '§', action: () => cls.length > 0 && onKfs(cls[0]) }, { label: t('raiseGrievance'), icon: '⊕', action: onGrievance }].map((item, i) => (
          <button key={item.label} onClick={item.action} style={{ padding: '12px 6px', border: 'none', borderLeft: i > 0 ? `1px solid ${T.line}` : 'none', backgroundColor: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 16, color: T.faint }}>{item.icon}</span>
            <span style={{ fontSize: 9, color: T.faint, letterSpacing: '0.04em', textAlign: 'center', lineHeight: 1.3 }}>{item.label}</span>
          </button>
        ))}
      </div>

      <div style={{ paddingBottom: 20 }}>
        <div style={{ padding: '11px 16px 8px', borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recent activity</span>
        </div>
        <div style={{ paddingLeft: 16 }}>
          {dash.transactions.length === 0
            ? <div style={{ padding: '24px 16px', fontSize: 12, color: T.faint, textAlign: 'center' }}>No transactions yet. Make your first payment.</div>
            : dash.transactions.map((tx, i) => (
              <LedgerRow key={tx.id} date={fmtDate(tx.createdAt)} desc={tx.merchantName} sub={`${tx.mode === 'CREDIT_LINE' ? 'Credit line' : 'Own money'}${tx.channel === 'BNPL' ? ' · BNPL' : ''}`} amount={txAmount(tx)} credit={tx.mode === 'CREDIT_LINE'} stamp={txStamp(tx.status)} last={i === dash.transactions.length - 1} />
            ))
          }
        </div>
      </div>
    </div>
  )
}

function PaymentScreen({ dash, onBack, onPaid, onPending, onBNPL, onDeclined, onShowKfs }: { dash: Dashboard; onBack: () => void; onPaid: () => void; onPending: (txId: string) => void; onBNPL: (amount: number, cl: CreditLine) => void; onDeclined: (reason: string) => void; onShowKfs: (cl: CreditLine, onDone: () => void) => void }) {
  const [mode, setMode] = useState<PayMode>('own')
  const [amount, setAmount] = useState('')
  const [upi, setUpi] = useState('')
  const [loading, setLoading] = useState(false)
  const [routedCl, setRoutedCl] = useState<CreditLine | null>(null)
  const [routeAttempts, setRouteAttempts] = useState<RoutingAttempt[]>([])
  const [routeError, setRouteError] = useState('')
  const [error, setError] = useState('')
  // Track KFS acknowledgment per credit line this session
  const [kfsAcknowledged, setKfsAcknowledged] = useState<Set<string>>(new Set())
  const idempotencyKey = useRef(crypto.randomUUID())

  const num = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0
  const isLarge = num >= 10000

  useEffect(() => {
    if (mode === 'credit' && num > 0) {
      setRoutedCl(null); setRouteError('')
      api.route(num).then(r => { if (r.approved && r.creditLine) setRoutedCl(r.creditLine); else setRouteError(r.reason ?? 'No eligible lender'); setRouteAttempts(r.attempts ?? []) }).catch(e => setRouteError(e.message))
    }
  }, [mode, num])

  const available = routedCl ? routedCl.limit - routedCl.utilized - routedCl.heldAmount : 0
  const overLimit = mode === 'credit' && !!routeError

  const handlePay = async () => {
    if (!upi.trim() || num <= 0) return
    // KFS must be acknowledged before first credit-line spend on a given line
    if (mode === 'credit' && routedCl && !routedCl.firstSpentAt && !kfsAcknowledged.has(routedCl.id)) {
      onShowKfs(routedCl, () => setKfsAcknowledged(prev => new Set([...prev, routedCl.id])))
      return
    }
    setLoading(true); setError('')
    try {
      if (mode === 'own') { onPaid(); return }
      if (!routedCl) { onDeclined(routeError || 'No eligible lender'); return }
      const enforce = await api.enforce(routedCl.id, num)
      if (!enforce.approved) { onDeclined(enforce.reason ?? 'Declined'); return }
      const tx = await api.pay({ creditLineId: routedCl.id, amount: num, merchantName: upi, mode: 'CREDIT_LINE', idempotencyKey: idempotencyKey.current })
      if (tx.status === 'PENDING_CONFIRMATION') onPending(tx.id); else onPaid()
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  const inputBase = { width: '100%' as const, border: `1px solid ${T.line}`, borderRadius: 4, backgroundColor: T.paper, color: T.ink, padding: '10px 12px', fontFamily: "'Public Sans', sans-serif", fontSize: 13 }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Pay" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '22px 16px' }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 7 }}>Pay to (UPI ID)</label>
          <input value={upi} onChange={e => setUpi(e.target.value)} placeholder="name@upi" style={inputBase} />
        </div>
        <div style={{ marginBottom: 22 }}>
          <label style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 7 }}>Amount (₹)</label>
          <input value={amount} onChange={e => { setAmount(e.target.value); idempotencyKey.current = crypto.randomUUID() }} placeholder="0" style={{ ...inputBase, fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontVariantNumeric: 'tabular-nums', padding: '10px 14px' }} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Pay with</div>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        {mode === 'credit' && num > 0 && (
          <div style={{ padding: '13px 14px', borderRadius: 4, marginBottom: 16, border: `1px solid ${overLimit ? T.rust : T.line}`, backgroundColor: overLimit ? T.rustLight : T.paper }}>
            {overLimit ? <div style={{ fontSize: 12.5, color: T.rust, lineHeight: 1.6 }}>{routeError}</div>
              : routedCl ? <>
                <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Via {routedCl.lenderName}</div>
                <Rs n={available} size={16} credit /><span style={{ fontSize: 10, color: T.faint, marginLeft: 4 }}>available · billed on 5th</span>
                {routeAttempts.length > 1 && <div style={{ fontSize: 10, color: T.faint, marginTop: 3 }}>Primary lender declined — using fallback</div>}
              </> : <div style={{ fontSize: 11, color: T.faint }}>Checking lenders…</div>}
          </div>
        )}
        {/* Real-time interest preview — computed from actual rate, not static copy */}
        {mode === 'credit' && num > 0 && routedCl && !overLimit && (
          <div style={{ padding: '11px 14px', borderRadius: 4, marginBottom: 14, border: `1px solid ${T.line}`, backgroundColor: '#FAF5EE', fontSize: 12, color: T.ink, lineHeight: 1.6 }}>
            <span style={{ color: T.faint }}>If not repaid by statement date: </span>
            <Rs n={Math.round(num * routedCl.interestRate)} size={13} credit />
            <span style={{ color: T.faint }}> in interest ({(routedCl.interestRate * 100).toFixed(1)}%/mo)</span>
          </div>
        )}
        {isLarge && !overLimit && mode === 'credit' && <div style={{ padding: '11px 14px', borderRadius: 4, marginBottom: 16, border: `1px solid ${T.line}`, backgroundColor: T.indigoLight, fontSize: 12, color: T.indigo, lineHeight: 1.55 }}>Amounts above ₹10,000 are held for 1 hour. You can cancel during that window.</div>}
        {mode === 'credit' && num >= 500 && routedCl && !overLimit && (
          <button onClick={() => onBNPL(num, routedCl)} style={{ width: '100%', padding: '12px 14px', marginBottom: 16, border: `1px solid ${T.line}`, borderRadius: 4, backgroundColor: T.paper, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: "'Public Sans', sans-serif" }}>
            <span style={{ fontSize: 13, color: T.ink }}>Split into installments</span>
            <span style={{ fontSize: 11, color: T.rust }}>View options ›</span>
          </button>
        )}
        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
        <CTABtn label={loading ? 'Processing…' : isLarge ? 'Continue — held 1 hr' : 'Confirm Payment'} onClick={handlePay} disabled={!upi.trim() || num <= 0 || overLimit || loading} />
      </div>
    </div>
  )
}

function PendingScreen({ txId, onBack, onCancel, onConfirm }: { txId: string | null; onBack: () => void; onCancel: () => void; onConfirm: () => void }) {
  const [seconds, setSeconds] = useState(3600)
  const [acting, setActing] = useState(false)
  useEffect(() => { const t = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000); return () => clearInterval(t) }, [])
  const mins = Math.floor(seconds / 60), secs = seconds % 60
  const circ = 2 * Math.PI * 44

  const act = async (fn: () => Promise<any>, cb: () => void) => {
    setActing(true)
    try { await fn() } catch (_) {} finally { setActing(false) }
    cb()
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Payment held" onBack={onBack} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px', gap: 28 }}>
        <div style={{ position: 'relative', width: 120, height: 120 }}>
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="44" fill="none" stroke={T.line} strokeWidth="1.5" />
            <circle cx="60" cy="60" r="44" fill="none" stroke={T.indigo} strokeWidth="1.5" strokeDasharray={circ} strokeDashoffset={circ * (1 - seconds / 3600)} strokeLinecap="round" transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 19, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{mins}:{String(secs).padStart(2, '0')}</span>
            <span style={{ fontSize: 9, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>remaining</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: T.faint, lineHeight: 1.65 }}>Payment held for 1 hour. Processes automatically unless cancelled.</div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CTABtn label={acting ? '…' : 'Confirm now'} onClick={() => txId && act(() => api.confirmPayment(txId), onConfirm)} disabled={!txId || acting} />
          <CTABtn label={acting ? '…' : 'Cancel Payment'} onClick={() => txId && act(() => api.cancelPayment(txId), onCancel)} variant="secondary" disabled={!txId || acting} />
          <div style={{ textAlign: 'center', fontSize: 11, color: T.faint }}>Auto-confirms at {fmtTime(new Date(Date.now() + seconds * 1000).toISOString())}</div>
        </div>
      </div>
    </div>
  )
}

function StatementScreen({ statements, creditLines, onBack, onRepay }: { statements: Statement[]; creditLines: CreditLine[]; onBack: () => void; onRepay: () => void }) {
  const [idx, setIdx] = useState(0)
  const [mandates, setMandates] = useState<RepaymentMandate[]>([])
  const [mandateLoading, setMandateLoading] = useState(false)
  const stmt = statements[idx]
  const items: StatementLineItem[] = (stmt as any)?.items ?? []

  useEffect(() => { api.myMandates().then(setMandates).catch(() => {}) }, [])

  const activeMandate = (clId: string) => mandates.find(m => m.creditLineId === clId && m.active)

  const setMandate = async (clId: string, type: 'FULL' | 'MINIMUM' | 'OFF') => {
    setMandateLoading(true)
    try {
      if (type === 'OFF') await api.cancelMandate(clId)
      else await api.setupMandate(clId, type)
      const updated = await api.myMandates(); setMandates(updated)
    } catch (_) {}
    setMandateLoading(false)
  }
  const byLender: Record<string, { name: string; items: StatementLineItem[]; total: number }> = {}
  for (const item of items) { if (!byLender[item.lenderId]) byLender[item.lenderId] = { name: item.lenderName, items: [], total: 0 }; byLender[item.lenderId].items.push(item); byLender[item.lenderId].total += item.amount }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Statement" onBack={onBack} />
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.line}`, flexShrink: 0, overflowX: 'auto' }}>
        {statements.length === 0
          ? <div style={{ padding: '10px 16px', fontSize: 12, color: T.faint }}>No statements yet</div>
          : statements.slice(0, 4).map((s, i) => (
            <button key={s.id} onClick={() => setIdx(i)} style={{ flexShrink: 0, padding: '10px 14px', fontSize: 12, border: 'none', borderBottom: idx === i ? `2px solid ${T.indigo}` : '2px solid transparent', backgroundColor: 'transparent', color: idx === i ? T.indigo : T.faint, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif", fontWeight: idx === i ? 600 : 400 }}>
              {new Date(s.periodStart).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
            </button>
          ))
        }
      </div>
      {stmt ? <>
        <div style={{ padding: '16px', borderBottom: `1px solid ${T.line}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flexShrink: 0 }}>
          <div><div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Total due</div><Rs n={stmt.totalDue} size={24} credit /><div style={{ fontSize: 10, color: T.faint, marginTop: 3 }}>Due {fmtDate(stmt.dueDate)}</div></div>
          <div><div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Minimum due</div><Rs n={stmt.minimumDue} size={24} /><div style={{ fontSize: 10, color: T.faint, marginTop: 3 }}>{stmt.status}</div></div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {items.length === 0
            ? <div style={{ padding: '24px', fontSize: 12, color: T.faint, textAlign: 'center' }}>No charges yet this period</div>
            : Object.entries(byLender).map(([lid, group]) => (
              <div key={lid}>
                <div style={{ padding: '9px 16px 7px', backgroundColor: '#F0EBE0', borderBottom: `1px solid ${T.line}` }}><span style={{ fontSize: 10, color: T.faint, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.name} · ₹{group.total.toLocaleString('en-IN')} due</span></div>
                <div style={{ paddingLeft: 16 }}>{group.items.map((item, i) => <LedgerRow key={item.id} date={fmtDate(item.date)} desc={item.description} amount={`₹${item.amount.toLocaleString('en-IN')}`} credit stamp="settled" last={i === group.items.length - 1} />)}</div>
              </div>
            ))
          }
        </div>
        {/* Autopay toggle per credit line */}
        {creditLines.filter(cl => cl.status === 'ACTIVE').map(cl => {
          const m = activeMandate(cl.id)
          return (
            <div key={cl.id} style={{ padding: '12px 16px', borderTop: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Autopay — {cl.lenderName}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['FULL', 'MINIMUM', 'OFF'] as const).map(opt => (
                    <button key={opt} onClick={() => !mandateLoading && setMandate(cl.id, opt)} disabled={mandateLoading} style={{ flex: 1, padding: '5px 4px', fontSize: 9, border: `1px solid ${(m?.type === opt || (!m && opt === 'OFF')) ? T.indigo : T.line}`, borderRadius: 4, backgroundColor: (m?.type === opt || (!m && opt === 'OFF')) ? T.indigoLight : 'transparent', color: (m?.type === opt || (!m && opt === 'OFF')) ? T.indigo : T.faint, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif", letterSpacing: '0.03em' }}>
                      {opt === 'FULL' ? t('autopayFull').split(' ')[1] : opt === 'MINIMUM' ? t('autopayMin').split(' ')[1] : t('autopayOff')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
        <div style={{ padding: '0 16px 16px', display: 'flex', gap: 8, borderTop: `1px solid ${T.line}`, paddingTop: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}><CTABtn label={t('repayNow')} onClick={onRepay} disabled={stmt.totalDue <= 0 || stmt.status === 'PAID'} /></div>
          <button onClick={() => api.openStatementPdf(stmt.id).catch(() => {})} style={{ padding: '0 14px', border: `1px solid ${T.line}`, borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer', fontSize: 11, color: T.faint, fontFamily: "'Public Sans', sans-serif", whiteSpace: 'nowrap' }}>{t('download')}</button>
        </div>
      </> : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 12, color: T.faint }}>No statement selected</span></div>}
    </div>
  )
}

function RepaymentScreen({ openStatement, onBack, onConfirm }: { openStatement: Statement | null; onBack: () => void; onConfirm: () => void }) {
  const [amount, setAmount] = useState(openStatement?.minimumDue?.toString() ?? '0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const num = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0
  const presets = openStatement ? [{ label: 'Minimum', value: String(openStatement.minimumDue) }, { label: 'Half', value: String(Math.ceil(openStatement.totalDue / 2)) }, { label: 'Full', value: String(openStatement.totalDue) }] : []

  const handleConfirm = async () => {
    if (num <= 0) return
    setLoading(true); setError('')
    try { await api.repay(num); onConfirm() }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Repayment" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>Amount (₹)</label>
          <input value={amount} onChange={e => setAmount(e.target.value)} style={{ width: '100%', padding: '12px 14px', border: `1px solid ${T.line}`, borderRadius: 4, fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontVariantNumeric: 'tabular-nums', color: T.ink, backgroundColor: T.paper }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {presets.map(p => <button key={p.label} onClick={() => setAmount(p.value)} style={{ flex: 1, padding: '9px 4px', border: `1px solid ${amount === p.value ? T.indigo : T.line}`, borderRadius: 4, backgroundColor: amount === p.value ? T.indigoLight : T.paper, cursor: 'pointer', fontFamily: "'Fraunces', Georgia, serif", fontVariantNumeric: 'tabular-nums', color: amount === p.value ? T.indigo : T.faint }}><div style={{ fontSize: 11, fontWeight: 600 }}>₹{Number(p.value).toLocaleString('en-IN')}</div><div style={{ fontSize: 9, marginTop: 2, fontFamily: "'Public Sans', sans-serif", letterSpacing: '0.04em' }}>{p.label}</div></button>)}
        </div>
        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
        <CTABtn label={loading ? 'Processing…' : 'Confirm Repayment'} onClick={handleConfirm} disabled={num <= 0 || loading} />
      </div>
    </div>
  )
}

function LimitGrowthScreen({ auditEntry, creditLines, onBack }: { auditEntry: AuditLog | null; creditLines: CreditLine[]; onBack: () => void }) {
  const totalLimit = creditLines.reduce((s, c) => s + c.limit, 0)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Limit update" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, marginBottom: 36 }}>
          <Stamp status="grown" size={100} animate />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 25, color: T.ink, marginBottom: 10, lineHeight: 1.25 }}>Limit increased to ₹{totalLimit.toLocaleString('en-IN')}</div>
            <div style={{ fontSize: 13, color: T.faint, lineHeight: 1.65, maxWidth: 270, margin: '0 auto' }}>{auditEntry?.reason ?? 'Your credit limit has grown based on your repayment history.'}</div>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${T.line}` }}>
          <div style={{ padding: '10px 0 7px' }}><span style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Current lines</span></div>
          {creditLines.map((cl, i) => (
            <div key={cl.id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', padding: '13px 0', borderBottom: `1px solid ${T.line}`, alignItems: 'center' }}>
              <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}><span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 10, color: T.faint }}>{String(i + 1).padStart(2, '0')}</span></div>
              <div><div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{cl.lenderName}</div><div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>₹{cl.utilized.toLocaleString('en-IN')} of ₹{cl.limit.toLocaleString('en-IN')}</div></div>
              <Stamp status="grown" size={40} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BNPLScreen({ creditLine, amount: principal, merchantName, onBack, onConfirm }: { creditLine: CreditLine; amount: number; merchantName: string; onBack: () => void; onConfirm: () => void }) {
  const [plans, setPlans] = useState<BNPLPlan[]>([])
  const [selected, setSelected] = useState(3)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api.bnplPlans(creditLine.id, principal).then(r => { setPlans(r.plans); setLoading(false) }).catch(e => { setError(e.message); setLoading(false) }) }, [])

  const chosen = plans.find(p => p.installments === selected)

  const handleConfirm = async () => {
    if (!chosen) return
    setConfirming(true)
    try { await api.bnplCreate({ creditLineId: creditLine.id, amount: principal, merchantName, installments: chosen.installments, idempotencyKey: crypto.randomUUID() }); onConfirm() }
    catch (e: any) { setError(e.message) } finally { setConfirming(false) }
  }

  if (loading) return <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><Header title="Split into installments" onBack={onBack} /><Spinner full /></div>

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Split into installments" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        <div style={{ marginBottom: 18 }}><div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 11, color: T.faint, marginBottom: 5 }}>Payment to {merchantName}</div><Rs n={principal} size={28} credit /></div>
        <div style={{ fontSize: 12, color: T.faint, marginBottom: 22, lineHeight: 1.6 }}>1.5% per month on outstanding. No other fees.</div>
        <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 24 }}>
          {plans.map(p => (
            <div key={p.installments} onClick={() => setSelected(p.installments)} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', padding: '14px 0', borderBottom: `1px solid ${T.line}`, cursor: 'pointer', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8, borderRight: `1px solid ${T.line}` }}><div style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${selected === p.installments ? T.indigo : T.line}`, backgroundColor: selected === p.installments ? T.indigo : 'transparent' }} /></div>
              <div><div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{p.installments} monthly installments</div><div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>Total ₹{p.total.toLocaleString('en-IN')} · ₹{p.interest.toLocaleString('en-IN')} interest</div></div>
              <div style={{ textAlign: 'right' }}><Rs n={p.perInstallment} size={15} credit /><div style={{ fontSize: 9, color: T.faint, marginTop: 2 }}>/month</div></div>
            </div>
          ))}
        </div>
        {chosen && (
          <div style={{ border: `1px solid ${T.line}`, borderRadius: 4, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '10px 14px', backgroundColor: '#F0EBE0', borderBottom: `1px solid ${T.line}` }}><span style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment schedule</span></div>
            {chosen.schedule.map((s, i) => (
              <div key={s.seq} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', padding: '11px 16px 11px 0', borderBottom: i < chosen.schedule.length - 1 ? `1px solid ${T.line}` : 'none', alignItems: 'center' }}>
                <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}><span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 10, color: T.faint }}>{fmtDate(s.dueDate)}</span></div>
                <span style={{ fontSize: 12, color: T.ink }}>Installment {s.seq} of {chosen.installments}</span>
                <Rs n={s.amount} size={13} credit />
              </div>
            ))}
          </div>
        )}
        {error && <ErrorBanner message={error} />}
        <CTABtn label={confirming ? 'Creating…' : `Confirm — ${chosen?.installments ?? '?'} installments`} onClick={handleConfirm} disabled={!chosen || confirming} />
      </div>
    </div>
  )
}

function DeclinedScreen({ reason, onBack, onStatement }: { reason: string; onBack: () => void; onStatement: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Payment declined" onBack={onBack} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '32px 16px' }}>
        <div style={{ border: `1px solid ${T.line}`, borderRadius: 4, overflow: 'hidden', marginBottom: 36 }}>
          <LedgerRow date={fmtDate(new Date().toISOString())} desc="Payment" sub="Credit line · declined" amount="-₹—" credit stamp="declined" last />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 24 }}>
          <div>
            <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 21, color: T.ink, marginBottom: 12, lineHeight: 1.3 }}>Payment declined</div>
            <div style={{ fontSize: 13, color: T.faint, lineHeight: 1.7, maxWidth: 270 }}>{reason}</div>
          </div>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <CTABtn label="Repay early" onClick={onStatement} />
            <CTABtn label="View statement" onClick={onStatement} variant="secondary" />
          </div>
        </div>
      </div>
    </div>
  )
}

function AuditLogScreen({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { api.auditLog(userId).then(l => { setLogs(l); setLoading(false) }).catch(() => setLoading(false)) }, [userId])
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Audit log" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', paddingLeft: 16 }}>
        {loading ? <Spinner full /> : logs.length === 0
          ? <div style={{ padding: '24px', fontSize: 12, color: T.faint, textAlign: 'center' }}>No audit entries</div>
          : logs.map((log, i) => (
            <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: '0 12px', padding: '12px 16px 12px 0', borderBottom: i < logs.length - 1 ? `1px solid ${T.line}` : 'none' }}>
              <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}>
                <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 9, color: T.faint, display: 'block' }}>{fmtDate(log.createdAt)}</span>
                <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 9, color: T.faint, display: 'block', marginTop: 1 }}>{fmtTime(log.createdAt)}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.ink, letterSpacing: '0.02em' }}>{log.action.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>{log.entityType} · {log.entityId.slice(0, 14)}…</div>
                <div style={{ fontSize: 11, color: T.ink, marginTop: 2, lineHeight: 1.4 }}>{log.reason}</div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

function NotificationsScreen({ onBack, onMarkRead }: { onBack: () => void; onMarkRead: () => void }) {
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.notifications().then(n => { setNotifs(n); setLoading(false) }).catch(() => setLoading(false))
    api.markNotificationsRead().catch(() => {})
    onMarkRead()
  }, [])

  const stampForType = (type: string, stampStatus: string): StampStatus => {
    if (stampStatus === 'grown') return 'grown'
    if (stampStatus === 'granted') return 'granted'
    if (stampStatus === 'declined') return 'declined'
    if (stampStatus === 'pending') return 'pending'
    return 'settled'
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Notifications" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', paddingLeft: 16 }}>
        {loading ? <Spinner full /> : notifs.length === 0
          ? <div style={{ padding: '32px 24px', textAlign: 'center', fontSize: 12, color: T.faint }}>No notifications</div>
          : notifs.map((n, i) => (
            <div key={n.id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', padding: '13px 16px 13px 0', borderBottom: i < notifs.length - 1 ? `1px solid ${T.line}` : 'none', alignItems: 'center', opacity: n.readAt ? 0.65 : 1 }}>
              <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}>
                <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 9, color: T.faint, display: 'block' }}>{fmtDate(n.createdAt)}</span>
                <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 9, color: T.faint, display: 'block', marginTop: 1 }}>{fmtTime(n.createdAt)}</span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{n.title}</div>
                <div style={{ fontSize: 11, color: T.faint, marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>
              </div>
              <Stamp status={stampForType(n.type, n.stampStatus)} size={36} />
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ── Key Fact Statement screen ─────────────────────────────────────────────────

function KFSScreen({ creditLine, onBack, onAccept }: { creditLine: CreditLine; onBack: () => void; onAccept: () => void }) {
  const [kfs, setKfs] = useState<KeyFactStatement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    api.kfs(creditLine.id).then(k => { setKfs(k); setLoading(false) }).catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const exampleInterest = kfs ? Math.round(10000 * (kfs.apr / 100) / 12 * 3) : 0

  if (loading) return <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><Header title={t('kfsTitle')} onBack={onBack} /><Spinner full /></div>

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title={t('kfsTitle')} onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* APR — large, unavoidable */}
        <div style={{ padding: '20px 16px', borderBottom: `2px solid ${T.line}`, backgroundColor: '#FAF5EE' }}>
          <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Annual Percentage Rate (APR)</div>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 48, fontVariantNumeric: 'tabular-nums', color: T.rust, lineHeight: 1 }}>{kfs?.apr ?? '—'}%</div>
          <div style={{ fontSize: 11, color: T.faint, marginTop: 6, lineHeight: 1.5 }}>This is the total annual cost of borrowing including interest. The monthly rate is {creditLine.interestRate * 100}%.</div>
        </div>

        {/* Cost example */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.line}`, backgroundColor: T.indigoLight }}>
          <div style={{ fontSize: 10, color: T.indigo, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Example — if you borrow ₹10,000 and repay over 3 months</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: T.indigo }}>Interest you will pay</span>
            <Rs n={exampleInterest} size={14} credit />
          </div>
          <div style={{ fontSize: 10, color: T.faint, marginTop: 3 }}>Total repayment: ₹{(10000 + exampleInterest).toLocaleString('en-IN')}</div>
        </div>

        {/* Fees table */}
        <div style={{ paddingLeft: 16 }}>
          <div style={{ padding: '10px 16px 8px 0', borderBottom: `1px solid ${T.line}` }}>
            <span style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fee schedule</span>
          </div>
          {kfs?.allFees.map((fee, i) => (
            <div key={fee.name} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', padding: '12px 16px 12px 0', borderBottom: `1px solid ${T.line}`, alignItems: 'center' }}>
              <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}>
                <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 10, color: T.faint }}>{String(i + 1).padStart(2, '0')}</span>
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: T.ink }}>{fee.name}</div>
                <div style={{ fontSize: 10, color: T.faint, marginTop: 2, lineHeight: 1.4 }}>{fee.description}</div>
              </div>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontVariantNumeric: 'tabular-nums', fontSize: 13, color: fee.amount === 0 ? T.green : T.rust }}>
                {fee.amount === 0 ? 'Nil' : `₹${fee.amount}`}
              </div>
            </div>
          ))}
        </div>

        {/* Cooling-off */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Cooling-off period</div>
          <div style={{ fontSize: 13, color: T.ink, fontWeight: 500 }}>{kfs?.coolingOffDays} days from credit line activation</div>
          <div style={{ fontSize: 11, color: T.faint, marginTop: 3, lineHeight: 1.5 }}>You may exit this credit line within {kfs?.coolingOffDays} days without penalty — paying only principal + proportionate interest.</div>
        </div>

        {/* Recovery terms */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Recovery terms</div>
          <div style={{ fontSize: 11, color: T.ink, lineHeight: 1.6 }}>{kfs?.recoveryTermsSummary}</div>
        </div>

        <div style={{ padding: 16 }}>
          {!accepted
            ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <CTABtn label="I have read and understood — continue" onClick={() => { setAccepted(true); onAccept() }} />
              <CTABtn label="Go back" onClick={onBack} variant="secondary" />
            </div>
            : <div style={{ padding: '12px 14px', borderRadius: 4, backgroundColor: T.greenLight, border: `1px solid ${T.green}`, fontSize: 12, color: T.green, textAlign: 'center' }}>✓ KFS acknowledged</div>
          }
        </div>
      </div>
    </div>
  )
}

// ── Limit Proposal screen ─────────────────────────────────────────────────────

function LimitProposalScreen({ proposals, creditLines, onBack, onAccepted, onDeclined }: { proposals: LimitProposal[]; creditLines: CreditLine[]; onBack: () => void; onAccepted: () => void; onDeclined: () => void }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const accept = async (p: LimitProposal) => {
    setLoading(p.id); setError('')
    try { await api.acceptProposal(p.id); onAccepted() }
    catch (e: any) { setError(e.message) }
    finally { setLoading(null) }
  }

  const decline = async (p: LimitProposal) => {
    setLoading(p.id + '_d'); setError('')
    try { await api.declineProposal(p.id); onDeclined() }
    catch (e: any) { setError(e.message) }
    finally { setLoading(null) }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Limit increase proposal" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, color: T.ink, marginBottom: 8 }}>You qualify for a higher limit</div>
          <div style={{ fontSize: 13, color: T.faint, lineHeight: 1.65 }}>As per RBI guidelines, your limit can only be increased with your explicit consent. Review each proposal below.</div>
        </div>
        {proposals.map(p => {
          const cl = creditLines.find(c => c.id === p.creditLineId)
          return (
            <div key={p.id} style={{ border: `1px solid ${T.line}`, borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.line}`, backgroundColor: '#F0EBE0' }}>
                <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cl?.lenderName ?? p.creditLineId}</div>
                <div style={{ fontSize: 11, color: T.ink, marginTop: 2 }}>{p.reason}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, borderBottom: `1px solid ${T.line}` }}>
                <div style={{ padding: '14px 12px', borderRight: `1px solid ${T.line}` }}>
                  <div style={{ fontSize: 10, color: T.faint, marginBottom: 4 }}>Current limit</div>
                  <Rs n={p.currentLimit} size={18} />
                </div>
                <div style={{ padding: '14px 12px' }}>
                  <div style={{ fontSize: 10, color: T.green, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Proposed limit</div>
                  <Rs n={p.proposedLimit} size={18} />
                  <div style={{ fontSize: 9, color: T.green, marginTop: 2 }}>+₹{(p.proposedLimit - p.currentLimit).toLocaleString('en-IN')}</div>
                </div>
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', gap: 8 }}>
                <button onClick={() => accept(p)} disabled={!!loading} style={{ flex: 2, padding: '11px 8px', backgroundColor: T.green, color: T.paper, border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif" }}>{loading === p.id ? '…' : t('acceptLimit')}</button>
                <button onClick={() => decline(p)} disabled={!!loading} style={{ flex: 1, padding: '11px 8px', backgroundColor: 'transparent', color: T.faint, border: `1px solid ${T.line}`, borderRadius: 4, fontSize: 12, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif" }}>{loading === p.id + '_d' ? '…' : t('notNow')}</button>
              </div>
            </div>
          )
        })}
        {error && <ErrorBanner message={error} />}
        {proposals.length === 0 && <div style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: T.faint }}>No pending proposals</div>}
      </div>
    </div>
  )
}

// ── Grievance screen ─────────────────────────────────────────────────────────

const GRIEVANCE_CATEGORIES = ['Incorrect charge', 'Limit not updated', 'Statement error', 'Unauthorised transaction', 'KYC issue', 'Other']

function GrievanceScreen({ onBack, isAdmin }: { onBack: () => void; isAdmin?: boolean }) {
  const [tab, setTab] = useState<'raise' | 'mine' | 'admin'>('raise')
  const [category, setCategory] = useState(GRIEVANCE_CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [tickets, setTickets] = useState<GrievanceTicket[]>([])
  const [allTickets, setAllTickets] = useState<GrievanceTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<GrievanceTicket | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (tab === 'mine') api.myGrievances().then(setTickets).catch(() => {})
    if (tab === 'admin') api.allGrievances().then(setAllTickets).catch(() => {})
  }, [tab])

  const resolveTicket = async (id: string) => {
    setResolving(id)
    try {
      await api.resolveGrievance(id, 'Reviewed and resolved by admin')
      setAllTickets(prev => prev.map(t => t.id === id ? { ...t, status: 'RESOLVED' as const, resolution: 'Reviewed and resolved by admin' } : t))
    } catch (_) {}
    setResolving(null)
  }

  const submit = async () => {
    if (!description.trim()) return
    setLoading(true); setError('')
    try { const t = await api.raiseGrievance(category, description); setSubmitted(t); setDescription('') }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  const STATUS_COLORS: Record<string, string> = { OPEN: T.rust, IN_PROGRESS: T.faint, RESOLVED: T.green }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title={t('raiseGrievance')} onBack={onBack} />
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
        {([['raise', 'Raise concern'], ['mine', 'My tickets'], ...(isAdmin ? [['admin', 'All (admin)']] : [])] as [string, string][]).map(([tb, label]) => (
          <button key={tb} onClick={() => setTab(tb as typeof tab)} style={{ flex: 1, padding: '10px 14px', fontSize: 12, border: 'none', borderBottom: tab === tb ? `2px solid ${T.indigo}` : '2px solid transparent', backgroundColor: 'transparent', color: tab === tb ? T.indigo : T.faint, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif", fontWeight: tab === tb ? 600 : 400 }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        {tab === 'raise' ? <>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <Stamp status="settled" size={80} animate />
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, color: T.ink, marginTop: 20, marginBottom: 10 }}>Grievance received</div>
              <div style={{ fontSize: 12, color: T.faint, lineHeight: 1.6, marginBottom: 20 }}>Ticket #{submitted.id.slice(0, 8).toUpperCase()}<br />We'll respond within 30 days per RBI guidelines.</div>
              <CTABtn label="Raise another" onClick={() => setSubmitted(null)} variant="secondary" />
            </div>
          ) : <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Category</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {GRIEVANCE_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)} style={{ padding: '6px 12px', fontSize: 11, border: `1px solid ${category === cat ? T.indigo : T.line}`, borderRadius: 4, backgroundColor: category === cat ? T.indigoLight : 'transparent', color: category === cat ? T.indigo : T.faint, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif" }}>{cat}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Description</div>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your concern in detail…" rows={5} style={{ width: '100%', border: `1px solid ${T.line}`, borderRadius: 4, padding: '10px 12px', fontFamily: "'Public Sans', sans-serif", fontSize: 12, color: T.ink, backgroundColor: T.paper, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            {error && <ErrorBanner message={error} />}
            <CTABtn label={loading ? 'Submitting…' : 'Submit grievance'} onClick={submit} disabled={!description.trim() || loading} />
          </>}

          {/* Nodal Officer card */}
          <div style={{ marginTop: 24, padding: '14px', border: `1px solid ${T.line}`, borderRadius: 4, backgroundColor: '#F0EBE0' }}>
            <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{t('nodalOfficer')} — Demo contact info</div>
            <div style={{ fontSize: 12, color: T.ink, lineHeight: 1.7 }}>
              <strong>Ms. Kavitha Rao</strong><br />
              grievance@consumptioncredit.demo<br />
              1800-XXX-DEMO (toll free)<br />
              <span style={{ fontSize: 10, color: T.faint }}>Response within 30 days · Escalation to RBI Ombudsman after 30 days</span>
            </div>
          </div>
        </> : tab === 'mine' ? <>
          {tickets.length === 0
            ? <div style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: T.faint }}>No grievances raised yet</div>
            : tickets.map((tk, i) => (
              <div key={tk.id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', padding: '12px 0', borderBottom: i < tickets.length - 1 ? `1px solid ${T.line}` : 'none', alignItems: 'start' }}>
                <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}>
                  <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 9, color: T.faint }}>{fmtDate(tk.createdAt)}</span>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.ink }}>{tk.category}</div>
                  <div style={{ fontSize: 10, color: T.faint, marginTop: 1, lineHeight: 1.4 }}>{tk.description.slice(0, 80)}{tk.description.length > 80 ? '…' : ''}</div>
                  {tk.resolution && <div style={{ fontSize: 10, color: T.green, marginTop: 3 }}>Resolution: {tk.resolution}</div>}
                </div>
                <div style={{ fontSize: 9, fontWeight: 600, color: STATUS_COLORS[tk.status] ?? T.faint, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{tk.status.replace('_', ' ')}</div>
              </div>
            ))
          }
        </> : <>
          {allTickets.length === 0
            ? <div style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: T.faint }}>No grievances in the system</div>
            : allTickets.map((tk, i) => (
              <div key={tk.id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', padding: '12px 0', borderBottom: i < allTickets.length - 1 ? `1px solid ${T.line}` : 'none', alignItems: 'start' }}>
                <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}>
                  <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 9, color: T.faint, display: 'block' }}>{fmtDate(tk.createdAt)}</span>
                  <span style={{ fontSize: 8, color: T.faint, display: 'block', marginTop: 2 }}>{tk.userId.slice(0, 6)}</span>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.ink }}>{tk.category}</div>
                  <div style={{ fontSize: 10, color: T.faint, marginTop: 1, lineHeight: 1.4 }}>{tk.description.slice(0, 70)}{tk.description.length > 70 ? '…' : ''}</div>
                  {tk.resolution && <div style={{ fontSize: 10, color: T.green, marginTop: 2 }}>{tk.resolution}</div>}
                </div>
                {tk.status !== 'RESOLVED'
                  ? <button onClick={() => resolveTicket(tk.id)} disabled={resolving === tk.id} style={{ padding: '5px 8px', fontSize: 9, border: `1px solid ${T.green}`, borderRadius: 4, backgroundColor: T.greenLight, color: T.green, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif", whiteSpace: 'nowrap' }}>{resolving === tk.id ? '…' : 'Resolve'}</button>
                  : <span style={{ fontSize: 9, fontWeight: 600, color: T.green, textTransform: 'uppercase', letterSpacing: '0.05em' }}>DONE</span>
                }
              </div>
            ))
          }
        </>}
      </div>
    </div>
  )
}

// ── Insights screen ───────────────────────────────────────────────────────────

function InsightsScreen({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [data, setData] = useState<SpendInsight | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.insights(userId).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false)) }, [userId])

  if (loading) return <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><Header title={t('insights')} onBack={onBack} /><Spinner full /></div>

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title={t('insights')} onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '18px 16px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Total credit spend</div>
          <Rs n={data?.totalSpend ?? 0} size={30} credit />
          <div style={{ fontSize: 10, color: T.faint, marginTop: 3 }}>{data?.transactionCount ?? 0} transactions</div>
        </div>
        <div style={{ paddingLeft: 16 }}>
          <div style={{ padding: '10px 16px 8px 0', borderBottom: `1px solid ${T.line}` }}>
            <span style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>By category</span>
          </div>
          {(data?.breakdown ?? []).length === 0
            ? <div style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: T.faint }}>No spending data yet</div>
            : (data?.breakdown ?? []).map((row, i) => (
              <div key={row.category} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', padding: '13px 16px 13px 0', borderBottom: `1px solid ${T.line}`, alignItems: 'center' }}>
                <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}>
                  <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 13, fontWeight: 600, color: T.faint }}>#{i + 1}</span>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{row.category}</div>
                  <div style={{ marginTop: 5, height: 2, backgroundColor: T.line, borderRadius: 1, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${row.pct}%`, backgroundColor: T.rust, borderRadius: 1 }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Rs n={row.amount} size={13} credit />
                  <div style={{ fontSize: 9, color: T.faint, marginTop: 2 }}>{row.pct}%</div>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

// ── Cooling-Off Exit confirmation screen ─────────────────────────────────────

function CoolingOffExitScreen({ creditLine, onBack, onExited }: { creditLine: CreditLine; onBack: () => void; onExited: () => void }) {
  const [preview, setPreview] = useState<{ totalOwed: number; principalOwed: number; interestOwed: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')

  // Compute preview client-side for instant display
  const daysUtilized = creditLine.firstSpentAt
    ? Math.max(1, Math.ceil((Date.now() - new Date(creditLine.firstSpentAt).getTime()) / 86400000))
    : 1
  const dailyRate = creditLine.interestRate / 30
  const previewInterest = Math.round(creditLine.utilized * dailyRate * daysUtilized)
  const previewTotal = creditLine.utilized + previewInterest
  const daysLeft = creditLine.coolingOffExpiresAt
    ? Math.ceil((new Date(creditLine.coolingOffExpiresAt).getTime() - Date.now()) / 86400000)
    : 0

  const handleExit = async () => {
    setLoading(true); setError('')
    try {
      const r = await api.exitCoolingOff(creditLine.id)
      setPreview(r)
      setConfirmed(true)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Exit cooling-off period" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        {confirmed ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Stamp status="declined" size={80} animate />
            <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, color: T.ink, marginTop: 20, marginBottom: 10 }}>Credit line closed</div>
            <div style={{ fontSize: 13, color: T.faint, lineHeight: 1.65, marginBottom: 24 }}>
              Settlement: <Rs n={preview?.principalOwed ?? 0} size={13} /> principal + <Rs n={preview?.interestOwed ?? 0} size={13} credit /> interest = <Rs n={preview?.totalOwed ?? 0} size={14} credit /><br />
              No penalty applied.
            </div>
            <CTABtn label="Back to dashboard" onClick={onExited} />
          </div>
        ) : <>
          <div style={{ padding: '14px', backgroundColor: T.rustLight, border: `1px solid ${T.rust}`, borderRadius: 4, marginBottom: 22 }}>
            <div style={{ fontSize: 10, color: T.rust, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>RBI cooling-off right</div>
            <div style={{ fontSize: 12, color: T.ink, lineHeight: 1.6 }}>You have {daysLeft} day{daysLeft !== 1 ? 's' : ''} left to exit this credit line without penalty. Only principal + proportionate interest will be charged.</div>
          </div>

          <div style={{ borderTop: `1px solid ${T.line}` }}>
            {[
              { label: 'Credit line', value: creditLine.lenderName },
              { label: 'Principal used', value: `₹${creditLine.utilized.toLocaleString('en-IN')}` },
              { label: 'Days utilized', value: String(daysUtilized) },
              { label: 'Proportionate interest', value: `₹${previewInterest.toLocaleString('en-IN')}` },
              { label: 'Penalty', value: 'Nil' },
              { label: 'Total settlement', value: `₹${previewTotal.toLocaleString('en-IN')}` },
            ].map((row, i, arr) => (
              <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', padding: '12px 0', borderBottom: i < arr.length - 1 ? `1px solid ${T.line}` : 'none', alignItems: 'center' }}>
                <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}>
                  <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 10, color: T.faint }}>{String(i + 1).padStart(2, '0')}</span>
                </div>
                <span style={{ fontSize: 12.5, color: T.ink }}>{row.label}</span>
                <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontVariantNumeric: 'tabular-nums', fontSize: 13, color: i === arr.length - 1 ? T.rust : T.ink }}>{row.value}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {error && <ErrorBanner message={error} />}
            <CTABtn label={loading ? 'Processing…' : `Exit — settle ₹${previewTotal.toLocaleString('en-IN')}`} onClick={handleExit} disabled={loading} variant="danger" />
            <CTABtn label="Keep the credit line" onClick={onBack} variant="secondary" />
          </div>
        </>}
      </div>
    </div>
  )
}

// ── Demo controls ─────────────────────────────────────────────────────────────

function DemoControls({ currentUserId, onSwitchUser, onAction }: { currentUserId: string; onSwitchUser: (id: string, name: string) => void; onAction: () => void }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')

  const run = async (action: () => Promise<string>) => {
    setStatus('…')
    try { setStatus(await action()) } catch (e: any) { setStatus(e.message) }
    setTimeout(() => setStatus(''), 3000)
    onAction()
  }

  const DEMO_USERS = [
    { id: 'u_priya', name: 'Priya Mehta', label: 'MEDIUM risk' },
    { id: 'u_arjun', name: 'Arjun Sharma', label: 'Dormant' },
    { id: 'u_rahul', name: 'Rahul Verma', label: 'HIGH risk' },
    { id: 'u_sneha', name: 'Sneha Patel', label: 'New user' },
    { id: 'u_vikram', name: 'Vikram Das', label: 'LOW risk' },
  ]

  return (
    <>
      <button onClick={() => setOpen(o => !o)} style={{ position: 'absolute', bottom: 70, right: 12, width: 36, height: 36, borderRadius: '50%', border: `1px solid ${T.line}`, backgroundColor: T.paper, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.faint, zIndex: 10 }}>⚙</button>
      {open && (
        <div style={{ position: 'absolute', bottom: 112, right: 8, width: 230, border: `1px solid ${T.line}`, borderRadius: 4, backgroundColor: T.paper, zIndex: 20, overflow: 'hidden', boxShadow: '0 8px 24px rgba(28,26,23,0.12)' }}>
          <div style={{ padding: '9px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Demo controls</div>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.line}` }}>
            <div style={{ fontSize: 10, color: T.faint, marginBottom: 6 }}>Switch demo user</div>
            {DEMO_USERS.filter(u => u.id !== currentUserId).map(u => (
              <button key={u.id} onClick={() => { onSwitchUser(u.id, u.name); setOpen(false) }} style={{ display: 'block', width: '100%', padding: '7px 0', textAlign: 'left', border: 'none', backgroundColor: 'transparent', fontSize: 12, color: T.ink, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif" }}>
                {u.name} <span style={{ fontSize: 10, color: T.faint }}>({u.label})</span>
              </button>
            ))}
          </div>
          {[{ label: 'Advance time 1 day', fn: () => api.advanceDay().then(r => r.message) }, { label: 'Simulate late payment', fn: () => api.simulateLate().then(() => 'Streak reset') }].map(({ label, fn }) => (
            <button key={label} onClick={() => run(fn)} style={{ display: 'block', width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', borderBottom: `1px solid ${T.lineLight}`, backgroundColor: 'transparent', fontSize: 12, color: T.ink, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif" }}>{label}</button>
          ))}
          {status && <div style={{ padding: '8px 12px', fontSize: 11, color: T.green, borderTop: `1px solid ${T.line}` }}>{status}</div>}
        </div>
      )}
    </>
  )
}

// ── Bottom nav ────────────────────────────────────────────────────────────────

function BottomNav({ current, onNavigate, unreadCount }: { current: string; onNavigate: (s: AppScreen) => void; unreadCount: number }) {
  const tabs: { id: AppScreen; label: string; icon: string }[] = [
    { id: 'home',          label: 'Passbook',  icon: '☰' },
    { id: 'payment',       label: 'Pay',       icon: '↑' },
    { id: 'statement',     label: 'Statement', icon: '§' },
    { id: 'notifications', label: 'Alerts',    icon: '⌂' },
    { id: 'audit-log',     label: 'Audit',     icon: '⌬' },
  ]
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 58, display: 'flex', borderTop: `1px solid ${T.line}`, backgroundColor: T.paper }}>
      {tabs.map(tab => {
        const active = current === tab.id
        return (
          <button key={tab.id} onClick={() => onNavigate(tab.id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, border: 'none', backgroundColor: 'transparent', cursor: 'pointer', color: active ? T.indigo : T.faint, borderTop: active ? `2px solid ${T.indigo}` : '2px solid transparent', fontFamily: "'Public Sans', sans-serif", transition: 'color 150ms ease', position: 'relative' }}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>{tab.icon}</span>
            <span style={{ fontSize: 8.5, letterSpacing: '0.04em' }}>{tab.label}</span>
            {tab.id === 'notifications' && unreadCount > 0 && <div style={{ position: 'absolute', top: 6, right: '22%', width: 7, height: 7, borderRadius: '50%', backgroundColor: T.rust }} />}
          </button>
        )
      })}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  // i18n
  const [lang, setLang] = useState<Lang>('en')
  _lang = lang  // module-level for t() helper

  // Auth state
  const [authStage, setAuthStage] = useState<AuthStage>('checking')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [authPhone, setAuthPhone] = useState('')
  const [otpResult, setOtpResult] = useState<{ expiresAt: string; demoOtp: string; isNewUser: boolean } | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  // App state
  const [screen, setScreen] = useState<AppScreen>('home')
  const [prevScreen, setPrevScreen] = useState<AppScreen>('home')
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [statements, setStatements] = useState<Statement[]>([])
  const [dashLoading, setDashLoading] = useState(false)
  const [pendingTxId, setPendingTxId] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [bnplAmount, setBnplAmount] = useState(0)
  const [bnplCl, setBnplCl] = useState<CreditLine | null>(null)
  const [bnplMerchant, setBnplMerchant] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [kfsCl, setKfsCl] = useState<CreditLine | null>(null)
  const [coolingOffCl, setCoolingOffCl] = useState<CreditLine | null>(null)
  const kfsOnDone = useRef<(() => void) | null>(null)
  const idempotencyKey = useRef(crypto.randomUUID())

  // Wire 401 handler
  useEffect(() => {
    setUnauthorizedHandler(() => { setCurrentUser(null); setAuthStage('phone-entry'); setDash(null) })
  }, [])

  const loadDashboard = useCallback(async (userId: string) => {
    setDashLoading(true)
    try {
      const [d, stmts, notifs] = await Promise.all([api.dashboard(userId), api.statements(userId), api.notifications()])
      setDash(d); setStatements(stmts)
      setUnreadCount(notifs.filter(n => !n.readAt).length)
    } catch (_) {}
    setDashLoading(false)
  }, [])

  // On mount: check existing session
  useEffect(() => {
    const init = async () => {
      const token = session.get()
      if (token) {
        try {
          const res = await authApi.me()
          setCurrentUser(res.user)
          setAuthStage('done')
          // Ensure seed data exists
          try { await api.seed() } catch (_) {}
          await loadDashboard(res.user.id)
          return
        } catch (_) { session.clear() }
      }
      // No valid session — seed quietly, show login
      try { await api.seed() } catch (_) {}
      setAuthStage('phone-entry')
    }
    init()
  }, [])

  useEffect(() => {
    if (authStage === 'done' && currentUser && screen === 'home') loadDashboard(currentUser.id)
  }, [screen])

  // ── Auth handlers ──────────────────────────────────────────────────────────

  const handleRequestOtp = async (phone: string) => {
    setAuthLoading(true); setAuthError('')
    try {
      const res = await authApi.requestOtp(phone)
      setAuthPhone(phone)
      setOtpResult({ expiresAt: res.expiresAt, demoOtp: res.demoOtp, isNewUser: res.isNewUser })
      setAuthStage('otp-verify')
    } catch (e: any) { setAuthError(e.message) } finally { setAuthLoading(false) }
  }

  const handleVerifyOtp = async (otp: string) => {
    setAuthLoading(true); setAuthError('')
    try {
      const res = await authApi.verifyOtp(authPhone, otp, idempotencyKey.current)
      session.set(res.token)
      setCurrentUser(res.user)
      if (res.isNewUser && res.user.kycStatus === 'UNVERIFIED') setAuthStage('kyc-simulate')
      else { setAuthStage('done'); await loadDashboard(res.user.id) }
    } catch (e: any) { setAuthError(e.message) } finally { setAuthLoading(false) }
  }

  const handleKyc = async (pan: string, name: string, dob: string) => {
    setAuthLoading(true); setAuthError('')
    try {
      const res = await authApi.simulateKyc(pan, name, dob)
      setCurrentUser(res.user)
      setAuthStage('done')
      await loadDashboard(res.user.id)
    } catch (e: any) { setAuthError(e.message) } finally { setAuthLoading(false) }
  }

  const handleLogout = async () => { await authApi.logout(); setCurrentUser(null); setDash(null); setAuthStage('phone-entry') }

  // ── Demo user switch ────────────────────────────────────────────────────────
  const switchDemoUser = async (userId: string, _name: string) => {
    try {
      const res = await api.demoLoginAs(userId)
      session.set(res.token)
      setCurrentUser(res.user)
      setDash(null)
      setScreen('home')
      await loadDashboard(res.user.id)
    } catch (_) {}
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  const push = (s: AppScreen) => { setPrevScreen(screen); setScreen(s) }
  const pop  = () => setScreen(prevScreen)
  const goto = (s: AppScreen) => setScreen(s)
  const showNav = authStage === 'done' && ['home', 'payment', 'statement', 'notifications', 'audit-log'].includes(screen)

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderAuth = () => {
    switch (authStage) {
      case 'checking': return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
          <svg width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="24" fill="none" stroke={T.line} strokeWidth="1.5" /><circle cx="28" cy="28" r="24" fill="none" stroke={T.indigo} strokeWidth="1.5" strokeDasharray="150" style={{ animation: 'draw-circle 1.4s ease-in-out infinite', transformOrigin: 'center', transform: 'rotate(-90deg)' }} /></svg>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 17, color: T.ink }}>ConsumptionCredit</div>
        </div>
      )
      case 'phone-entry': return <PhoneEntryScreen onSubmit={handleRequestOtp} loading={authLoading} error={authError} />
      case 'otp-verify': return otpResult ? <OtpVerifyScreen phone={authPhone} expiresAt={otpResult.expiresAt} demoOtp={otpResult.demoOtp} isNewUser={otpResult.isNewUser} onVerify={handleVerifyOtp} onResend={() => { setAuthStage('phone-entry'); setAuthError('') }} onBack={() => { setAuthStage('phone-entry'); setAuthError('') }} loading={authLoading} error={authError} /> : null
      case 'kyc-simulate': return <KycSimulateScreen onSubmit={handleKyc} onBack={() => setAuthStage('otp-verify')} loading={authLoading} error={authError} />
      default: return null
    }
  }

  const renderApp = () => {
    if (dashLoading && !dash) return <Spinner full />
    switch (screen) {
      case 'home': return dash ? <HomeScreen dash={dash} onLimitGrowth={() => push('limit-growth')} onPending={txId => { setPendingTxId(txId); push('pending') }} onLimitProposal={() => push('limit-proposal')} onInsights={() => push('insights')} onGrievance={() => push('grievance')} onKfs={cl => { setKfsCl(cl); push('kfs') }} onCoolingOff={cl => { setCoolingOffCl(cl); push('cooling-off-exit') }} /> : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: T.faint }}>Loading passbook…</div>
      case 'payment': return dash ? <PaymentScreen dash={dash} onBack={pop} onPaid={async () => { await loadDashboard(currentUser!.id); goto('home') }} onPending={txId => { setPendingTxId(txId); push('pending') }} onBNPL={(amt, cl) => { setBnplAmount(amt); setBnplCl(cl); setBnplMerchant('Merchant'); push('bnpl') }} onDeclined={reason => { setDeclineReason(reason); push('declined') }} onShowKfs={(cl, onDone) => { setKfsCl(cl); push('kfs'); /* onDone wired via kfsOnDone ref */ kfsOnDone.current = onDone }} /> : <Spinner full />
      case 'pending': return <PendingScreen txId={pendingTxId} onBack={pop} onCancel={async () => { await loadDashboard(currentUser!.id); goto('home') }} onConfirm={async () => { await loadDashboard(currentUser!.id); goto('home') }} />
      case 'statement': return <StatementScreen statements={statements} creditLines={dash?.creditLines ?? []} onBack={pop} onRepay={() => push('repayment')} />
      case 'repayment': return <RepaymentScreen openStatement={dash?.openStatement ?? null} onBack={pop} onConfirm={async () => { await loadDashboard(currentUser!.id); goto('statement') }} />
      case 'limit-growth': return <LimitGrowthScreen auditEntry={dash?.recentLimitGrowth ?? null} creditLines={dash?.creditLines ?? []} onBack={pop} />
      case 'limit-proposal': return <LimitProposalScreen proposals={dash?.pendingLimitProposals ?? []} creditLines={dash?.creditLines ?? []} onBack={pop} onAccepted={async () => { await loadDashboard(currentUser!.id); goto('home') }} onDeclined={async () => { await loadDashboard(currentUser!.id); goto('home') }} />
      case 'kfs': return kfsCl ? <KFSScreen creditLine={kfsCl} onBack={pop} onAccept={() => { kfsOnDone.current?.(); kfsOnDone.current = null; pop() }} /> : <Spinner full />
      case 'cooling-off-exit': return coolingOffCl ? <CoolingOffExitScreen creditLine={coolingOffCl} onBack={pop} onExited={async () => { await loadDashboard(currentUser!.id); goto('home') }} /> : <Spinner full />
      case 'grievance': return <GrievanceScreen onBack={pop} isAdmin={currentUser?.role === 'ADMIN'} />
      case 'insights': return <InsightsScreen userId={currentUser?.id ?? ''} onBack={pop} />
      case 'bnpl': return bnplCl ? <BNPLScreen creditLine={bnplCl} amount={bnplAmount} merchantName={bnplMerchant} onBack={pop} onConfirm={async () => { await loadDashboard(currentUser!.id); goto('home') }} /> : <Spinner full />
      case 'declined': return <DeclinedScreen reason={declineReason} onBack={pop} onStatement={() => goto('statement')} />
      case 'audit-log': return <AuditLogScreen userId={currentUser?.id ?? ''} onBack={pop} />
      case 'notifications': return <NotificationsScreen onBack={pop} onMarkRead={() => setUnreadCount(0)} />
      default: return null
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#D9D4C8', padding: 20 }}>
      <div style={{ width: 390, height: 844, backgroundColor: T.paper, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 96px rgba(28,26,23,0.3)', border: `1px solid rgba(201,192,172,0.6)`, borderRadius: 8 }}>
        {/* Status bar */}
        <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', flexShrink: 0, backgroundColor: T.paper, borderBottom: `1px solid ${T.lineLight}` }}>
          <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 12, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>9:41</span>
          <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 12, color: T.indigo, letterSpacing: '0.01em' }}>
            {currentUser ? currentUser.name || currentUser.upiVpa : 'ConsumptionCredit'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setLang(l => l === 'en' ? 'hi' : 'en')} style={{ background: 'none', border: `1px solid ${T.line}`, borderRadius: 3, fontSize: 9, color: T.faint, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif", padding: '2px 5px', letterSpacing: '0.04em' }}>{lang === 'en' ? 'हिं' : 'EN'}</button>
            {currentUser
              ? <button onClick={handleLogout} style={{ background: 'none', border: 'none', fontSize: 10, color: T.faint, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif", letterSpacing: '0.04em' }}>{t('signOut')}</button>
              : <span style={{ fontSize: 10, color: T.faint }}>KYC ✓</span>
            }
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: showNav ? 58 : 0 }}>
          {authStage !== 'done' ? renderAuth() : renderApp()}
        </div>

        {showNav && <BottomNav current={screen} onNavigate={goto} unreadCount={unreadCount} />}
        {showNav && currentUser && <DemoControls currentUserId={currentUser.id} onSwitchUser={switchDemoUser} onAction={() => loadDashboard(currentUser.id)} />}
      </div>
    </div>
  )
}
