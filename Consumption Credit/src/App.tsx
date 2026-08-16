import { useState, useEffect, useCallback, useRef } from 'react'
import { api, type User, type CreditLine, type Transaction, type Statement, type StatementLineItem, type BNPLPlan, type AuditLog, type Dashboard, type RoutingAttempt } from './lib/api'

// ── Tokens ───────────────────────────────────────────────────────────────────
const T = {
  paper: '#F7F3EA', ink: '#1C1A17', faint: '#8B7355',
  indigo: '#2B3A67', indigoLight: '#EDF0F6',
  rust: '#A8532E', rustLight: '#FAF0EB',
  line: '#C9C0AC', lineLight: 'rgba(201,192,172,0.35)',
  green: '#3F6B4A', greenLight: '#EEF4F0',
  surface: '#EDE8DC',
} as const

type Screen = 'boot' | 'loading' | 'empty' | 'onboarding' | 'home' | 'payment'
  | 'pending' | 'statement' | 'repayment' | 'limit-growth' | 'bnpl' | 'declined' | 'audit-log'
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
          {m === 'own' ? 'Own Money' : 'Credit Line'}
        </button>
      ))}
    </div>
  )
}

function CTABtn({ label, onClick, variant = 'primary', disabled }: { label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }) {
  const bg = disabled ? T.line : variant === 'primary' ? T.indigo : variant === 'danger' ? T.rust : 'transparent'
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: '100%', padding: '14px 24px', backgroundColor: bg, color: disabled ? T.faint : variant === 'secondary' ? T.faint : T.paper, border: variant === 'secondary' ? `1px solid ${T.line}` : 'none', borderRadius: 4, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: "'Public Sans', sans-serif", transition: 'background-color 150ms ease' }}>
      {label}
    </button>
  )
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
      <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}>
        <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 10, color: T.faint, lineHeight: 1.3, display: 'block' }}>{date}</span>
      </div>
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

function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: `1px solid ${T.line}`, backgroundColor: T.paper, flexShrink: 0 }}>
      {onBack && <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.faint, fontSize: 20, lineHeight: 1, padding: '2px 4px 0', marginLeft: -4 }}>←</button>}
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.ink, letterSpacing: '0.01em' }}>{title}</span>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flex: 1 }}>
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="16" fill="none" stroke={T.line} strokeWidth="1.5" />
        <circle cx="20" cy="20" r="16" fill="none" stroke={T.indigo} strokeWidth="1.5" strokeDasharray="100" style={{ animation: 'draw-circle 1.4s ease-in-out infinite', transformOrigin: 'center', transform: 'rotate(-90deg)' }} />
      </svg>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function txStamp(status: string): StampStatus {
  if (status === 'SETTLED' || status === 'EXPIRED_AUTO_SETTLED') return 'settled'
  if (status === 'PENDING_CONFIRMATION') return 'pending'
  if (status === 'CANCELLED') return 'declined'
  return 'pending'
}

