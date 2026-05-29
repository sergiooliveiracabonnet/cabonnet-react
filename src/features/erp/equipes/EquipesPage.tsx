// @ts-nocheck
import { useMemo, useState } from 'react'
import {
  Package, Wrench, Network, Users, BarChart2, TrendingUp,
  Clock, AlertTriangle, Star, ChevronRight, Search,
  Activity, CheckCircle2, Phone, MapPin, X, DollarSign,
} from 'lucide-react'
import { useERPRows } from '../useERPRows'
import { shortEquipe } from '../../../lib/osFormat'
import { TEAMS } from '../erpConstants'
import { useERPStore } from '../../../store/erpStore'
import { useIsGestor } from '../../../hooks/useRole'

/* ── Date helpers ────────────────────────────────────────────────────── */
const DAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function getWeekStart(date) {
  const d = new Date(date)
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

function parseLocalDate(raw) {
  if (!raw) return null
  const s = raw.trim().split(/[ T]/)[0]
  try {
    if (s.includes('/')) { const [d,m,y] = s.split('/'); return new Date(+y,+m-1,+d) }
    if (s.includes('-')) { const [y,m,d] = s.split('-'); return new Date(+y,+m-1,+d) }
  } catch { /* ignore */ }
  return null
}

/* ── Team Catalog ─────────────────────────────────────────────────────── */
/* ── Tipo config ──────────────────────────────────────────────────────── */
const TIPO = {
  INSTALACAO: {
    label: 'Instalação', Icon: Package,
    iconCls: 'text-blue-400', iconBg: 'bg-blue-500/10 border border-blue-500/20',
    badge: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
    bar: 'bg-blue-500', maxQueue: 18,
  },
  MANUTENCAO: {
    label: 'Manutenção', Icon: Wrench,
    iconCls: 'text-orange-400', iconBg: 'bg-orange-500/10 border border-orange-500/20',
    badge: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
    bar: 'bg-orange-500', maxQueue: 12,
  },
  REDE: {
    label: 'Rede', Icon: Network,
    iconCls: 'text-emerald-400', iconBg: 'bg-emerald-500/10 border border-emerald-500/20',
    badge: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
    bar: 'bg-emerald-500', maxQueue: 10,
  },
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
function slaCls(v) {
  if (v >= 90) return 'text-emerald-400'
  if (v >= 75) return 'text-orange-400'
  return 'text-red-400'
}

function capacityBarCls(pct, tipo) {
  if (pct > 85) return 'bg-red-500'
  if (pct > 60) return 'bg-orange-500'
  return TIPO[tipo]?.bar || 'bg-primary'
}

function statusDot(pct) {
  if (pct > 85) return { cls: 'bg-red-500', label: 'Sobrecarregada' }
  if (pct > 60) return { cls: 'bg-orange-400', label: 'Carregada' }
  if (pct > 0)  return { cls: 'bg-emerald-400', label: 'Disponível' }
  return { cls: 'bg-surface/200', label: 'Sem OS' }
}

/* ── EquipeCard ──────────────────────────────────────────────────────── */
function EquipeCard({ team, metrics, slaData, custoMensal = 0, indisponivel = false, onClick }) {
  const cfg = TIPO[team.tipo]
  const Icon = cfg.Icon
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

  // Simple score: SLA × 0.6 + (1 − pct/100) × 40
  const score = Math.round(sla * 0.6 + (1 - pct / 100) * 40)

  return (
    <div
      onClick={() => onClick(team)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick(team)}
      className="group bg-elevated border border-white/[0.08] rounded-xl p-4 cursor-pointer
                 hover:border-muted/40 hover:shadow-xl hover:shadow-black/30
                 transition-all duration-200 flex flex-col gap-3.5 outline-none
                 focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {/* Header */}
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
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
              {cfg.label}
            </span>
          )}
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${indisponivel ? 'bg-surface/200' : status.cls}`} />
            <span className="text-[9px] text-muted">{indisponivel ? 'Fora de serviço' : status.label}</span>
          </div>
        </div>
      </div>

      {/* Metrics */}
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
          <p className={`text-[18px] font-headline font-bold leading-none ${criticas > 0 ? 'text-red-400' : 'text-text'}`}>
            {criticas}
          </p>
          <p className="text-[9px] text-muted mt-0.5">Críticas</p>
        </div>
      </div>

      {/* Capacity bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted">Capacidade</span>
          <span className={`text-[10px] font-semibold ${pct > 85 ? 'text-red-400' : pct > 60 ? 'text-orange-400' : 'text-emerald-400'}`}>
            {Math.round(pct)}%
          </span>
        </div>
        <div className="h-1.5 bg-surface/40 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${barCls}`}
               style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[9px] text-muted mt-1">{queue} / {cfg.maxQueue} slots</p>
      </div>

      {/* Footer */}
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
            <span className="flex items-center gap-0.5 text-orange-400 font-semibold">
              <DollarSign size={9} />R$ {custoPorOs.toLocaleString('pt-BR')}/OS
            </span>
          )}
        </div>
        <ChevronRight size={13} className="text-muted group-hover:text-primary transition-colors" />
      </div>
    </div>
  )
}

