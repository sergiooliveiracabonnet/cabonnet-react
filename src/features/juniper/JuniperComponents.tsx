import { Badge } from '../../components/ui/Badge'
import { ChevronDown, ChevronRight, Clock } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface HistoricoSnap {
  ts:      string
  hora:    string
  data:    string
  total:   number
  online:  number
  clientes: unknown[]
}

export type JuniperKpis = {
  total: number; online: number; offline: number
  interfaces: number; ips: number; ultima: string; proximo: string
}
export type JuniperHero = {
  nivel: string; nivel_label: string; statusTxt: string; desc: string; meta: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  ok:    { text: 'text-green',  border: 'border-green/[0.20]',  bg: 'bg-green/[0.04]',  icon: 'bg-green/[0.10]'  },
  warn:  { text: 'text-yellow', border: 'border-yellow/[0.20]', bg: 'bg-yellow/[0.04]', icon: 'bg-yellow/[0.10]' },
  alert: { text: 'text-red',    border: 'border-red/[0.20]',    bg: 'bg-red/[0.04]',    icon: 'bg-red/[0.10]'    },
}
export function getHeroStyle(nivel: string): { text: string; border: string; bg: string; icon: string } {
  return (STATUS_STYLE as Record<string, typeof STATUS_STYLE[keyof typeof STATUS_STYLE]>)[nivel]
    ?? { text: 'text-muted', border: 'border-white/[0.08]', bg: '', icon: 'bg-surface/40' }
}

const OS_URGENCY = [
  { min: 15, text: 'text-red',    bg: 'bg-red/[0.06]',    bar: 'bg-red'    },
  { min: 8,  text: 'text-orange', bg: 'bg-orange/[0.06]', bar: 'bg-orange' },
  { min: 4,  text: 'text-yellow', bg: 'bg-yellow/[0.06]', bar: 'bg-yellow' },
]
export function getOsStyle(total: number): { text: string; bg: string; bar: string } {
  for (const u of OS_URGENCY) if (total >= u.min) return u
  return { text: 'text-primary', bg: '', bar: 'bg-primary' }
}

export function relTime(ts: string | null | undefined): string {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60)    return `${diff}s atrás`
  if (diff < 3600)  return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return `${Math.floor(diff / 86400)}d atrás`
}

// ─── StatusPill ───────────────────────────────────────────────────────────────

export function StatusPill({ nivel, txt }: { nivel: string; txt: string }) {
  const isOk   = nivel === 'ok'
  const isWarn = nivel === 'warn'
  const dot    = isOk ? 'bg-green' : isWarn ? 'bg-yellow' : 'bg-muted'
  const border = isOk ? 'border-green/20' : isWarn ? 'border-yellow/20' : 'border-white/[0.08]'
  return (
    <div className={`inline-flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-full
                    bg-card-high border ${border} text-secondary`}>
      <span className="relative flex h-2 w-2 flex-shrink-0">
        {isOk && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-60" />}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dot}`} />
      </span>
      {txt}
    </div>
  )
}

// ─── ClientCard ───────────────────────────────────────────────────────────────

type JuniperClient = Record<string, string | undefined>

export function ClientCard({ c }: { c: JuniperClient }) {
  const isOnline = c.state !== 'inactive'
  return (
    <div className={`relative overflow-hidden rounded-xl border transition-all duration-200
      hover:-translate-y-0.5 hover:shadow-2xl
      ${isOnline
        ? 'bg-gradient-to-br from-[#0f1b2d] via-surface to-primary/[0.07] border-primary/[0.18] hover:border-primary/40 hover:shadow-primary/10'
        : 'bg-gradient-to-br from-[#1a0f0f] via-surface to-red/[0.05] border-white/[0.08] hover:border-red/25'}`}>

      <div className={`absolute inset-x-0 top-0 h-[2px] ${isOnline
        ? 'bg-gradient-to-r from-primary via-cyan-400/70 to-transparent'
        : 'bg-gradient-to-r from-red/60 via-red/30 to-transparent'}`} />

      <div className="p-4 pt-5">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                ${isOnline ? 'bg-green shadow-[0_0_6px_rgba(74,222,128,0.8)] animate-pulse' : 'bg-red/60'}`} />
              <p className="text-[13px] font-bold text-text truncate uppercase antialiased leading-tight">{c.usuario}</p>
            </div>
            <p className="text-[11px] text-muted/60 ml-3.5 uppercase tracking-[0.04em] font-mono truncate">{c.iface}</p>
          </div>
          <span className={`flex-shrink-0 text-[8px] font-bold px-2.5 py-1 rounded-full tracking-widest border
            ${isOnline ? 'bg-green/[0.10] text-green border-green/25' : 'bg-red/[0.12] text-red border-red/25'}`}>
            {isOnline ? '● ONLINE' : '● OFFLINE'}
          </span>
        </div>

        <div className={`rounded-xl px-3 py-2.5 mb-3 border ${isOnline
          ? 'bg-primary/[0.08] border-primary/[0.15]'
          : 'bg-surface/20 border-white/[0.05]'}`}>
          <p className="text-[8px] font-bold uppercase tracking-[0.05em] text-muted mb-1">Endereço IP</p>
          <p className={`text-[15px] font-mono font-bold uppercase antialiased leading-none tracking-wide
            ${isOnline ? 'text-primary' : 'text-secondary'}`}>{c.ip}</p>
        </div>

        {c.mac !== '—' && (
          <div className="mb-3">
            <p className="text-[8px] font-bold uppercase tracking-[0.05em] text-muted/60 mb-0.5">MAC Address</p>
            <p className="text-[11px] font-mono text-secondary/80 uppercase tracking-wider">{c.mac}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.05] mt-1">
          <div className="flex items-center gap-1.5">
            {c.uptime !== '—' && (
              <>
                <Clock size={10} className="text-muted/50 flex-shrink-0" />
                <span className="text-[11px] font-mono text-muted uppercase">{c.uptime}</span>
              </>
            )}
          </div>
          {c.loginTime !== '—' && (
            <span className="text-[11px] text-muted/50 font-mono uppercase">{c.loginTime}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── InterfaceCard ────────────────────────────────────────────────────────────

interface IfaceRow { nome: string; total: number; online: number }

export function InterfaceCard({ iface, maxIface }: { iface: IfaceRow; maxIface: number }) {
  const pct = Math.round((iface.total / maxIface) * 100)
  return (
    <div className="bg-card border border-white/[0.08] rounded-xl p-4 flex flex-col gap-3">
      <div>
        <p className="text-[11px] font-bold text-text truncate mb-0.5">{iface.nome}</p>
        <div className="flex items-baseline gap-2">
          <p className="font-mono font-bold text-2xl text-primary tabular-nums">{iface.total}</p>
          <p className="text-[11px] text-muted">clientes</p>
        </div>
        {iface.online > 0 && (
          <p className="text-[10px] text-green mt-0.5 font-semibold">{iface.online} online</p>
        )}
      </div>
      <div>
        <div className="h-1.5 bg-surface rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%`, transition: 'width 0.6s ease' }} />
        </div>
        <p className="text-[10px] text-muted/50 mt-1 font-mono text-right">{pct}%</p>
      </div>
    </div>
  )
}

