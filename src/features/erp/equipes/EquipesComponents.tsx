import { useMemo } from 'react'
import {
  Package, Wrench, Network, Users,
  Clock, AlertTriangle, ChevronRight,
  Activity, CheckCircle2, X, DollarSign,
} from 'lucide-react'
import type { OSRow } from '../../../lib/types'
import type { Team } from '../erpConstants'
import { useIsGestor } from '../../../hooks/useRole'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type Metrics  = { queue: number; criticas: number; concluidas: number }
export type SlaEntry = { sla?: number; agingMed?: number; nome?: string; tipo?: string; total?: number; criticas?: number }

// ─── Date helpers ─────────────────────────────────────────────────────────────

export const DAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

export function toKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

export function parseLocalDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const s = raw.trim().split(/[ T]/)[0]
  try {
    if (s.includes('/')) { const [d,m,y] = s.split('/'); return new Date(+y,+m-1,+d) }
    if (s.includes('-')) { const [y,m,d] = s.split('-'); return new Date(+y,+m-1,+d) }
  } catch { /* ignore */ }
  return null
}

// ─── Tipo config ──────────────────────────────────────────────────────────────

export const TIPO = {
  INSTALACAO: {
    label: 'Instalação', Icon: Package,
    iconCls: 'text-primary', iconBg: 'bg-primary/10 border border-primary/20',
    badge: 'bg-primary/15 text-primary border border-primary/20',
    bar: 'bg-primary', maxQueue: 18,
  },
  MANUTENCAO: {
    label: 'Manutenção', Icon: Wrench,
    iconCls: 'text-orange', iconBg: 'bg-orange/10 border border-orange/20',
    badge: 'bg-orange/15 text-orange border border-orange/20',
    bar: 'bg-orange', maxQueue: 12,
  },
  REDE: {
    label: 'Rede', Icon: Network,
    iconCls: 'text-green', iconBg: 'bg-green/10 border border-green/20',
    badge: 'bg-green/15 text-green border border-green/20',
    bar: 'bg-green', maxQueue: 10,
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function slaCls(v: number): string {
  if (v >= 90) return 'text-green'
  if (v >= 75) return 'text-orange'
  return 'text-red'
}

export function capacityBarCls(pct: number, tipo: string): string {
  if (pct > 85) return 'bg-red'
  if (pct > 60) return 'bg-orange'
  return (TIPO as Record<string, typeof TIPO[keyof typeof TIPO]>)[tipo]?.bar || 'bg-primary'
}

export function statusDot(pct: number): { cls: string; label: string } {
  if (pct > 85) return { cls: 'bg-red',    label: 'Sobrecarregada' }
  if (pct > 60) return { cls: 'bg-orange', label: 'Carregada'      }
  if (pct > 0)  return { cls: 'bg-green',  label: 'Disponível'     }
  return { cls: 'bg-surface/200', label: 'Sem OS' }
}

// ─── EquipeCard ───────────────────────────────────────────────────────────────

export function EquipeCard({ team, metrics, slaData, custoMensal = 0, indisponivel = false, onClick }: {
  team: Team; metrics: Metrics; slaData: SlaEntry | undefined
  custoMensal?: number; indisponivel?: boolean; onClick: (t: Team) => void
}) {
  const cfg      = (TIPO as Record<string, typeof TIPO[keyof typeof TIPO]>)[team.tipo]
  const Icon     = cfg.Icon
  const queue      = metrics.queue ?? 0
  const criticas   = metrics.criticas ?? 0
  const concluidas = metrics.concluidas ?? 0
  const sla        = slaData?.sla ?? 0
  const pct        = Math.min((queue / cfg.maxQueue) * 100, 100)
  const barCls     = capacityBarCls(pct, team.tipo)
  const status     = statusDot(pct)
  const agingMed   = slaData?.agingMed ?? 0
  const custoPorOs = custoMensal > 0 && concluidas > 0
    ? Math.round(custoMensal / concluidas)
    : null
  const score = Math.round(sla * 0.6 + (1 - pct / 100) * 40)

  return (
    <div
      onClick={() => onClick(team)}
      role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick(team)}
      className="group bg-elevated border border-white/[0.08] rounded-xl p-4 cursor-pointer
                 hover:border-muted/40 hover:shadow-xl hover:shadow-black/30
                 transition-all duration-200 flex flex-col gap-3.5 outline-none
                 focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.iconBg}`}>
            <Icon size={18} className={cfg.iconCls} />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-text leading-none truncate">{team.code}</p>
            <p className="text-[11px] text-secondary mt-0.5">{team.leader}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {indisponivel ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface text-muted border border-white/[0.08]">
              Indisponível
            </span>
          ) : (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
          )}
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${indisponivel ? 'bg-surface/200' : status.cls}`} />
            <span className="text-[9px] text-muted">{indisponivel ? 'Fora de serviço' : status.label}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface/30 rounded-lg py-2 text-center">
          <p className="text-[18px] font-headline font-bold text-text leading-none">{queue}</p>
          <p className="text-[9px] text-muted mt-0.5">Na fila</p>
        </div>
        <div className="bg-surface/30 rounded-lg py-2 text-center">
          <p className={`text-[18px] font-headline font-bold leading-none ${slaCls(sla)}`}>
            {sla > 0 ? `${sla.toFixed(0)}%` : '—'}
          </p>
          <p className="text-[9px] text-muted mt-0.5">SLA</p>
        </div>
        <div className="bg-surface/30 rounded-lg py-2 text-center">
          <p className={`text-[18px] font-headline font-bold leading-none ${criticas > 0 ? 'text-red' : 'text-text'}`}>
            {criticas}
          </p>
          <p className="text-[9px] text-muted mt-0.5">Críticas</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted">Capacidade</span>
          <span className={`text-[10px] font-semibold ${pct > 85 ? 'text-red' : pct > 60 ? 'text-orange' : 'text-green'}`}>
            {Math.round(pct)}%
          </span>
        </div>
        <div className="h-1.5 bg-surface/40 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${barCls}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[9px] text-muted mt-1">{queue} / {cfg.maxQueue} slots</p>
      </div>

      <div className="flex items-center justify-between pt-0.5 border-t border-white/[0.05]">
        <div className="flex items-center gap-2 text-[10px] text-muted flex-wrap">
          <span className="flex items-center gap-0.5">
            <Activity size={10} />
            Score: <span className="text-text font-semibold ml-0.5">{score}</span>
          </span>
          {agingMed > 0 && (
            <span className="flex items-center gap-0.5">
              <Clock size={9} />{agingMed.toFixed(1)}d avg
            </span>
          )}
          {custoPorOs != null && (
            <span className="flex items-center gap-0.5 text-orange font-semibold">
              <DollarSign size={9} />R$ {custoPorOs.toLocaleString('pt-BR')}/OS
            </span>
          )}
        </div>
        <ChevronRight size={13} className="text-muted group-hover:text-primary transition-colors" />
      </div>
    </div>
  )
}

