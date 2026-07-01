import { useState, useRef, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import { useAuditStore } from '../../store/auditStore'

export function LoginPage() {
  const setAuthed  = useAuthStore(s => s.setAuthed)
  const logAudit   = useAuditStore(s => s.log)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)
  const submittingRef = useRef(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!username.trim() || !password || submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    setError('')
    try {
      const res = await api.auth.login(username.trim(), password) as { ok: boolean; role?: string; error?: string }
      if (res.ok) {
        logAudit(`Login realizado`, `role: ${res.role ?? 'gestor'}`, 'auth')
        setSuccess(true)
        setTimeout(() => setAuthed((res.role ?? 'gestor') as 'gestor' | 'operador' | 'viewer'), 600)
        return
      } else {
        setError(res.error || 'Credenciais inválidas')
      }
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)) ?? ''
      if (msg.startsWith('401')) {
        setError('Usuário ou senha incorretos')
      } else if (msg.startsWith('Timeout')) {
        setError('Servidor não respondeu. Verifique se o Cabonnet está rodando.')
      } else {
        setError('Não foi possível conectar ao servidor.')
      }
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 180% 140% at 5% 40%, #0d2147 0%, #07111f 30%, #040c18 55%, #020810 75%, #010509 100%)' }}
    >
      {/* ── BACKGROUND ── */}
      <div className="absolute inset-0 pointer-events-none">
        <style>{`
          @keyframes orb-a { 0%,100%{ opacity:.13 } 50%{ opacity:.22 } }
          @keyframes orb-b { 0%,100%{ opacity:.07 } 50%{ opacity:.13 } }
          @keyframes ap    { 0%,100%{ stroke-opacity:.13 } 50%{ stroke-opacity:.24 } }
          @keyframes ap2   { 0%,100%{ stroke-opacity:.08 } 50%{ stroke-opacity:.17 } }
          @keyframes dot    { 0%,100%{ opacity:.35 } 50%{ opacity:.9  } }
          @keyframes rack-b { 0%,100%{ opacity:.10 } 50%{ opacity:.17 } }
          @keyframes led-w  { 0%,100%{ opacity:.8  } 50%{ opacity:.25 } }
          .orb-a  { animation: orb-a  12s ease-in-out infinite }
          .orb-b  { animation: orb-b  16s ease-in-out infinite }
          .ap     { animation: ap     10s ease-in-out infinite }
          .ap2    { animation: ap2    10s ease-in-out infinite 3.3s }
          .ap3    { animation: ap2    10s ease-in-out infinite 6.6s }
          .dot    { animation: dot     4s ease-in-out infinite }
          .rack-b { animation: rack-b 14s ease-in-out infinite }
          .led-w  { animation: led-w   2s ease-in-out infinite }
        `}</style>

        {/* Glow — primary (top-left quadrant) */}
        <div
          className="absolute orb-a"
          style={{
            top: '-20%', left: '-8%',
            width: '72%', height: '90%',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(29,78,216,0.28) 0%, rgba(29,78,216,0.10) 38%, transparent 68%)',
            filter: 'blur(90px)',
          }}
        />

        {/* Glow — secondary (bottom-right) */}
        <div
          className="absolute orb-b"
          style={{
            bottom: '-25%', right: '-5%',
            width: '55%', height: '70%',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(8,102,148,0.14) 0%, rgba(8,102,148,0.05) 50%, transparent 70%)',
            filter: 'blur(110px)',
          }}
        />

        {/* Diagonal light sweep */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(124deg, transparent 30%, rgba(29,78,216,0.035) 48%, rgba(37,99,235,0.05) 54%, transparent 68%)' }}
        />

        {/* Fine dot mesh */}
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="mesh" width="38" height="38" patternUnits="userSpaceOnUse">
              <circle cx="19" cy="19" r="0.58" fill="#93c5fd" fillOpacity="0.13" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#mesh)" />
        </svg>

        {/* SVG: arcs + accent elements */}
        {/*
          Arc math — all three arcs share center (1620, 450):
          Outer  r=740: at y=0→900, x = 1620 − √(740²−450²) = 1620 − 580 = 1040
          Middle r=560: x = 1620 − √(560²−450²) = 1620 − 323 = 1297
          Inner  r=390: y range [450−390,450+390]=[60,840]; leftmost x=1230
        */}
        <svg
          className="absolute inset-0 w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            {/* Vertical gradient for arcs — fade at top/bottom */}
            <linearGradient id="ag1" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="#2563eb" stopOpacity="0" />
              <stop offset="22%"  stopColor="#3b82f6" stopOpacity="1" />
              <stop offset="78%"  stopColor="#2563eb" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ag2" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="#1d4ed8" stopOpacity="0" />
              <stop offset="25%"  stopColor="#2563eb" stopOpacity="1" />
              <stop offset="75%"  stopColor="#1d4ed8" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ag3" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="#1e40af" stopOpacity="0" />
              <stop offset="30%"  stopColor="#1d4ed8" stopOpacity="1" />
              <stop offset="70%"  stopColor="#1e40af" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#1e40af" stopOpacity="0" />
            </linearGradient>
            {/* Horizontal accent line gradient */}
            <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#1d4ed8" stopOpacity="0" />
              <stop offset="28%"  stopColor="#2563eb" stopOpacity="0.14" />
              <stop offset="50%"  stopColor="#3b82f6" stopOpacity="0.32" />
              <stop offset="72%"  stopColor="#2563eb" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
            </linearGradient>
            {/* Glow filter for accent dot */}
            <filter id="df" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* ─── Corner brackets (enterprise precision marks) ─── */}
          <path d="M 0 52 L 0 0 L 52 0"   fill="none" stroke="#1e40af" strokeWidth="0.9" strokeOpacity="0.22" />
          <path d="M 1388 0 L 1440 0 L 1440 52" fill="none" stroke="#1e40af" strokeWidth="0.9" strokeOpacity="0.22" />
          <path d="M 0 848 L 0 900 L 52 900"   fill="none" stroke="#1e40af" strokeWidth="0.9" strokeOpacity="0.18" />
          <path d="M 1388 900 L 1440 900 L 1440 848" fill="none" stroke="#1e40af" strokeWidth="0.9" strokeOpacity="0.18" />

          {/* ─── Outer arc (r=740, center 1620,450) ─── */}
          {/* Endpoints: (1040, 0) and (1040, 900), left-side arc */}
          <path
            d="M 1040 0 A 740 740 0 1 1 1040 900"
            fill="none" stroke="url(#ag1)" strokeWidth="0.75"
            className="ap"
          />

          {/* ─── Middle arc (r=560, center 1620,450) ─── */}
          {/* Endpoints: (1297, 0) and (1297, 900) */}
          <path
            d="M 1297 0 A 560 560 0 1 1 1297 900"
            fill="none" stroke="url(#ag2)" strokeWidth="0.6"
            className="ap2"
          />

          {/* ─── Inner arc (r=390, center 1620,450) ─── */}
          {/* y range: 60 to 840; leftmost x=1230 */}
          <path
            d="M 1620 60 A 390 390 0 0 0 1620 840"
            fill="none" stroke="url(#ag3)" strokeWidth="0.5"
            className="ap3"
          />

          {/* ─── Accent dot at tangent of outer arc ─── */}
          <circle cx="880" cy="450" r="3.5" fill="#3b82f6" fillOpacity="0.8" filter="url(#df)" className="dot" />
          <circle cx="880" cy="450" r="1.5" fill="#93c5fd" fillOpacity="0.95" />

          {/* ─── Horizontal accent line at mid-screen ─── */}
          <line x1="0" y1="450" x2="1440" y2="450" stroke="url(#hg)" strokeWidth="0.85" />

          {/* ─── Subtle vertical rule left side ─── */}
          <line x1="56" y1="80" x2="56" y2="820" stroke="#1e40af" strokeWidth="0.6" strokeOpacity="0.1" />

          {/* ─── SERVER RACK silhouette (right side) ─── */}
          <g transform="translate(1255, 248)" className="rack-b">
            {/* Chassis frame */}
            <rect x="0" y="0" width="96" height="252" rx="4" fill="none" stroke="#60a5fa" strokeWidth="1.1"/>
            {/* Rack ears */}
            <rect x="-8" y="8"   width="8"  height="12" rx="1.5" fill="none" stroke="#60a5fa" strokeWidth="0.7"/>
            <rect x="96" y="8"   width="8"  height="12" rx="1.5" fill="none" stroke="#60a5fa" strokeWidth="0.7"/>
            <rect x="-8" y="232" width="8"  height="12" rx="1.5" fill="none" stroke="#60a5fa" strokeWidth="0.7"/>
            <rect x="96" y="232" width="8"  height="12" rx="1.5" fill="none" stroke="#60a5fa" strokeWidth="0.7"/>
            {/* 7 server units (1U each) */}
            {[0,1,2,3,4,5,6].map(i => (
              <g key={i} transform={`translate(6, ${8 + i*34})`}>
                <rect x="0" y="0" width="84" height="26" rx="2.5" fill="none" stroke="#60a5fa" strokeWidth="0.75"/>
                {/* Drive bays suggestion */}
                <rect x="4" y="6"  width="10" height="14" rx="1" fill="rgba(96,165,250,0.12)" stroke="#60a5fa" strokeWidth="0.5"/>
                <rect x="18" y="6" width="10" height="14" rx="1" fill="rgba(96,165,250,0.12)" stroke="#60a5fa" strokeWidth="0.5"/>
                {/* Port cluster */}
                <rect x="34" y="9" width="5" height="4" rx="0.5" fill="rgba(96,165,250,0.15)" stroke="#60a5fa" strokeWidth="0.4"/>
                <rect x="41" y="9" width="5" height="4" rx="0.5" fill="rgba(96,165,250,0.15)" stroke="#60a5fa" strokeWidth="0.4"/>
                {/* Status LED */}
                <circle cx="75" cy="13" r="2.2"
                  fill={i === 4 ? '#facc15' : '#4ade80'}
                  fillOpacity={i === 4 ? '0.9' : '0.8'}
                  className={i === 4 ? 'led-w' : ''}/>
                <circle cx="69" cy="13" r="1.4" fill="#60a5fa" fillOpacity="0.6"/>
              </g>
            ))}
            {/* Cable management bar at bottom */}
            <rect x="6" y="246" width="84" height="4" rx="1" fill="rgba(96,165,250,0.1)" stroke="#60a5fa" strokeWidth="0.5"/>
          </g>

          {/* ─── FIBER OPTIC CABLES from rack ─── */}
          {/* Each cable: elegant bezier from rack left side sweeping across screen */}
          <defs>
            <linearGradient id="fo1" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0"/>
              <stop offset="15%"  stopColor="#60a5fa" stopOpacity="0.55"/>
              <stop offset="55%"  stopColor="#3b82f6" stopOpacity="0.22"/>
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="fo2" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0"/>
              <stop offset="20%"  stopColor="#38bdf8" stopOpacity="0.45"/>
              <stop offset="60%"  stopColor="#3b82f6" stopOpacity="0.18"/>
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="fo3" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%"   stopColor="#6366f1" stopOpacity="0"/>
              <stop offset="18%"  stopColor="#818cf8" stopOpacity="0.35"/>
              <stop offset="65%"  stopColor="#6366f1" stopOpacity="0.14"/>
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="fo4" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%"   stopColor="#2563eb" stopOpacity="0"/>
              <stop offset="25%"  stopColor="#3b82f6" stopOpacity="0.38"/>
              <stop offset="70%"  stopColor="#1d4ed8" stopOpacity="0.12"/>
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0"/>
            </linearGradient>
          </defs>

          {/* Cable 1 — top, sweeping high arc */}
          <path
            d="M 1255 278 C 1080 210 860 180 620 240 S 280 320 0 290"
            fill="none" stroke="url(#fo1)" strokeWidth="1.1" strokeLinecap="round"/>
          {/* Cable 2 — upper mid */}
          <path
            d="M 1255 312 C 1060 300 840 310 600 370 S 260 430 0 400"
            fill="none" stroke="url(#fo2)" strokeWidth="0.9" strokeLinecap="round"/>
          {/* Cable 3 — lower mid */}
          <path
            d="M 1255 388 C 1050 420 820 390 580 450 S 220 530 0 510"
            fill="none" stroke="url(#fo3)" strokeWidth="0.85" strokeLinecap="round"/>
          {/* Cable 4 — bottom, wide sweep */}
          <path
            d="M 1255 456 C 1020 500 780 480 520 540 S 180 620 0 600"
            fill="none" stroke="url(#fo4)" strokeWidth="0.8" strokeLinecap="round"/>

          {/* Fiber bundle entry point (rack output) */}
          <rect x="1245" y="272" width="10" height="192" rx="4"
            fill="none" stroke="#60a5fa" strokeWidth="0.7" strokeOpacity="0.15"/>
        </svg>

        {/* Vignette — edges dark, center clear */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 35%, rgba(1,4,12,0.90) 100%)' }}
        />
      </div>

      {/* ── LOGIN PANEL ── */}
      <div className="relative w-full max-w-[360px] animate-fade-in">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-9">
          <div className="relative w-[216px] h-[93px] mb-4">
            {/* Ambient glow behind the mark — echoes the primary orb in the backdrop */}
            <div
              className="absolute inset-0 blur-2xl opacity-70"
              style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 50%, rgba(59,130,246,0.38) 0%, transparent 72%)' }}
            />
            <img
              src="/logo-cabonnet.png"
              alt="Cabonnet"
              className="relative w-full h-full object-contain"
              style={{ filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.55)) drop-shadow(0 0 28px rgba(59,130,246,0.16))' }}
            />
          </div>
          <h1 className="font-headline text-[22px] font-semibold tracking-tight"
              style={{ color: '#e8edf5', letterSpacing: '-0.02em' }}>
            Gestão de OS
          </h1>
          <p className="text-[11px] mt-1.5 tracking-[0.06em]"
             style={{ color: 'rgba(148,163,184,0.52)' }}>
            Supervisor&nbsp;|&nbsp;Sergio Oliveira
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl px-8 py-8"
          style={{
            background: 'rgba(4,10,24,0.80)',
            backdropFilter: 'blur(44px)',
            WebkitBackdropFilter: 'blur(44px)',
            border: '1px solid rgba(255,255,255,0.065)',
            borderTop: '1px solid rgba(255,255,255,0.11)',
            boxShadow: [
              '0 0 0 1px rgba(29,78,216,0.09)',
              '0 2px 4px rgba(0,0,0,0.3)',
              '0 16px 40px rgba(0,0,0,0.55)',
              '0 48px 96px rgba(0,0,0,0.4)',
            ].join(', '),
          }}
        >
          {/* Section label */}
          <p className="text-[10px] font-medium tracking-[0.14em] uppercase mb-5 text-center"
             style={{ color: 'rgba(96,165,250,0.6)' }}>
            Acesso restrito
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Usuário */}
            <div>
              <label className="block text-[11px] font-medium mb-1.5"
                     style={{ color: 'rgba(148,163,184,0.75)', letterSpacing: '0.04em' }}>
                Usuário
              </label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={loading}
                placeholder="Digite seu usuário"
                className="w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none
                           transition-all duration-200 disabled:opacity-50"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: '#e2e8f0',
                  caretColor: '#3b82f6',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(59,130,246,0.45)'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
                onBlur={e =>  { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Senha */}
            <div>
              <label className="block text-[11px] font-medium mb-1.5"
                     style={{ color: 'rgba(148,163,184,0.75)', letterSpacing: '0.04em' }}>
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="Senha"
                  className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-[13px] outline-none
                             transition-all duration-200 disabled:opacity-50"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    color: '#e2e8f0',
                    caretColor: '#3b82f6',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(59,130,246,0.45)'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
                  onBlur={e =>  { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.boxShadow = 'none' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'rgba(148,163,184,0.45)' }}
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Erro */}
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
                   style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.18)' }}>
                <span className="text-[10px] font-bold mt-px" style={{ color: '#f87171' }}>!</span>
                <p className="text-[11px] leading-snug" style={{ color: 'rgba(248,113,113,0.9)' }}>{error}</p>
              </div>
            )}

            {/* Divider */}
            <div className="h-px my-1" style={{ background: 'rgba(255,255,255,0.05)' }} />

            {/* Botão */}
            <button
              type="submit"
              disabled={loading || success || !username.trim() || !password}
              className="w-full h-10 rounded-xl text-[13px] font-semibold text-white
                         active:scale-[0.985] transition-all duration-150
                         disabled:opacity-40 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2"
              style={{
                background: success
                  ? 'linear-gradient(135deg,#059669,#047857)'
                  : 'linear-gradient(135deg,#1d4ed8 0%,#2563eb 50%,#1e40af 100%)',
                boxShadow: success
                  ? '0 4px 16px rgba(5,150,105,0.28)'
                  : '0 4px 20px rgba(29,78,216,0.32), 0 1px 3px rgba(0,0,0,0.4)',
              }}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : success ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 mt-7">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(59,130,246,0.4)' }} />
          <p className="text-[10px] tracking-[0.06em]" style={{ color: 'rgba(100,116,139,0.55)' }}>
            Cabonnet ISP · Sistema Interno · v1.0
          </p>
        </div>
      </div>
    </div>
  )
}