/* ── Team Detail Drawer ───────────────────────────────────────────────── */
function TeamDrawer({ team, metrics, slaData, teamRows, custoMensal = 0, onCustoChange, indisponivel = false, onToggleDisponivel, onClose }) {
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
        day: d,
        key,
        count: dayRows.length,
        manha: dayRows.filter(r => (r.periodo || '').toLowerCase().includes('manh')).length,
        tarde: dayRows.filter(r => (r.periodo || '').toLowerCase().includes('tarde')).length,
      }
    })
  }, [teamRows])

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
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-md bg-elevated border-l border-white/[0.08]
                      flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-right-4 duration-200">

        {/* Header */}
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
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 rounded-lg flex items-center justify-center
                       text-muted hover:text-text hover:bg-surface transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Tipo badge */}
          <span className={`text-[11px] font-semibold px-3 py-1 rounded-full inline-block ${cfg.badge}`}>
            Equipe de {cfg.label}
          </span>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'OS na Fila',  value: queue,    DIcon: Activity,       cls: 'text-primary' },
              { label: 'SLA',         value: sla > 0 ? `${sla.toFixed(0)}%` : '—', DIcon: CheckCircle2, cls: slaCls(sla) },
              { label: 'Críticas',    value: criticas, DIcon: AlertTriangle,  cls: criticas > 0 ? 'text-red-400' : 'text-secondary' },
              { label: 'Aging Médio', value: agingMed > 0 ? `${agingMed.toFixed(1)}d` : '—', DIcon: Clock, cls: agingMed > 5 ? 'text-orange-400' : 'text-secondary' },
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

          {/* Capacity */}
          <div className="bg-surface/30 border border-white/[0.08] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-text">Capacidade Operacional</p>
              <span className={`text-[11px] font-bold ${pct > 85 ? 'text-red-400' : pct > 60 ? 'text-orange-400' : 'text-emerald-400'}`}>
                {Math.round(pct)}%
              </span>
            </div>
            <div className="h-2 bg-surface/40 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${capacityBarCls(pct, team.tipo)}`}
                   style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[10px] text-muted mt-1.5">{queue} de {cfg.maxQueue} slots utilizados</p>
          </div>

          {/* Membros */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
              Membros
              <span className="text-[10px] normal-case font-normal bg-surface/40 px-1.5 py-0.5 rounded-full">
                {(team.members?.length ?? 0) + 1}
              </span>
            </p>
            <div className="bg-surface/30 border border-white/[0.08] rounded-xl divide-y divide-white/[0.06]/50">
              {/* Líder */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${cfg.iconBg} ${cfg.iconCls}`}>
                  {team.leader[0]}
                </div>
                <span className="text-[12px] text-text font-medium capitalize">{team.leader.charAt(0) + team.leader.slice(1).toLowerCase()}</span>
                <span className="ml-auto text-[9px] bg-primary/15 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full font-semibold">
                  Líder
                </span>
              </div>
              {/* Técnicos */}
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

          {/* Agenda da semana */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Agenda da Semana</p>
            <div className="grid grid-cols-7 gap-1">
              {weekSchedule.map(({ day, key, count, manha, tarde }) => {
                const isToday = key === todayKey
                const dayIdx  = (day.getDay() + 6) % 7
                return (
                  <div key={key}
                       className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg
                         ${isToday
                           ? 'bg-primary/10 border border-primary/20'
                           : 'bg-surface/30 border border-white/[0.05]'}`}>
                    <span className={`text-[8px] font-bold uppercase leading-none
                                      ${isToday ? 'text-primary' : 'text-muted'}`}>
                      {DAY_SHORT[dayIdx]}
                    </span>
                    <span className={`text-[13px] font-headline font-bold leading-none
                      ${isToday ? 'text-primary' : count > 0 ? 'text-text' : 'text-white/20'}`}>
                      {count > 0 ? count : '·'}
                    </span>
                    <div className="flex gap-0.5 h-1.5 items-center">
                      {manha > 0 && <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                      {tarde > 0 && <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4 text-[9px] text-muted pt-0.5">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block flex-shrink-0" />
                Manhã
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block flex-shrink-0" />
                Tarde
              </span>
            </div>
          </div>

          {/* Informações */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Informações</p>
            <div className="bg-surface/30 border border-white/[0.08] rounded-xl divide-y divide-white/[0.06]/50">
              {[
                { IIcon: Users,    label: 'Responsável',  value: team.leader.charAt(0) + team.leader.slice(1).toLowerCase() },
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
              {/* Disponibilidade */}
              <div className="flex items-center gap-3 px-4 py-3">
                <Activity size={13} className={`flex-shrink-0 ${indisponivel ? 'text-muted/40' : 'text-muted'}`} />
                <span className="text-[11px] text-secondary flex-1">Disponibilidade</span>
                <button
                  onClick={isGestor ? onToggleDisponivel : undefined}
                  disabled={!isGestor}
                  className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed
                    ${indisponivel
                      ? 'bg-surface/30 border-border text-muted'
                      : 'bg-green/10 border-green/30 text-green'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${indisponivel ? 'bg-surface/200' : 'bg-green'}`} />
                  {indisponivel ? 'Indisponível' : 'Disponível'}
                </button>
              </div>

              {/* Custo mensal */}
              <div className="flex items-center gap-3 px-4 py-3">
                <DollarSign size={13} className="text-muted flex-shrink-0" />
                <span className="text-[11px] text-secondary">Custo mensal (R$)</span>
                <div className="ml-auto flex items-center gap-2">
                  <input
                    type="number" min={0} step={500}
                    value={custoMensal || ''}
                    onChange={e => isGestor && onCustoChange?.(e.target.value)}
                    disabled={!isGestor}
                    placeholder="0"
                    className="w-28 bg-surface border border-white/[0.08] rounded-md px-2 py-1
                               text-[11px] font-mono text-text text-right outline-none
                               focus:border-primary/50 transition-colors disabled:opacity-40"
                  />
                  {custoMensal > 0 && (metrics.concluidas ?? 0) > 0 && (
                    <span className="text-[10px] text-orange-400 font-semibold whitespace-nowrap">
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

/* ── EquipesPage ─────────────────────────────────────────────────────── */
export default function EquipesPage() {
  const { rows, allRows, derived, isLoading } = useERPRows()
  const { custoEquipe, setCustoEquipe, equipeIndisponivel, toggleEquipeDisponivel } = useERPStore()
  const [search, setSearch]     = useState('')
  const [tipoFilter, setTipo]   = useState('')
  const [selected, setSelected] = useState(null)

  const teamRows = useMemo(() => {
    if (!selected) return []
    return rows.filter(r => {
      const code = shortEquipe(r.nomedaequipe || '').split(' - ')[0].trim()
      return code === selected.code
    })
  }, [rows, selected])

  const semaforo = useMemo(() => derived?.sla?.semaforo ?? [], [derived])

  // Normalize semaforo → map by team code
  const slaByCode = useMemo(() => {
    const map = {}
    semaforo.forEach(s => {
      const code = shortEquipe(s.nome).split(' - ')[0].trim()
      map[code] = s
    })
    return map
  }, [semaforo])

  // leaderByCode: extrai o nome do líder do shortEquipe (que agora lê do banco)
  // usa a OS mais recente por equipe (_agingAbertura menor = mais nova)
  const leaderByCode = useMemo(() => {
    const leaders = {}
    const ages    = {}
    allRows.forEach(row => {
      if (!row.nomedaequipe) return
      const full  = shortEquipe(row.nomedaequipe)        // ex: "INST F12 - CARLOS"
      const parts = full.split(' - ')
      if (parts.length < 2) return
      const code   = parts[0].trim()
      const leader = parts[1].trim()
      if (!leader) return
      const age = row._agingAbertura ?? Infinity
      if (!(code in ages) || age < ages[code]) {
        leaders[code] = leader
        ages[code]    = age
      }
    })
    return leaders
  }, [allRows])

  // metricsByCode: derivado de rows (filtrado) para refletir o período selecionado
  const metricsByCode = useMemo(() => {
    const metrics = {}
    rows.forEach(row => {
      if (!row.nomedaequipe) return
      const code = shortEquipe(row.nomedaequipe).split(' - ')[0].trim()
      if (!metrics[code]) metrics[code] = { queue: 0, criticas: 0, concluidas: 0 }
      metrics[code].queue++
      if (row._slaCritico) metrics[code].criticas++
      if (row.descsituacao === 'Concluída') metrics[code].concluidas++
    })
    return metrics
  }, [rows])

  // Merge TEAMS catalog with any team found in live data not yet catalogued
  const allTeams = useMemo(() => {
    const catalogCodes = new Set(TEAMS.map(t => t.code))
    const extra = []
    Object.keys(metricsByCode).forEach(code => {
      if (catalogCodes.has(code)) return
      if (!code || code === '—' || code === 'INST' || code === 'MANUT' || code === 'REDE' || code === 'COPE') return
      const u = code.toUpperCase()
      const tipo = u.startsWith('REDE') ? 'REDE' : u.startsWith('MANUT') ? 'MANUTENCAO' : 'INSTALACAO'
      extra.push({ code, leader: leaderByCode[code] ?? 'A definir', tipo, members: [] })
    })
    // Banco de dados sempre tem precedência sobre o catálogo estático
    const merged = TEAMS.map(t => ({
      ...t,
      leader: leaderByCode[t.code] ?? t.leader,
    }))
    return [...merged, ...extra]
  }, [metricsByCode, leaderByCode])

  const filtered = useMemo(() => allTeams.filter(t => {
    if (tipoFilter && t.tipo !== tipoFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return t.code.toLowerCase().includes(q) || t.leader.toLowerCase().includes(q)
    }
    return true
  }), [search, tipoFilter])

  // Summary
  const summary = useMemo(() => {
    const avgSla = semaforo.length > 0
      ? semaforo.reduce((s, r) => s + (r.sla || 0), 0) / semaforo.length
      : 0
    return {
      inst:  allTeams.filter(t => t.tipo === 'INSTALACAO').length,
      manut: allTeams.filter(t => t.tipo === 'MANUTENCAO').length,
      rede:  allTeams.filter(t => t.tipo === 'REDE').length,
      total: allTeams.length,
      avgSla,
    }
  }, [semaforo, allTeams])

  return (
    <div className="flex flex-col gap-5 p-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-headline font-bold text-text">Gestão de Equipes</h1>
          <p className="text-[12px] text-secondary mt-0.5">{summary.total} equipes ativas · ERP</p>
        </div>
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Instalação', value: summary.inst,  SIcon: Package,    iconCls: 'text-blue-400',    bgCls: 'bg-blue-500/10' },
          { label: 'Manutenção', value: summary.manut, SIcon: Wrench,     iconCls: 'text-orange-400',  bgCls: 'bg-orange-500/10' },
          { label: 'Rede',       value: summary.rede,  SIcon: Network,    iconCls: 'text-emerald-400', bgCls: 'bg-emerald-500/10' },
          { label: 'OS na Fila', value: rows.length,   SIcon: BarChart2,  iconCls: 'text-violet-400',  bgCls: 'bg-violet-500/10' },
          { label: 'SLA Médio',  value: `${summary.avgSla.toFixed(0)}%`, SIcon: TrendingUp, iconCls: 'text-primary', bgCls: 'bg-primary/10' },
        ].map(s => {
          const SI = s.SIcon
          return (
            <div key={s.label}
                 className="bg-elevated border border-white/[0.08] rounded-xl px-4 py-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg ${s.bgCls} flex items-center justify-center flex-shrink-0`}>
                <SI size={14} className={s.iconCls} />
              </div>
              <div>
                <p className="text-lg font-headline font-bold text-text leading-none">{s.value}</p>
                <p className="text-[10px] text-secondary">{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar equipe ou técnico…"
            className="pl-8 pr-3 py-2 text-[12px] bg-elevated border border-white/[0.08] rounded-lg w-64
                       text-text placeholder:text-muted focus:outline-none focus:border-primary/40"
          />
        </div>

        <div className="flex gap-1 bg-elevated border border-white/[0.08] rounded-lg p-0.5">
          {[
            { value: '',           label: 'Todas' },
            { value: 'INSTALACAO', label: 'Instalação' },
            { value: 'MANUTENCAO', label: 'Manutenção' },
            { value: 'REDE',       label: 'Rede' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setTipo(opt.value)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150
                          ${tipoFilter === opt.value
                            ? 'bg-primary/20 text-primary'
                            : 'text-secondary hover:text-text hover:bg-surface/40'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[11px] text-muted">
          {filtered.length} equipe{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Team grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-secondary text-sm">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Carregando…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(team => (
            <EquipeCard
              key={team.code}
              team={team}
              metrics={metricsByCode[team.code] ?? { queue: 0, criticas: 0, concluidas: 0 }}
              slaData={slaByCode[team.code]}
              custoMensal={custoEquipe[team.code] ?? 0}
              indisponivel={!!equipeIndisponivel[team.code]}
              onClick={setSelected}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full py-20 text-center text-muted text-sm">
              Nenhuma equipe encontrada
            </div>
          )}
        </div>
      )}

      {/* Team detail drawer */}
      {selected && (
        <TeamDrawer
          team={selected}
          teamRows={teamRows}
          metrics={metricsByCode[selected.code] ?? { queue: 0, criticas: 0, concluidas: 0 }}
          slaData={slaByCode[selected.code]}
          custoMensal={custoEquipe[selected.code] ?? 0}
          onCustoChange={(v) => setCustoEquipe(selected.code, v)}
          indisponivel={!!equipeIndisponivel[selected.code]}
          onToggleDisponivel={() => toggleEquipeDisponivel(selected.code)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