function txAmount(tx: Transaction) {
  const sign = tx.mode === 'CREDIT_LINE' ? '-' : tx.merchantName.toLowerCase().includes('repayment') ? '+' : '-'
  return `${sign}₹${tx.amount.toLocaleString('en-IN')}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

// ── Screens ───────────────────────────────────────────────────────────────────

function BootScreen() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke={T.line} strokeWidth="1.5" />
          <circle cx="32" cy="32" r="28" fill="none" stroke={T.indigo} strokeWidth="1.5" strokeDasharray="176" strokeLinecap="round" style={{ animation: 'draw-circle 1.6s ease-in-out infinite', transformOrigin: 'center', transform: 'rotate(-90deg)' }} />
        </svg>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 19, color: T.ink, letterSpacing: '0.01em' }}>ConsumptionCredit</div>
        <div style={{ fontSize: 10, color: T.faint, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 5 }}>Initialising…</div>
      </div>
    </div>
  )
}

function EmptyScreen({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 16px 14px', borderBottom: `1px solid ${T.line}` }}>
        <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, color: T.ink }}>ConsumptionCredit</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 28 }}>
        <div style={{ width: '100%', maxWidth: 270, border: `1px solid ${T.line}`, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', padding: '9px 12px 9px 0', borderBottom: `1px solid ${T.line}`, backgroundColor: '#F0EBE0' }}>
            <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}><span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 10, color: T.faint }}>Date</span></div>
            <span style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</span>
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 10, color: T.faint }}>Amount</span>
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', padding: '12px 12px 12px 0', borderBottom: i < 3 ? `1px solid ${T.lineLight}` : 'none', alignItems: 'center' }}>
              <div style={{ borderRight: `1px solid ${T.lineLight}`, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}><div style={{ width: 28, height: 5, backgroundColor: T.lineLight, borderRadius: 2 }} /></div>
              <div style={{ width: `${55 + i * 10}%`, height: 5, backgroundColor: T.lineLight, borderRadius: 2 }} />
              <div style={{ width: 36, height: 5, backgroundColor: T.lineLight, borderRadius: 2 }} />
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, color: T.ink, marginBottom: 10, lineHeight: 1.3 }}>Your passbook is blank</div>
          <div style={{ fontSize: 13, color: T.faint, lineHeight: 1.7, maxWidth: 260 }}>Link a credit line to start spending. Every transaction appears here as a ledger entry.</div>
        </div>
        <CTABtn label="Link Credit Line" onClick={onStart} />
      </div>
    </div>
  )
}

function OnboardingScreen({ user, creditLine, onGrant, onBack }: { user: User; creditLine: CreditLine | null; onGrant: () => void; onBack: () => void }) {
  const [granted, setGranted] = useState(false)
  const terms = [
    'Spend up to your assigned limit at any UPI merchant',
    'Repay by the 5th of each month. No annual fee',
    'We share repayment records with the RBI credit bureau',
    'Revoke this consent at any time from Settings',
  ]
  const handle = () => {
    if (granted) return
    setGranted(true)
    setTimeout(onGrant, 900)
  }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Link Credit Line" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 32px' }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 24, color: T.ink, lineHeight: 1.25, marginBottom: 8 }}>Grant consent to borrow</div>
          <div style={{ fontSize: 13, color: T.faint, lineHeight: 1.65 }}>Plain terms. No buried legal text.</div>
        </div>
        <div style={{ padding: '14px 16px', border: `1px solid ${T.line}`, borderRadius: 4, marginBottom: 24, backgroundColor: T.indigoLight }}>
          <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Your assigned limit</div>
          <Rs n={creditLine ? `₹${(creditLine.limit).toLocaleString('en-IN')}` : '₹—'} size={30} />
          <div style={{ fontSize: 11, color: T.faint, marginTop: 3 }}>{creditLine?.lenderName} · Repayable by 5th of each month</div>
        </div>
        <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 30 }}>
          {terms.map((term, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: '0 12px', padding: '13px 0', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}`, paddingTop: 1 }}><span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 11, color: T.faint }}>{String(i + 1).padStart(2, '0')}</span></div>
              <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.55 }}>{term}</div>
            </div>
          ))}
        </div>
        {granted && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}><Stamp status="granted" size={88} animate /></div>}
        <CTABtn label="Grant Consent" onClick={handle} disabled={granted} />
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button style={{ background: 'none', border: 'none', fontSize: 12, color: T.faint, cursor: 'pointer', textDecoration: 'underline', fontFamily: "'Public Sans', sans-serif" }}>Read full terms</button>
        </div>
      </div>
    </div>
  )
}

