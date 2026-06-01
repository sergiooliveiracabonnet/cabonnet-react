import { useMemo, useState, type ComponentType } from 'react'
import {
  AlertTriangle, Clock, Users, TrendingDown,
  CalendarX, ChevronDown, Settings, X,
  ShieldAlert, ShieldCheck, Info, Zap, BarChart2, Bell,
  Activity, RefreshCw, MapPin, BarChart3,
} from 'lucide-react'
import type { FiredAlert } from '../../../hooks/useAlerts'
import type { OSRow } from '../../../lib/types'

// ─── Tipos locais ─────────────────────────────────────────────────────────────
type IconComp  = ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>
type SevKey    = keyof typeof SEV_CFG
interface AlertItem  { key: string; label: string; sub: string }
interface AlertEntry {
  id: string; severity: SevKey; Icon: IconComp
  title: string; desc: string; count: number; items: AlertItem[]
}
interface AlertSettings {
  agingCriticoDias: number; capacidadePct: number
  slaEquipePct:     number; semAgendDias:  number
}
import { useERPRows }          from '../useERPRows'
import { useERPStore }         from '../../../store/erpStore'
import { useAlertStore }       from '../../../store/alertStore'
import { useIsGestor }        from '../../../hooks/useRole'
import { useAlerts }           from '../../../hooks/useAlerts'
import { useGrafanaOS }        from '../../../hooks/useGrafanaOS'
import { TEAMS }               from '../erpConstants'
import { shortEquipe }         from '../../../lib/osFormat'

// ─── Config ──────────────────────────────────────────────────────────────────

const TIPO_MAX = { INSTALACAO: 18, MANUTENCAO: 12, REDE: 10 }

const SEV_CFG = {
  CRITICO: {
    label: 'Crítico',
    color: '#f87171',
    glow:  'rgba(248,113,113,0.18)',
    bg:    'rgba(248,113,113,0.07)',
    dot:   '#f87171',
  },
  ALTO: {
    label: 'Alto',
    color: '#f97316',
    glow:  'rgba(249,115,22,0.18)',
    bg:    'rgba(249,115,22,0.07)',
    dot:   '#f97316',
  },
  MEDIO: {
    label: 'Médio',
    color: '#facc15',
    glow:  'rgba(250,204,21,0.18)',
    bg:    'rgba(250,204,21,0.07)',
    dot:   '#facc15',
  },
}

// ─── Alert engine ─────────────────────────────────────────────────────────────