// ─── TeamDrawer ───────────────────────────────────────────────────────────────

export function TeamDrawer({ team, metrics, slaData, teamRows, custoMensal = 0, onCustoChange, indisponivel = false, onToggleDisponivel, onClose }: {
  team: Team; metrics: Metrics; slaData: SlaEntry | undefined; teamRows: OSRow[]
  custoMensal?: number; onCustoChange?: (v: number) => void
  indisponivel?: boolean; onToggleDisponivel?: () => void; onClose: () => void
}) {
  const isGestor = useIsGestor()
  const weekSchedule = useMemo(() => {
    if (!team) return []
    const ws = getWeekStart(new Date())
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws)
      d.setDate(ws.getDate() + i)
      const key = toKey(d)
      const dayRows = teamRows.filter(r => {
        const date = parseLocalDate(r.dataagendamento)
        return date && toKey(date) === key
      })
      return {
        day: d, key,
        count: dayRows.length,
        manha: dayRows.filter(r => (r.periodo || '').toLowerCase().includes('manh')).length,
        tarde: dayRows.filter(r => (r.periodo || '').toLowerCase().includes('tarde')).length,
      }
    })
  }, [team, teamRows])

  if (!team) return null
  const cfg      = TIPO[team.tipo]
  const Icon     = cfg.Icon
  const queue    = metrics.queue ?? 0
  const criticas = metrics.criticas ?? 0
  const sla      = slaData?.sla ?? 0
  const agingMed = slaData?.agingMed ?? 0
  const pct      = Math.min((queue / cfg.maxQueue) * 100, 100)
  const todayKey = toKey(new Date())

  return (
    <div className="fixed inset-0 z-[300] flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-elevated border-l border-white/[0.08]
                      flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-right-4 duration-200">

        <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.iconBg}`}>
              <Icon size={18} className={cfg.iconCls} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">{team.code}</h2>
              <p className="text-[12px] text-secondary">{team.leader}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar"
            className="w-8 h-8 rounded-lg flex items-center justify-center
                       text-muted hover:text-text hover:bg-surface transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <span className={`text-[11px] font-semibold px-3 py-1 rounded-full inline-block ${cfg.badge}`}>
            Equipe de {cfg.label}
          </span>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'OS na Fila',  value: queue,    DIcon: Activity,       cls: 'text-primary' },
              { label: 'SLA',         value: sla > 0 ? `${sla.toFixed(0)}%` : '—', DIcon: CheckCircle2, cls: slaCls(sla) },
              { label: 'Críticas',    value: criticas, DIcon: AlertTriangle,  cls: criticas > 0 ? 'text-red' : 'text-secondary' },
              { label: 'Aging Médio', value: agingMed > 0 ? `${agingMed.toFixed(1)}d` : '—', DIcon: Clock, cls: agingMed > 5 ? 'text-orange' : 'text-secondary' },
            ].map(item => {
              const DI = item.DIcon
              return (
                <div key={item.label} className="bg-surface/30 border border-white/[0.08] rounded-xl px-4 py-3">
                  <DI size={14} className={`${item.cls} mb-1.5`} />
                  <p className={`text-xl font-headline font-bold ${item.cls}`}>{item.value}</p>
                  <p className="text-[11px] text-muted mt-0.5">{item.label}</p>
                </div>
              )
            })}
          </div>

          <div className="bg-surface/30 border border-white/[0.08] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-text">Capacidade Operacional</p>
              <span className={`text-[11px] font-bold ${pct > 85 ? 'text-red' : pct > 60 ? 'text-orange' : 'text-green'}`}>
                {Math.round(pct)}%
              </span>
            </div>
            <div className="h-2 bg-surface/40 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${capacityBarCls(pct, team.tipo)}`}
                   style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[10px] text-muted mt-1.5">{queue} de {cfg.maxQueue} slots utilizados</p>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
              Membros
              <span className="text-[10px] normal-case font-normal bg-surface/40 px-1.5 py-0.5 rounded-full">
                {(team.members?.length ?? 0) + 1}
              </span>
            </p>
            <div className="bg-surface/30 border border-white/[0.08] rounded-xl divide-y divide-white/[0.04]">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${cfg.iconBg} ${cfg.iconCls}`}>
                  {team.leader[0]}
                </div>
                <span className="text-[12px] text-text font-medium capitalize">{team.leader.charAt(0) + team.leader.slice(1).toLowerCase()}</span>
                <span className="ml-auto text-[9px] bg-primary/15 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full font-semibold">
                  Líder
                </span>
              </div>
              {(team.members || []).map(name => (
                <div key={name} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-full bg-surface border border-white/[0.08] flex items-center justify-center text-[10px] font-bold text-secondary flex-shrink-0">
                    {name[0]}
                  </div>
                  <span className="text-[12px] text-text capitalize">{name.charAt(0) + name.slice(1).toLowerCase()}</span>
                  <span className="ml-auto text-[9px] bg-surface/40 text-muted border border-white/[0.08] px-1.5 py-0.5 rounded-full">
                    Técnico
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Agenda da Semana</p>
            <div className="grid grid-cols-7 gap-1">
              {weekSchedule.map(({ day, key, count, manha, tarde }) => {
                const isToday = key === todayKey
                const dayIdx  = (day.getDay() + 6) % 7
                return (
                  <div key={key}
                       className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg
                         ${isToday ? 'bg-primary/10 border border-primary/20' : 'bg-surface/30 border border-white/[0.05]'}`}>
                    <span className={`text-[8px] font-bold uppercase leading-none ${isToday ? 'text-primary' : 'text-muted'}`}>
                      {DAY_SHORT[dayIdx]}
                    </span>
                    <span className={`text-[13px] font-headline font-bold leading-none
                      ${isToday ? 'text-primary' : count > 0 ? 'text-text' : 'text-white/20'}`}>
                      {count > 0 ? count : '·'}
                    </span>
                    <div className="flex gap-0.5 h-1.5 items-center">
                      {manha > 0 && <div className="w-1.5 h-1.5 rounded-full bg-yellow" />}
                      {tarde > 0 && <div className="w-1.5 h-1.5 rounded-full bg-purple" />}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4 text-[9px] text-muted pt-0.5">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow inline-block flex-shrink-0" />Manhã
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple inline-block flex-shrink-0" />Tarde
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Informações</p>
            <div className="bg-surface/30 border border-white/[0.08] rounded-xl divide-y divide-white/[0.04]">
              {[
                { IIcon: Users,    label: 'Responsável',   value: team.leader.charAt(0) + team.leader.slice(1).toLowerCase() },
                { IIcon: Package,  label: 'Especialidade', value: cfg.label },
                { IIcon: Activity, label: 'Status',        value: statusDot(pct).label },
              ].map(item => {
                const II = item.IIcon
                return (
                  <div key={item.label} className="flex items-center gap-3 px-4 py-3">
                    <II size={13} className="text-muted flex-shrink-0" />
                    <span className="text-[11px] text-secondary">{item.label}</span>
                    <span className="ml-auto text-[11px] font-medium text-text">{item.value}</span>
                  </div>
                )
              })}
              <div className="flex items-center gap-3 px-4 py-3">
                <Activity size={13} className={`flex-shrink-0 ${indisponivel ? 'text-muted/40' : 'text-muted'}`} />
                <span className="text-[11px] text-secondary flex-1">Disponibilidade</span>
                <button
                  onClick={isGestor ? onToggleDisponivel : undefined}
                  disabled={!isGestor}
                  className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed
                    ${indisponivel ? 'bg-surface/30 border-white/[0.08] text-muted' : 'bg-green/10 border-green/30 text-green'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${indisponivel ? 'bg-surface/200' : 'bg-green'}`} />
                  {indisponivel ? 'Indisponível' : 'Disponível'}
                </button>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <DollarSign size={13} className="text-muted flex-shrink-0" />
                <span className="text-[11px] text-secondary">Custo mensal (R$)</span>
                <div className="ml-auto flex items-center gap-2">
                  <input
                    type="number" min={0} step={500}
                    value={custoMensal || ''}
                    onChange={e => isGestor && onCustoChange?.(Number(e.target.value))}
                    disabled={!isGestor}
                    placeholder="0"
                    className="w-28 bg-surface border border-white/[0.08] rounded-md px-2 py-1
                               text-[11px] font-mono text-text text-right outline-none
                               focus:border-primary/50 transition-colors disabled:opacity-40"
                  />
                  {custoMensal > 0 && (metrics.concluidas ?? 0) > 0 && (
                    <span className="text-[10px] text-orange font-semibold whitespace-nowrap">
                      R$ {Math.round(custoMensal / metrics.concluidas).toLocaleString('pt-BR')}/OS
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