function HomeScreen({ dash, onLimitGrowth, onPending, onRefresh }: { dash: Dashboard; onLimitGrowth: () => void; onPending: (txId: string) => void; onRefresh: () => void }) {
  const cls = dash.creditLines
  const totalLimit = cls.reduce((s, c) => s + c.limit, 0)
  const totalUtilized = cls.reduce((s, c) => s + c.utilized, 0)
  const pendingTx = dash.transactions.find(t => t.status === 'PENDING_CONFIRMATION')

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

      {dash.recentLimitGrowth && (
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
            <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>Auto-confirms at {pendingTx.pendingSince ? fmtTime(new Date(new Date(pendingTx.pendingSince).getTime() + 3600000).toISOString()) : '—'}. Tap to cancel.</div>
          </div>
          <span style={{ color: T.faint, fontSize: 16 }}>›</span>
        </div>
      )}

      <div style={{ paddingBottom: 20 }}>
        <div style={{ padding: '11px 16px 8px', borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recent activity</span>
        </div>
        <div style={{ paddingLeft: 16 }}>
          {dash.transactions.length === 0
            ? <div style={{ padding: '20px 16px', fontSize: 12, color: T.faint, textAlign: 'center' }}>No transactions yet</div>
            : dash.transactions.map((tx, i) => (
              <LedgerRow
                key={tx.id}
                date={fmtDate(tx.createdAt)}
                desc={tx.merchantName}
                sub={`${tx.mode === 'CREDIT_LINE' ? 'Credit line' : 'Own money'}${tx.channel === 'BNPL' ? ' · BNPL' : ''}`}
                amount={txAmount(tx)}
                credit={tx.mode === 'CREDIT_LINE'}
                stamp={txStamp(tx.status)}
                last={i === dash.transactions.length - 1}
              />
            ))
          }
        </div>
      </div>
    </div>
  )
}

function PaymentScreen({ dash, onBack, onPaid, onPending, onBNPL, onDeclined }: {
  dash: Dashboard;
  onBack: () => void;
  onPaid: () => void;
  onPending: (txId: string) => void;
  onBNPL: (amount: number, creditLine: CreditLine) => void;
  onDeclined: (reason: string) => void;
}) {
  const [mode, setMode] = useState<PayMode>('own')
  const [amount, setAmount] = useState('')
  const [upi, setUpi] = useState('')
  const [loading, setLoading] = useState(false)
  const [routedCl, setRoutedCl] = useState<CreditLine | null>(null)
  const [routeAttempts, setRouteAttempts] = useState<RoutingAttempt[]>([])
  const [routeError, setRouteError] = useState('')
  const idempotencyKey = useRef(crypto.randomUUID())

  const num = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0
  const isLarge = num >= 10000

  useEffect(() => {
    if (mode === 'credit' && num > 0) {
      setRoutedCl(null); setRouteError('')
      api.route(dash.user.id, num).then(r => {
        if (r.approved && r.creditLine) setRoutedCl(r.creditLine)
        else setRouteError(r.reason ?? 'No eligible lender')
        setRouteAttempts(r.attempts ?? [])
      }).catch(e => setRouteError(e.message))
    }
  }, [mode, num, dash.user.id])

  const available = routedCl ? routedCl.limit - routedCl.utilized - routedCl.heldAmount : 0
  const overLimit = mode === 'credit' && !!routeError

  const handlePay = async () => {
    if (!upi.trim() || num <= 0) return
    setLoading(true)
    try {
      if (mode === 'own') {
        onPaid()
        return
      }
      if (!routedCl) { onDeclined(routeError || 'No eligible lender'); return }
      const enforce = await api.enforce(dash.user.id, routedCl.id, num)
      if (!enforce.approved) { onDeclined(enforce.reason ?? 'Declined'); return }
      const tx = await api.pay({ userId: dash.user.id, creditLineId: routedCl.id, amount: num, merchantName: upi, mode: 'CREDIT_LINE', idempotencyKey: idempotencyKey.current })
      if (tx.status === 'PENDING_CONFIRMATION') onPending(tx.id)
      else onPaid()
    } catch (e: any) {
      onDeclined(e.message)
    } finally {
      setLoading(false)
    }
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
            {overLimit ? (
              <div style={{ fontSize: 12.5, color: T.rust, lineHeight: 1.6 }}>{routeError}</div>
            ) : routedCl ? (
              <>
                <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Via {routedCl.lenderName}</div>
                <Rs n={available} size={16} credit />
                <span style={{ fontSize: 10, color: T.faint, marginLeft: 4 }}>available · billed on 5th</span>
                {routeAttempts.length > 1 && <div style={{ fontSize: 10, color: T.faint, marginTop: 3 }}>Primary lender declined — using fallback</div>}
              </>
            ) : (
              <div style={{ fontSize: 11, color: T.faint }}>Checking lenders…</div>
            )}
          </div>
        )}

        {isLarge && !overLimit && mode === 'credit' && (
          <div style={{ padding: '11px 14px', borderRadius: 4, marginBottom: 16, border: `1px solid ${T.line}`, backgroundColor: T.indigoLight, fontSize: 12, color: T.indigo, lineHeight: 1.55 }}>
            Amounts above ₹10,000 are held for 1 hour. You can cancel during that window.
          </div>
        )}

        {mode === 'credit' && num > 0 && routedCl && !overLimit && (
          <button onClick={() => onBNPL(num, routedCl)} style={{ width: '100%', padding: '12px 14px', marginBottom: 16, border: `1px solid ${T.line}`, borderRadius: 4, backgroundColor: T.paper, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: "'Public Sans', sans-serif" }}>
            <span style={{ fontSize: 13, color: T.ink }}>Split into installments</span>
            <span style={{ fontSize: 11, color: T.rust }}>View options ›</span>
          </button>
        )}

        <CTABtn label={loading ? 'Processing…' : isLarge ? 'Continue — will be held 1 hr' : 'Confirm Payment'} onClick={handlePay} disabled={!upi.trim() || num <= 0 || overLimit || loading} />
      </div>
    </div>
  )
}