function buildAlerts(
  rows:          OSRow[],
  settings:      AlertSettings,
  metricsByCode: Record<string, { queue: number; criticas: number }>,
  slaByCode:     Record<string, { sla?: number; nome?: string }>,
): AlertEntry[] {
  const { agingCriticoDias, capacidadePct, slaEquipePct, semAgendDias } = settings

  const slaSemEquipe    = rows.filter(r => r._slaCritico && !r.nomedaequipe?.trim())
  const agingExtremo    = rows.filter(r => (r._aging ?? 0) > agingCriticoDias)
  const sobrecarregadas = TEAMS.filter(t => {
    const m   = metricsByCode[t.code] || { queue: 0 }
    const max = TIPO_MAX[t.tipo] ?? 15
    return (m.queue / max) * 100 > capacidadePct
  })
  const slaBaixo = TEAMS.filter(t => {
    const sla = slaByCode[t.code]?.sla ?? 0
    return sla > 0 && sla < slaEquipePct
  })
  const semAgend = rows.filter(r => r._slaSemAgend && (r._aging ?? 0) > semAgendDias)

  return ([
    {
      id: 'sla_sem_equipe', severity: 'CRITICO' as SevKey, Icon: ShieldAlert,
      title: 'SLA Crítico Sem Equipe',
      desc:  `${slaSemEquipe.length} OS com SLA crítico aguardando atribuição de equipe`,
      count: slaSemEquipe.length,
      items: slaSemEquipe.map(r => ({
        key: r.numos,
        label: `#${r.numos} · ${r.nomecliente || '—'}`,
        sub:   `${r._aging ?? 0}d · ${r.nomedacidade || '—'}`,
      })),
    },
    {
      id: 'aging_extremo', severity: 'CRITICO', Icon: Clock,
      title: `Aging Extremo › ${agingCriticoDias} dias`,
      desc:  `${agingExtremo.length} OS com tempo excessivo na fila`,
      count: agingExtremo.length,
      items: agingExtremo.map(r => ({
        key: r.numos,
        label: `#${r.numos} · ${r.nomecliente || '—'}`,
        sub:   `${r._aging ?? 0}d · ${shortEquipe(r.nomedaequipe || 'Sem equipe').split(' - ')[0]}`,
      })),
    },
    {
      id: 'sobrecarga', severity: 'ALTO', Icon: Users,
      title: `Equipes Sobrecarregadas › ${capacidadePct}%`,
      desc:  `${sobrecarregadas.length} equipes acima da capacidade operacional`,
      count: sobrecarregadas.length,
      items: sobrecarregadas.map(t => {
        const m   = metricsByCode[t.code] || { queue: 0 }
        const max = TIPO_MAX[t.tipo] ?? 15
        const pct = Math.round((m.queue / max) * 100)
        return { key: t.code, label: `${t.code} · ${t.leader}`, sub: `${m.queue}/${max} slots · ${pct}%` }
      }),
    },
    {
      id: 'sla_equipe', severity: 'ALTO', Icon: TrendingDown,
      title: `SLA de Equipe Abaixo de ${slaEquipePct}%`,
      desc:  `${slaBaixo.length} equipes com desempenho abaixo da meta`,
      count: slaBaixo.length,
      items: slaBaixo.map(t => {
        const sla = slaByCode[t.code]?.sla ?? 0
        return { key: t.code, label: `${t.code} · ${t.leader}`, sub: `SLA atual: ${sla.toFixed(1)}%` }
      }),
    },
    {
      id: 'sem_agendamento', severity: 'MEDIO', Icon: CalendarX,
      title: `Sem Agendamento › ${semAgendDias} dias`,
      desc:  `${semAgend.length} OS abertas sem data de atendimento definida`,
      count: semAgend.length,
      items: semAgend.map(r => ({
        key: r.numos,
        label: `#${r.numos} · ${r.nomecliente || '—'}`,
        sub:   `${r._aging ?? 0}d · ${r.nomedacidade || '—'}`,
      })),
    },
  ] as AlertEntry[]).filter(a => a.count > 0)
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ icon: Icon, color, children }: { icon: IconComp; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} style={{ color }} className="flex-shrink-0" />
      <span className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color }}>
        {children}
      </span>
    </div>
  )
}

// ─── AlertCard ────────────────────────────────────────────────────────────────

const PREVIEW = 5