// ─── SnapshotRow ──────────────────────────────────────────────────────────────

export function SnapshotRow({ snap, isOpen, onToggle }: {
  snap: HistoricoSnap; isOpen: boolean; onToggle: () => void
}) {
  const onlinePct = snap.total > 0 ? Math.round((snap.online / snap.total) * 100) : 0
  const relTxt    = relTime(snap.ts)
  return (
    <div className="border-b border-white/[0.04] last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface/30 transition-colors text-left"
      >
        {isOpen
          ? <ChevronDown  size={12} className="text-muted flex-shrink-0" />
          : <ChevronRight size={12} className="text-muted flex-shrink-0" />}
        <div className="flex-shrink-0 w-[72px]">
          <p className="font-mono text-[12px] text-text">{snap.hora}</p>
          {relTxt && <p className="text-[10px] text-muted/50">{relTxt}</p>}
        </div>
        <span className="text-[11px] text-muted w-[80px] flex-shrink-0">{snap.data}</span>
        <Badge variant="cyan">{snap.total} conectados</Badge>
        <Badge variant="green">{snap.online} online</Badge>
        <div className="flex-1 max-w-[80px] hidden md:block">
          <div className="h-1 bg-surface rounded-full overflow-hidden">
            <div className="h-full bg-green rounded-full" style={{ width: `${onlinePct}%` }} />
          </div>
          <p className="text-[9px] text-muted/40 font-mono mt-0.5">{onlinePct}%</p>
        </div>
        <span className="text-[10px] text-muted ml-auto font-mono">{(snap.clientes ?? []).length} reg.</span>
      </button>

      {isOpen && (
        <div className="overflow-x-auto border-t border-white/[0.04] bg-surface/15">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.08]">
                {['Usuário', 'IP', 'MAC', 'Interface', 'Uptime', 'Login'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[11px] font-bold text-muted uppercase tracking-[0.04em]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {(snap.clientes ?? []).map((c, ci) => {
                const cl = c as Record<string, string>
                return (
                  <tr key={ci} className="hover:bg-primary/[0.04]">
                    <td className="px-4 py-2 font-bold text-text uppercase antialiased">{cl.usuario}</td>
                    <td className="px-4 py-2 font-mono font-semibold text-primary uppercase antialiased">{cl.ip}</td>
                    <td className="px-4 py-2 font-mono text-[12px] font-semibold text-text uppercase antialiased">{cl.mac}</td>
                    <td className="px-4 py-2 text-secondary uppercase">{cl.iface}</td>
                    <td className="px-4 py-2 text-muted uppercase">{cl.uptime}</td>
                    <td className="px-4 py-2 text-muted uppercase">{cl.loginTime}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── OsCityCard ───────────────────────────────────────────────────────────────

export function OsCityCard({ cidade, total, maxOsCity }: { cidade: string; total: number; maxOsCity: number }) {
  const style = getOsStyle(total)
  const pct   = Math.round((total / maxOsCity) * 100)
  return (
    <div className={`${style.bg} bg-surface border border-white/[0.08] rounded-xl p-3 flex flex-col gap-2`}>
      <div className="flex items-center justify-between gap-1">
        <p className="text-[11px] font-semibold text-text truncate flex-1">{cidade}</p>
        <p className={`font-mono font-bold text-xl tabular-nums flex-shrink-0 ${style.text}`}>{total}</p>
      </div>
      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${pct}%`, transition: 'width 0.6s ease' }} />
      </div>
      <p className="text-[10px] text-muted">OS abertas</p>
    </div>
  )
}