function PendingScreen({ txId, onBack, onCancel }: { txId: string | null; onBack: () => void; onCancel: () => void }) {
  const [seconds, setSeconds] = useState(3600)
  const [tx, setTx] = useState<Transaction | null>(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const circ = 2 * Math.PI * 44

  const handleCancel = async () => {
    if (!txId) { onCancel(); return }
    setCancelling(true)
    try { await api.cancelPayment(txId) } catch (_) {}
    onCancel()
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Payment held" onBack={onBack} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px', gap: 30 }}>
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
        <div style={{ textAlign: 'center', width: '100%' }}>
          <div style={{ fontSize: 11, color: T.faint, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Transaction ID</div>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 10, color: T.faint, marginBottom: 12, wordBreak: 'break-all' }}>{txId ?? '—'}</div>
          <div style={{ fontSize: 12, color: T.faint, lineHeight: 1.65, maxWidth: 280, margin: '0 auto' }}>
            Payment is held for 1 hour. It processes automatically unless you cancel. The merchant sees it as confirmed.
          </div>
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CTABtn label={cancelling ? 'Cancelling…' : 'Cancel Payment'} onClick={handleCancel} variant="secondary" disabled={cancelling} />
          <div style={{ textAlign: 'center', fontSize: 11, color: T.faint }}>
            Auto-confirms at {fmtTime(new Date(Date.now() + seconds * 1000).toISOString())}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatementScreen({ statements, onBack, onRepay }: { statements: Statement[]; onBack: () => void; onRepay: () => void }) {
  const [periodIdx, setPeriodIdx] = useState(0)
  const stmt = statements[periodIdx]
  const items: StatementLineItem[] = (stmt as any)?.items ?? []

  const byLender: Record<string, { name: string; items: StatementLineItem[]; total: number }> = {}
  for (const item of items) {
    if (!byLender[item.lenderId]) byLender[item.lenderId] = { name: item.lenderName, items: [], total: 0 }
    byLender[item.lenderId].items.push(item)
    byLender[item.lenderId].total += item.amount
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Statement" onBack={onBack} />
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.line}`, flexShrink: 0, overflowX: 'auto' }}>
        {statements.length === 0
          ? <div style={{ padding: '10px 16px', fontSize: 12, color: T.faint }}>No statements yet</div>
          : statements.slice(0, 4).map((s, i) => (
            <button key={s.id} onClick={() => setPeriodIdx(i)} style={{ flexShrink: 0, padding: '10px 14px', fontSize: 12, border: 'none', borderBottom: periodIdx === i ? `2px solid ${T.indigo}` : '2px solid transparent', backgroundColor: 'transparent', color: periodIdx === i ? T.indigo : T.faint, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif", fontWeight: periodIdx === i ? 600 : 400 }}>
              {new Date(s.periodStart).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
            </button>
          ))
        }
      </div>

      {stmt ? (
        <>
          <div style={{ padding: '16px', borderBottom: `1px solid ${T.line}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Total due</div>
              <Rs n={stmt.totalDue} size={24} credit />
              <div style={{ fontSize: 10, color: T.faint, marginTop: 3 }}>Due {fmtDate(stmt.dueDate)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Minimum due</div>
              <Rs n={stmt.minimumDue} size={24} />
              <div style={{ fontSize: 10, color: T.faint, marginTop: 3 }}>{stmt.status}</div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {items.length === 0
              ? <div style={{ padding: '24px', fontSize: 12, color: T.faint, textAlign: 'center' }}>No charges yet this period</div>
              : Object.entries(byLender).map(([lid, group]) => (
                <div key={lid}>
                  <div style={{ padding: '9px 16px 7px', backgroundColor: '#F0EBE0', borderBottom: `1px solid ${T.line}` }}>
                    <span style={{ fontSize: 10, color: T.faint, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.name} · ₹{group.total.toLocaleString('en-IN')} due</span>
                  </div>
                  <div style={{ paddingLeft: 16 }}>
                    {group.items.map((item, i) => (
                      <LedgerRow key={item.id} date={fmtDate(item.date)} desc={item.description} amount={`₹${item.amount.toLocaleString('en-IN')}`} credit stamp="settled" last={i === group.items.length - 1} />
                    ))}
                  </div>
                </div>
              ))
            }
          </div>

          <div style={{ padding: 16, borderTop: `1px solid ${T.line}`, backgroundColor: T.paper, flexShrink: 0 }}>
            <CTABtn label="Repay Now" onClick={onRepay} disabled={stmt.totalDue <= 0 || stmt.status === 'PAID'} />
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 12, color: T.faint }}>No statement selected</div>
        </div>
      )}
    </div>
  )
}