function AlertCard({ alert, delay = 0 }: { alert: AlertEntry; delay?: number }) {
  const [open, setOpen] = useState(false)
  const sev       = (SEV_CFG as Record<string, typeof SEV_CFG[SevKey]>)[alert.severity]
  const AlertIcon = alert.Icon
  const extra     = alert.items.length - PREVIEW

  return (
    <div
      className="relative overflow-hidden rounded-2xl border animate-card-enter"
      style={{
        borderColor: `${sev.color}28`,
        animationDelay: `${delay}ms`,
      }}
    >
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px]"
           style={{ background: `linear-gradient(90deg, ${sev.color}, ${sev.color}60, transparent)` }} />

      {/* Background glow */}
      <div className="absolute -top-12 -left-8 w-36 h-36 rounded-full blur-3xl pointer-events-none"
           style={{ background: sev.glow }} />

      <button
        className="relative w-full flex items-center gap-4 p-5 text-left hover:bg-surface/20 transition-colors"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        {/* Icon */}
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
             style={{ background: sev.bg, border: `1px solid ${sev.color}30` }}>
          <AlertIcon size={20} style={{ color: sev.color }} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-[13.5px] font-semibold text-text">{alert.title}</p>
            <span className="text-[9px] font-bold uppercase tracking-[0.05em] px-2 py-0.5 rounded-full border flex-shrink-0"
                  style={{ background: sev.bg, borderColor: `${sev.color}40`, color: sev.color }}>
              {sev.label}
            </span>
          </div>
          <p className="text-[11.5px] text-secondary">{alert.desc}</p>
        </div>

        {/* Count + chevron */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="font-mono font-black tabular-nums text-[40px] leading-none"
                style={{ color: sev.color }}>
            {alert.count}
          </span>
          <ChevronDown size={14} className="text-muted transition-transform duration-200"
                       style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </div>
      </button>

      {/* Items */}
      {open && (
        <div className="border-t" style={{ borderColor: `${sev.color}15` }}>
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
            {alert.items.slice(0, PREVIEW).map((item: AlertItem) => (
              <div key={item.key} className="flex items-center gap-3 px-5 py-3 hover:bg-surface/20 transition-colors">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                     style={{ background: sev.dot, boxShadow: `0 0 5px ${sev.dot}80` }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-text truncate">{item.label}</p>
                  <p className="text-[10px] text-muted mt-0.5">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
          {extra > 0 && (
            <p className="text-[11px] text-muted text-center py-3 border-t"
               style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              +{extra} item{extra > 1 ? 's' : ''} adicionais
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── RuleCard ─────────────────────────────────────────────────────────────────

const RULE_SEV_MAP: Record<string, SevKey>   = { critical: 'CRITICO', warning: 'ALTO', info: 'MEDIO' }
const RULE_ICONS: Record<string, IconComp>    = { criticas: ShieldAlert, taxa: BarChart2, semEquipe: Users, total: Zap }
const SEV_CFG_MAP = SEV_CFG as Record<string, typeof SEV_CFG[SevKey]>

function RuleCard({ rule, delay = 0 }: { rule: FiredAlert; delay?: number }) {
  const sevKey = RULE_SEV_MAP[rule.severity] ?? 'MEDIO'
  const sev    = SEV_CFG_MAP[sevKey]
  const RIcon  = RULE_ICONS[rule.metric] ?? Bell

  return (
    <div
      className="relative overflow-hidden rounded-2xl border animate-card-enter"
      style={{ borderColor: `${sev.color}22`, animationDelay: `${delay}ms` }}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px]"
           style={{ background: `linear-gradient(90deg, ${sev.color}80, transparent)` }} />

      <div className="relative flex items-center gap-4 p-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
             style={{ background: sev.bg, border: `1px solid ${sev.color}30` }}>
          <RIcon size={17} style={{ color: sev.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-semibold text-text">{rule.label}</p>
          <p className="text-[10.5px] text-secondary mt-0.5">{rule.desc}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-mono font-black tabular-nums text-[28px] leading-none"
             style={{ color: sev.color }}>
            {rule.currentValue}
          </p>
          <p className="text-[10px] text-muted mt-0.5">{rule.operator} {rule.threshold}</p>
        </div>
      </div>
    </div>
  )
}

// ─── GrafanaCityStrip ─────────────────────────────────────────────────────────

interface GrafanaCidade { cidade: string; pendentes?: number; fechados_7d?: number; aging_critico?: number }

function GrafanaCityStrip({ cidades, loading }: { cidades: GrafanaCidade[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-surface/30 border border-white/[0.08] animate-pulse" />
        ))}
      </div>
    )
  }
  if (!cidades.length) return null

  const max = Math.max(...cidades.map(c => c.pendentes ?? 0), 1)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {cidades.map((c: GrafanaCidade, i: number) => {
        const pct     = Math.round(((c.pendentes ?? 0) / max) * 100)
        const isCrit  = (c.aging_critico ?? 0) > 0
        const barClr  = isCrit ? '#f97316' : '#3b82f6'
        return (
          <div
            key={c.cidade}
            className="relative overflow-hidden rounded-xl border bg-card p-3 flex flex-col gap-1.5 animate-card-enter"
            style={{ borderColor: isCrit ? 'rgba(249,115,22,0.25)' : 'rgba(255,255,255,0.07)', animationDelay: `${i * 50}ms` }}
          >
            {isCrit && (
              <div className="absolute top-0 left-0 right-0 h-[2px]"
                   style={{ background: '#f97316' }} />
            )}
            <div className="flex items-center gap-1.5">
              <MapPin size={10} className="text-muted flex-shrink-0" />
              <p className="text-[10px] font-semibold text-secondary truncate">{c.cidade}</p>
            </div>
            <p className="font-mono font-black text-[28px] leading-none tabular-nums text-text">
              {c.pendentes ?? 0}
            </p>
            <div className="h-1.5 rounded-full bg-surface/40 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                   style={{ width: `${pct}%`, background: barClr, boxShadow: `0 0 6px ${barClr}60` }} />
            </div>
            <div className="flex justify-between text-[9.5px]">
              <span className="text-muted">{c.fechados_7d ?? 0} fechados/7d</span>
              {isCrit && (
                <span className="font-semibold" style={{ color: '#f97316' }}>
                  {c.aging_critico} aging
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── SettingsPanel ────────────────────────────────────────────────────────────

function SettingsPanel({ settings, onSave, onClose }: {
  settings: AlertSettings; onSave: (s: AlertSettings) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState(settings)
  const { slaLimits, updateSlaLimit, resetSlaLimits } = useAlertStore()
  const [slaD, setSlaD]   = useState({ ...slaLimits })
  const isGestor          = useIsGestor()

  const alertFields = [
    { key: 'agingCriticoDias', label: 'Aging crítico',        suffix: 'd', min: 7,  max: 60,  step: 1 },
    { key: 'capacidadePct',    label: 'Capacidade máxima',    suffix: '%', min: 50, max: 100, step: 5 },
    { key: 'slaEquipePct',     label: 'SLA mínimo de equipe', suffix: '%', min: 50, max: 95,  step: 5 },
    { key: 'semAgendDias',     label: 'Dias sem agendamento', suffix: 'd', min: 1,  max: 30,  step: 1 },
  ]

  const slaFields = [
    { key: 'INSTALACAO', label: 'Instalação'  },
    { key: 'MANUTENCAO', label: 'Manutenção'  },
    { key: 'SERVICO',    label: 'Serviços'    },
    { key: 'VT24H',      label: 'VT 24h'      },
    { key: 'VT48H',      label: 'VT 48h'      },
    { key: 'VT08H',      label: 'VT 8h'       },
  ]

  function handleSave() {
    onSave(draft)
    slaFields.forEach(f => updateSlaLimit(f.key as 'INSTALACAO' | 'MANUTENCAO' | 'SERVICO' | 'VT24H' | 'VT48H' | 'VT08H', (slaD as Record<string, number>)[f.key]))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xs bg-elevated border-l border-white/[0.08]
                      flex flex-col shadow-2xl animate-in slide-in-from-right-4 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
          <div>
            <h2 className="text-[14px] font-bold text-text">Configurar Alertas</h2>
            <p className="text-[10px] text-muted mt-0.5">Thresholds e limites de SLA</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center
                       text-muted hover:text-text hover:bg-surface transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* ── Thresholds de alertas ── */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-4">
              Thresholds do Motor de Alertas
            </p>
            <div className="space-y-5">
              {alertFields.map(f => (
                <div key={f.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] text-secondary font-medium">{f.label}</label>
                    <span className="text-[16px] font-bold text-primary tabular-nums font-mono">
                      {(draft as unknown as Record<string, number>)[f.key]}{f.suffix}
                    </span>
                  </div>
                  <input
                    type="range" min={f.min} max={f.max} step={f.step} value={(draft as unknown as Record<string, number>)[f.key]}
                    onChange={e => setDraft(d => ({ ...d, [f.key]: +e.target.value }))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted">
                    <span>{f.min}{f.suffix}</span>
                    <span>{f.max}{f.suffix}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Limites de SLA ── */}
          <div className="pt-2 border-t border-white/[0.08]">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                Limites de SLA por Tipo (dias)
              </p>
              <button
                onClick={() => { resetSlaLimits(); setSlaD({ INSTALACAO: 2, MANUTENCAO: 1, SERVICO: 2, VT24H: 1, VT48H: 2, VT08H: 1 }) }}
                className="text-[9px] text-muted hover:text-secondary transition-colors underline underline-offset-2"
              >
                Restaurar padrões
              </button>
            </div>
            <div className="space-y-3">
              {slaFields.map(f => (
                <div key={f.key} className="flex items-center justify-between gap-3">
                  <label className="text-[12px] text-secondary flex-1">{f.label}</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min={1} max={30} value={(slaD as Record<string, number>)[f.key] ?? 2}
                      onChange={e => setSlaD(d => ({ ...d, [f.key]: Number(e.target.value) }))}
                      className="w-14 bg-surface border border-white/[0.08] rounded-md px-2 py-1
                                 text-[12px] font-mono text-text text-center outline-none
                                 focus:border-primary/50 transition-colors"
                    />
                    <span className="text-[11px] text-muted">d</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted/50 mt-3">
              Afeta todos os cálculos de SLA do sistema em tempo real.
            </p>
          </div>

        </div>

        <div className="p-5 border-t border-white/[0.08] flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-[12px] text-secondary
                       hover:text-text hover:border-muted/40 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={!isGestor}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-[12px] font-semibold
                       hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={!isGestor ? 'Apenas gestores podem alterar configurações' : undefined}>
            {isGestor ? 'Salvar' : 'Sem permissão'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── AlertasPage ──────────────────────────────────────────────────────────────

export default function AlertasPage() {
  const { rows, allRows, isLoading, derived } = useERPRows()
  const { alertSettings, setAlertSettings }   = useERPStore()
  const [showSettings, setShowSettings]       = useState(false)
  const grafOS = useGrafanaOS()

  const semaforo = useMemo(() => derived?.sla?.semaforo ?? [], [derived])

  const slaByCode = useMemo(() => {
    const map: Record<string, { sla?: number; nome?: string }> = {}
    semaforo.forEach(s => {
      const code = shortEquipe((s as { nome?: string }).nome ?? '').split(' - ')[0].trim()
      map[code] = s as { sla?: number; nome?: string }
    })
    return map
  }, [semaforo])

  const metricsByCode = useMemo(() => {
    const map: Record<string, { queue: number; criticas: number }> = {}
    rows.forEach(row => {
      if (!row.nomedaequipe) return
      const code = shortEquipe(row.nomedaequipe).split(' - ')[0].trim()
      if (!map[code]) map[code] = { queue: 0, criticas: 0 }
      map[code].queue++
      if (row._slaCritico) map[code].criticas++
    })
    return map
  }, [rows])

  const alerts     = useMemo(
    () => isLoading ? [] : buildAlerts(rows, alertSettings, metricsByCode, slaByCode),
    [rows, alertSettings, metricsByCode, slaByCode, isLoading]
  )
  const ruleAlerts = useAlerts(rows, allRows)

  const counts = useMemo(() => ({
    CRITICO: alerts.filter(a => a.severity === 'CRITICO').reduce((s, a) => s + a.count, 0),
    ALTO:    alerts.filter(a => a.severity === 'ALTO').reduce((s, a)    => s + a.count, 0),
    MEDIO:   alerts.filter(a => a.severity === 'MEDIO').reduce((s, a)   => s + a.count, 0),
  }), [alerts])

  const totalAlerts = alerts.length + ruleAlerts.length
  const pulso       = derived?.dashboard?.pulso
  const totalFila   = useMemo(
    () => rows.filter(r => r._situacaoEfetiva !== 'Concluída').length,
    [rows]
  )

  const hasAny = totalAlerts > 0

  return (
    <div className="space-y-4 max-w-[1600px]">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[20px] font-headline font-bold text-text">
              Notificações &amp; Alertas
            </h1>
            {hasAny ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ background: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.35)', color: '#f87171' }}>
                {totalAlerts} ativo{totalAlerts > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ background: 'rgba(74,222,128,0.10)', borderColor: 'rgba(74,222,128,0.30)', color: '#4ade80' }}>
                OK
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[12px] text-secondary">Motor de regras em tempo real · ERP</p>
            {!isLoading && (
              <span className="flex items-center gap-1.5 text-[10px] text-muted">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green" />
                </span>
                Ao vivo
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1.5 text-[11px] text-secondary hover:text-text
                     px-3 py-1.5 rounded-xl border border-white/[0.08] hover:border-muted/40
                     hover:bg-surface/30 transition-all duration-150 flex-shrink-0"
        >
          <Settings size={13} /> Configurar
        </button>
      </div>

      {/* ── Severity Bento ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { sev: 'CRITICO', Icon: ShieldAlert,  desc: 'situações críticas'  },
          { sev: 'ALTO',    Icon: AlertTriangle, desc: 'pontos de atenção'   },
          { sev: 'MEDIO',   Icon: Info,          desc: 'avisos preventivos'  },
        ].map(({ sev, Icon: SIcon, desc }, i) => {
          const s = SEV_CFG_MAP[sev]
          return (
            <div
              key={sev}
              className="relative overflow-hidden rounded-2xl border animate-card-enter"
              style={{ borderColor: `${s.color}25`, animationDelay: `${i * 80}ms` }}
            >
              {/* Top accent */}
              <div className="absolute top-0 left-0 right-0 h-[2.5px]"
                   style={{ background: `linear-gradient(90deg, ${s.color}, ${s.color}50, transparent)` }} />

              {/* Atmospheric glow */}
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                   style={{ background: s.glow }} />

              <div className="relative p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                       style={{ background: s.bg, border: `1px solid ${s.color}30` }}>
                    <SIcon size={18} style={{ color: s.color }} />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-[0.07em]"
                        style={{ color: `${s.color}80` }}>
                    {s.label}
                  </span>
                </div>

                <p className="font-mono font-black tabular-nums leading-none mb-1"
                   style={{ fontSize: 'clamp(36px, 5vw, 48px)', color: s.color }}>
                  {(counts as Record<string, number>)[sev]}
                </p>
                <p className="text-[11px]" style={{ color: `${s.color}70` }}>{desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Context KPIs ──────────────────────────────────────────────────── */}
      {pulso && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: 'OS na Fila',
              value: totalFila,
              color: '#3b82f6',
              sub: 'registros ativos',
            },
            {
              label: 'Score Saúde',
              value: `${pulso.score ?? 0}%`,
              color: (pulso.score ?? 0) >= 80 ? '#4ade80' : (pulso.score ?? 0) >= 60 ? '#facc15' : '#f87171',
              sub: (pulso.score ?? 0) >= 80 ? 'Operacional saudável' : 'Atenção necessária',
            },
            {
              label: 'Aging Médio',
              value: `${(pulso.agingMed ?? 0).toFixed(1)}d`,
              color: (pulso.agingMed ?? 0) > 7 ? '#f97316' : '#3b82f6',
              sub: 'dias na fila ativa',
            },
          ].map((k, i) => (
            <div
              key={k.label}
              className="relative overflow-hidden rounded-xl border bg-card animate-card-enter"
              style={{ borderColor: `${k.color}20`, animationDelay: `${240 + i * 60}ms` }}
            >
              <div className="absolute top-0 left-0 right-0 h-[2px]"
                   style={{ background: k.color }} />
              <div className="p-4">
                <p className="text-[11px] text-muted mb-2">{k.label}</p>
                <p className="font-mono font-black tabular-nums text-[30px] leading-none"
                   style={{ color: k.color }}>
                  {k.value}
                </p>
                <p className="text-[10px] text-muted mt-1">{k.sub}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Grafana — OS por Cidade ────────────────────────────────────────── */}
      {(grafOS.cidades.length > 0 || grafOS.loading) && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel icon={Activity} color="#3b82f6">
              OS por Cidade · Vale do Paraíba
            </SectionLabel>
            <div className="flex items-center gap-3">
              {!!grafOS.totais && (() => {
                const t = grafOS.totais as Record<string, unknown>
                return (
                  <span className="text-[10px] text-muted tabular-nums">
                    {String(t['pendentes'] ?? '—')} pendentes · {String(t['fechados_7d'] ?? '—')} fechados/7d
                  </span>
                )
              })()}
              {grafOS.lastSync && (
                <span className="text-[9px] text-muted">
                  {grafOS.lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button onClick={grafOS.refresh} title="Atualizar"
                className="w-6 h-6 flex items-center justify-center text-muted hover:text-text
                           transition-colors rounded-md hover:bg-surface">
                <RefreshCw size={11} className={grafOS.loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <GrafanaCityStrip cidades={grafOS.cidades as GrafanaCidade[]} loading={grafOS.loading} />
          {grafOS.error && (
            <p className="text-[10px] text-muted/50 mt-1.5">
              iManager offline · usando dados ERP locais
            </p>
          )}
        </section>
      )}

      {/* ── Alert List ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-surface/30 border border-white/[0.08] animate-pulse" />
          ))}
        </div>
      ) : alerts.length === 0 && ruleAlerts.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-green/20 bg-card">
          <div className="absolute top-0 left-0 right-0 h-[2px]"
               style={{ background: 'linear-gradient(90deg, transparent, #4ade80, transparent)' }} />
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                 style={{ background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.25)' }}>
              <ShieldCheck size={28} className="text-green" />
            </div>
            <p className="text-[15px] font-semibold text-text mb-1">Tudo certo!</p>
            <p className="text-[12px] text-muted">
              Nenhum alerta ativo com os thresholds configurados
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ERP alerts por severidade */}
          {['CRITICO', 'ALTO', 'MEDIO'].map(sev => {
            const group = alerts.filter(a => a.severity === sev)
            if (!group.length) return null
            const s = SEV_CFG_MAP[sev]
            return (
              <section key={sev} className="space-y-2">
                <SectionLabel icon={AlertTriangle} color={s.color}>
                  {s.label} · {group.reduce((n, a) => n + a.count, 0)} ocorrências
                </SectionLabel>
                {group.map((alert, i) => (
                  <AlertCard key={alert.id} alert={alert} delay={i * 80} />
                ))}
              </section>
            )
          })}

          {/* Rule-based alerts */}
          {ruleAlerts.length > 0 && (
            <section className="space-y-2">
              <SectionLabel icon={BarChart3} color="#3b82f6">
                Regras de Negócio · {ruleAlerts.length} disparo{ruleAlerts.length > 1 ? 's' : ''}
              </SectionLabel>
              {ruleAlerts.map((rule, i) => (
                <RuleCard key={rule.id} rule={rule} delay={i * 60} />
              ))}
            </section>
          )}
        </div>
      )}

      {/* Settings drawer */}
      {showSettings && (
        <SettingsPanel
          settings={alertSettings}
          onSave={setAlertSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