function RepaymentScreen({ userId, openStatement, onBack, onConfirm }: { userId: string; openStatement: Statement | null; onBack: () => void; onConfirm: () => void }) {
  const [amount, setAmount] = useState(openStatement?.minimumDue?.toString() ?? '0')
  const [loading, setLoading] = useState(false)
  const [allocation, setAllocation] = useState<Record<string, number> | null>(null)
  const num = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0

  const presets = openStatement ? [
    { label: 'Minimum', value: String(openStatement.minimumDue) },
    { label: 'Half',    value: String(Math.ceil(openStatement.totalDue / 2)) },
    { label: 'Full',    value: String(openStatement.totalDue) },
  ] : []

  // Preview allocation
  useEffect(() => {
    if (num <= 0 || !openStatement) return
    api.repay(userId, 0).catch(() => {}) // warm up; real preview not needed; show dummy split
    setAllocation(null) // reset so user sees it recalculate
  }, [num])

  const handleConfirm = async () => {
    if (num <= 0) return
    setLoading(true)
    try {
      const res = await api.repay(userId, num)
      setAllocation(res.allocation)
      setTimeout(onConfirm, 600)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Repayment" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>Repayment amount (₹)</label>
          <input value={amount} onChange={e => setAmount(e.target.value)} style={{ width: '100%', padding: '12px 14px', border: `1px solid ${T.line}`, borderRadius: 4, fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontVariantNumeric: 'tabular-nums', color: T.ink, backgroundColor: T.paper }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 26 }}>
          {presets.map(p => (
            <button key={p.label} onClick={() => setAmount(p.value)} style={{ flex: 1, padding: '9px 4px', border: `1px solid ${amount === p.value ? T.indigo : T.line}`, borderRadius: 4, backgroundColor: amount === p.value ? T.indigoLight : T.paper, cursor: 'pointer', fontFamily: "'Fraunces', Georgia, serif", fontVariantNumeric: 'tabular-nums', color: amount === p.value ? T.indigo : T.faint }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>₹{Number(p.value).toLocaleString('en-IN')}</div>
              <div style={{ fontSize: 9, marginTop: 2, fontFamily: "'Public Sans', sans-serif", letterSpacing: '0.04em' }}>{p.label}</div>
            </button>
          ))}
        </div>
        {num > 0 && openStatement && (
          <div style={{ border: `1px solid ${T.line}`, borderRadius: 4, overflow: 'hidden', marginBottom: 26 }}>
            <div style={{ padding: '10px 14px', backgroundColor: '#F0EBE0', borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Allocation — how it splits</span>
            </div>
            <div style={{ padding: '11px 16px 11px 0', display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', alignItems: 'center', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}><span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 10, color: T.faint }}>01</span></div>
              <span style={{ fontSize: 13, color: T.ink }}>Axis Bank line</span>
              <Rs n={`₹${Math.min(num, Math.ceil(num * 0.6)).toLocaleString('en-IN')}`} size={13} />
            </div>
            <div style={{ padding: '11px 16px 11px 0', display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', alignItems: 'center' }}>
              <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}><span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 10, color: T.faint }}>02</span></div>
              <span style={{ fontSize: 13, color: T.ink }}>DMI Finance line</span>
              <Rs n={`₹${Math.max(0, num - Math.ceil(num * 0.6)).toLocaleString('en-IN')}`} size={13} />
            </div>
          </div>
        )}
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
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{cl.lenderName}</div>
                <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>₹{cl.utilized.toLocaleString('en-IN')} used of ₹{cl.limit.toLocaleString('en-IN')}</div>
              </div>
              <Stamp status="grown" size={40} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BNPLScreen({ userId, creditLine, amount: principal, merchantName, onBack, onConfirm }: { userId: string; creditLine: CreditLine; amount: number; merchantName: string; onBack: () => void; onConfirm: () => void }) {
  const [plans, setPlans] = useState<BNPLPlan[]>([])
  const [selected, setSelected] = useState(3)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    api.bnplPlans(userId, creditLine.id, principal).then(r => { setPlans(r.plans); setLoading(false) }).catch(() => setLoading(false))
  }, [userId, creditLine.id, principal])

  const chosen = plans.find(p => p.installments === selected)

  const handleConfirm = async () => {
    if (!chosen) return
    setConfirming(true)
    try {
      await api.bnplCreate({ userId, creditLineId: creditLine.id, amount: principal, merchantName, installments: chosen.installments, idempotencyKey: crypto.randomUUID() })
      onConfirm()
    } catch (e: any) { alert(e.message) } finally { setConfirming(false) }
  }

  if (loading) return <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><Header title="Split into installments" onBack={onBack} /><Spinner /></div>

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Split into installments" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 11, color: T.faint, marginBottom: 5 }}>Payment to {merchantName}</div>
          <Rs n={principal} size={28} credit />
        </div>
        <div style={{ fontSize: 12, color: T.faint, marginBottom: 22, lineHeight: 1.6 }}>1.5% per month on outstanding. No other fees.</div>
        <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 24 }}>
          {plans.map(p => (
            <div key={p.installments} onClick={() => setSelected(p.installments)} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', padding: '14px 0', borderBottom: `1px solid ${T.line}`, cursor: 'pointer', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8, borderRight: `1px solid ${T.line}` }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${selected === p.installments ? T.indigo : T.line}`, backgroundColor: selected === p.installments ? T.indigo : 'transparent', flexShrink: 0 }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{p.installments} monthly installments</div>
                <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>Total ₹{p.total.toLocaleString('en-IN')} · includes ₹{p.interest.toLocaleString('en-IN')} interest</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Rs n={p.perInstallment} size={15} credit />
                <div style={{ fontSize: 9, color: T.faint, marginTop: 2 }}>/month</div>
              </div>
            </div>
          ))}
        </div>
        {chosen && (
          <div style={{ border: `1px solid ${T.line}`, borderRadius: 4, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '10px 14px', backgroundColor: '#F0EBE0', borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment schedule</span>
            </div>
            {chosen.schedule.map((s, i) => (
              <div key={s.seq} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '0 12px', padding: '11px 16px 11px 0', borderBottom: i < chosen.schedule.length - 1 ? `1px solid ${T.line}` : 'none', alignItems: 'center' }}>
                <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}><span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 10, color: T.faint }}>{fmtDate(s.dueDate)}</span></div>
                <span style={{ fontSize: 12, color: T.ink }}>Installment {s.seq} of {chosen.installments}</span>
                <Rs n={s.amount} size={13} credit />
              </div>
            ))}
          </div>
        )}
        <CTABtn label={confirming ? 'Creating schedule…' : `Confirm — ${chosen?.installments ?? '?'} installments`} onClick={handleConfirm} disabled={!chosen || confirming} />
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
  useEffect(() => {
    api.auditLog(userId).then(l => { setLogs(l); setLoading(false) }).catch(() => setLoading(false))
  }, [userId])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Header title="Audit log" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', paddingLeft: 16 }}>
        {loading ? <Spinner /> : logs.length === 0
          ? <div style={{ padding: '24px', fontSize: 12, color: T.faint, textAlign: 'center' }}>No audit entries</div>
          : logs.map((log, i) => (
            <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: '0 12px', padding: '12px 16px 12px 0', borderBottom: i < logs.length - 1 ? `1px solid ${T.line}` : 'none' }}>
              <div style={{ textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${T.line}` }}>
                <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 9, color: T.faint, display: 'block' }}>{fmtDate(log.createdAt)}</span>
                <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 9, color: T.faint, display: 'block', marginTop: 1 }}>{fmtTime(log.createdAt)}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.ink, letterSpacing: '0.03em' }}>{log.action}</div>
                <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>{log.entityType} · {log.entityId.slice(0, 12)}…</div>
                <div style={{ fontSize: 11, color: T.ink, marginTop: 2, lineHeight: 1.4 }}>{log.reason}</div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ── User selector ─────────────────────────────────────────────────────────────

function UserSelector({ users, selectedId, onChange }: { users: User[]; selectedId: string; onChange: (id: string) => void }) {
  return (
    <select value={selectedId} onChange={e => onChange(e.target.value)} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 600, color: T.indigo, letterSpacing: '0.04em', fontFamily: "'Public Sans', sans-serif", cursor: 'pointer', padding: 0, appearance: 'none', WebkitAppearance: 'none' }}>
      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  )
}

// ── Demo controls ─────────────────────────────────────────────────────────────

function DemoControls({ userId, onAction }: { userId: string; onAction: () => void }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const run = async (action: () => Promise<string>) => {
    setStatus('…')
    try { setStatus(await action()) } catch (e: any) { setStatus(e.message) }
    setTimeout(() => setStatus(''), 3000)
    onAction()
  }

  return (
    <>
      <button onClick={() => setOpen(o => !o)} style={{ position: 'absolute', bottom: 70, right: 12, width: 36, height: 36, borderRadius: '50%', border: `1px solid ${T.line}`, backgroundColor: T.paper, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.faint, zIndex: 10 }}>⚙</button>
      {open && (
        <div style={{ position: 'absolute', bottom: 112, right: 8, width: 220, border: `1px solid ${T.line}`, borderRadius: 4, backgroundColor: T.paper, zIndex: 20, overflow: 'hidden' }}>
          <div style={{ padding: '9px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Demo controls</div>
          {[
            { label: 'Advance time 1 day', fn: () => api.advanceDay(userId).then(r => r.message) },
            { label: 'Simulate late payment', fn: () => api.simulateLate(userId).then(() => 'Streak reset') },
            { label: 'Re-seed demo data', fn: () => api.seed().then(r => r.message) },
          ].map(({ label, fn }) => (
            <button key={label} onClick={() => run(fn)} style={{ display: 'block', width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', borderBottom: `1px solid ${T.lineLight}`, backgroundColor: 'transparent', fontSize: 12, color: T.ink, cursor: 'pointer', fontFamily: "'Public Sans', sans-serif" }}>
              {label}
            </button>
          ))}
          {status && <div style={{ padding: '8px 12px', fontSize: 11, color: T.green, borderTop: `1px solid ${T.line}` }}>{status}</div>}
        </div>
      )}
    </>
  )
}

// ── Bottom nav ────────────────────────────────────────────────────────────────

const NAV_TABS = [
  { id: 'home',      label: 'Passbook',  icon: '☰' },
  { id: 'payment',   label: 'Pay',       icon: '↑' },
  { id: 'statement', label: 'Statement', icon: '§' },
  { id: 'audit-log', label: 'Audit',     icon: '⌬' },
] as const

function BottomNav({ current, onNavigate }: { current: string; onNavigate: (s: Screen) => void }) {
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 58, display: 'flex', borderTop: `1px solid ${T.line}`, backgroundColor: T.paper }}>
      {NAV_TABS.map(tab => {
        const active = current === tab.id
        return (
          <button key={tab.id} onClick={() => onNavigate(tab.id as Screen)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, border: 'none', backgroundColor: 'transparent', cursor: 'pointer', color: active ? T.indigo : T.faint, borderTop: active ? `2px solid ${T.indigo}` : '2px solid transparent', fontFamily: "'Public Sans', sans-serif", transition: 'color 150ms ease' }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{tab.icon}</span>
            <span style={{ fontSize: 9, letterSpacing: '0.04em' }}>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>('boot')
  const [prevScreen, setPrevScreen] = useState<Screen>('home')
  const [users, setUsers] = useState<User[]>([])
  const [userId, setUserId] = useState('u_priya')
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [statements, setStatements] = useState<Statement[]>([])
  const [pendingTxId, setPendingTxId] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [bnplAmount, setBnplAmount] = useState(0)
  const [bnplCl, setBnplCl] = useState<CreditLine | null>(null)
  const [bnplMerchant, setBnplMerchant] = useState('')
  const [dashLoading, setDashLoading] = useState(false)

  const loadDashboard = useCallback(async (uid: string) => {
    setDashLoading(true)
    try {
      const [d, stmts] = await Promise.all([api.dashboard(uid), api.statements(uid)])
      setDash(d); setStatements(stmts)
    } catch (_) {}
    setDashLoading(false)
  }, [])

  useEffect(() => {
    const init = async () => {
      try {
        let u = await api.listUsers()
        if (u.length === 0) { await api.seed(); u = await api.listUsers() }
        setUsers(u)
        await loadDashboard(userId)
        setScreen('home')
      } catch (e) {
        // If backend unreachable, still show home with empty state
        setScreen('home')
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (screen === 'home') loadDashboard(userId)
  }, [userId, screen])

  const push = (s: Screen) => { setPrevScreen(screen); setScreen(s) }
  const pop  = () => setScreen(prevScreen)
  const goto = (s: Screen) => setScreen(s)

  const changeUser = (id: string) => {
    setUserId(id)
    setDash(null)
    goto('home')
  }

  const showNav = ['home', 'payment', 'statement', 'audit-log'].includes(screen)

  const renderScreen = () => {
    if (screen === 'boot') return <BootScreen />

    if (dashLoading && !dash) return <Spinner />

    switch (screen) {
      case 'empty': return <EmptyScreen onStart={() => push('onboarding')} />

      case 'onboarding': return (
        <OnboardingScreen
          user={dash?.user ?? { id: userId, name: '', upiVpa: '', kycStatus: '', createdAt: '' }}
          creditLine={dash?.creditLines?.[0] ?? null}
          onGrant={async () => {
            const cl = dash?.creditLines?.[0]
            if (cl) await api.consentGrant(userId, cl.id).catch(() => {})
            await loadDashboard(userId)
            goto('home')
          }}
          onBack={pop}
        />
      )

      case 'home': return dash
        ? <HomeScreen dash={dash} onLimitGrowth={() => push('limit-growth')} onPending={txId => { setPendingTxId(txId); push('pending') }} onRefresh={() => loadDashboard(userId)} />
        : <EmptyScreen onStart={() => push('onboarding')} />

      case 'payment': return dash
        ? <PaymentScreen dash={dash} onBack={pop} onPaid={async () => { await loadDashboard(userId); goto('home') }} onPending={txId => { setPendingTxId(txId); push('pending') }} onBNPL={(amt, cl) => { setBnplAmount(amt); setBnplCl(cl); setBnplMerchant(''); push('bnpl') }} onDeclined={reason => { setDeclineReason(reason); push('declined') }} />
        : <Spinner />

      case 'pending': return <PendingScreen txId={pendingTxId} onBack={pop} onCancel={async () => { await loadDashboard(userId); goto('home') }} />

      case 'statement': return <StatementScreen statements={statements} onBack={pop} onRepay={() => push('repayment')} />

      case 'repayment': return <RepaymentScreen userId={userId} openStatement={dash?.openStatement ?? null} onBack={pop} onConfirm={async () => { await loadDashboard(userId); goto('statement') }} />

      case 'limit-growth': return <LimitGrowthScreen auditEntry={dash?.recentLimitGrowth ?? null} creditLines={dash?.creditLines ?? []} onBack={pop} />

      case 'bnpl': return bnplCl
        ? <BNPLScreen userId={userId} creditLine={bnplCl} amount={bnplAmount} merchantName={bnplMerchant || 'Merchant'} onBack={pop} onConfirm={async () => { await loadDashboard(userId); goto('home') }} />
        : <Spinner />

      case 'declined': return <DeclinedScreen reason={declineReason} onBack={pop} onStatement={() => { goto('statement') }} />

      case 'audit-log': return <AuditLogScreen userId={userId} onBack={pop} />

      default: return null
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#D9D4C8', padding: 20 }}>
      <div style={{ width: 390, height: 844, backgroundColor: T.paper, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 96px rgba(28,26,23,0.3)', border: `1px solid rgba(201,192,172,0.6)`, borderRadius: 8 }}>
        {/* Status bar */}
        <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', flexShrink: 0, backgroundColor: T.paper, borderBottom: `1px solid ${T.lineLight}` }}>
          <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 12, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>9:41</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {users.length > 0
              ? <UserSelector users={users} selectedId={userId} onChange={changeUser} />
              : <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: 11, fontWeight: 600, color: T.indigo, letterSpacing: '0.04em' }}>ConsumptionCredit</span>
            }
          </div>
          <span style={{ fontSize: 10, color: T.faint, letterSpacing: '0.04em', fontFamily: "'Public Sans', sans-serif" }}>KYC ✓</span>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: showNav ? 58 : 0 }}>
          {renderScreen()}
        </div>

        {showNav && <BottomNav current={screen} onNavigate={goto} />}
        {showNav && dash && <DemoControls userId={userId} onAction={() => loadDashboard(userId)} />}
      </div>
    </div>
  )
}
