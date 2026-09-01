import { useMemo, useState } from 'react'
import { Warning, ShieldWarning, ShieldCheck, Info, Pulse, ArrowsClockwise, Gear, ChartBar, Sparkle, MagnifyingGlass, CheckCircle } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../../components/ui/PageHeader'
import { useERPRows }    from '../useERPRows'
import { useERPStore }   from '../../../store/erpStore'
import { useAlerts }     from '../../../hooks/useAlerts'
import { useGrafanaOS }  from '../../../hooks/useGrafanaOS'
import { shortEquipe }   from '../../../lib/osFormat'
import { isFilaAtiva } from '../../../lib/transform'
import {
  SEV_CFG, SEV_CFG_MAP, buildAlerts,
  SectionLabel, AlertCard, RuleCard, GrafanaCityStrip, SettingsPanel,
  type GrafanaCidade,
} from './AlertasComponents'
import { useAIAlertas } from '../../../hooks/useAIAlertas'
import { buildAlertMetrics, operationalActiveRows, summarizeAlerts } from '../../../lib/alertEngine'
import { useAlertStore } from '../../../store/alertStore'

export default function AlertasPage() {
  const { rows, allRows, isLoading, derived } = useERPRows()
  const { alertSettings, setAlertSettings }   = useERPStore()
  const [showSettings, setShowSettings]       = useState(false)
  const [aiEnabled,    setAiEnabled]           = useState(false)
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('TODOS')
  const [statusFilter, setStatusFilter] = useState('ATIVOS')
  const navigate = useNavigate()
  const { acknowledged, toggleAcknowledged } = useAlertStore()
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
    allRows.forEach(row => {
      if (!row.nomedaequipe) return
      if (!isFilaAtiva(row._situacaoEfetiva)) return
      const code = shortEquipe(row.nomedaequipe).split(' - ')[0].trim()
      if (!map[code]) map[code] = { queue: 0, criticas: 0 }
      map[code].queue++
      if (row._slaCritico) map[code].criticas++
    })
    return map
  }, [allRows])

  const alerts     = useMemo(
    () => isLoading ? [] : buildAlerts(operationalActiveRows(allRows), alertSettings, metricsByCode, slaByCode),
    [allRows, alertSettings, metricsByCode, slaByCode, isLoading]
  )
  const ruleAlerts = useAlerts(rows, allRows)
  const ruleMetrics = useMemo(() => buildAlertMetrics(allRows, rows), [allRows, rows])

  const counts = useMemo(() => ({
    CRITICO: alerts.filter(a => a.severity === 'CRITICO').reduce((s, a) => s + a.count, 0),
    ALTO:    alerts.filter(a => a.severity === 'ALTO').reduce((s, a)    => s + a.count, 0),
    MEDIO:   alerts.filter(a => a.severity === 'MEDIO').reduce((s, a)   => s + a.count, 0),
  }), [alerts])

  const acknowledgedIds = useMemo(() => {
    const activeIds = new Set([
      ...alerts.map(alert => `operational:${alert.id}`),
      ...ruleAlerts.map(alert => `rule:${alert.id}`),
    ])
    return new Set(Object.keys(acknowledged).filter(id => activeIds.has(id)))
  }, [acknowledged, alerts, ruleAlerts])
  const summary = useMemo(() => summarizeAlerts(alerts, ruleAlerts, acknowledgedIds), [alerts, ruleAlerts, acknowledgedIds])
  const totalAlerts = summary.rulesTriggered
  const unresolvedAlerts = Math.max(0, totalAlerts - summary.acknowledged)
  const pulso       = derived?.dashboard?.pulso
  const totalFila   = useMemo(
    () => operationalActiveRows(allRows).length,
    [allRows]
  )
  const hasAny = unresolvedAlerts > 0

  // ── AI Alertas ──────────────────────────────────────────────────────────────
  const aiAlertasInput = useMemo(() => ({
    alertas: [...alerts.map(a => ({
      tipo:   a.id,
      ref:    a.title,
      nivel:  a.severity,
      titulo: a.title,
      msg:    a.desc,
    })), ...ruleAlerts.map(a => ({ tipo: a.id, ref: a.label, nivel: a.severity, titulo: a.label, msg: a.desc }))],
    contexto: {
      total:     totalFila,
      criticas:  counts.CRITICO,
      semEquipe: ruleMetrics.semEquipe,
      aging:     (pulso as { agingMed?: number } | undefined)?.agingMed ?? 0,
    },
  }), [alerts, ruleAlerts, totalFila, counts.CRITICO, pulso, ruleMetrics.semEquipe])

  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR')
  const visibleAlerts = useMemo(() => alerts.filter(alert => {
    const id = `operational:${alert.id}`
    const isAcknowledged = acknowledgedIds.has(id)
    if (severityFilter !== 'TODOS' && alert.severity !== severityFilter) return false
    if (statusFilter === 'ATIVOS' && isAcknowledged) return false
    if (statusFilter === 'RECONHECIDOS' && !isAcknowledged) return false
    return !normalizedSearch || `${alert.title} ${alert.desc} ${alert.items.map(item => `${item.label} ${item.sub}`).join(' ')}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
  }), [alerts, acknowledgedIds, severityFilter, statusFilter, normalizedSearch])

  const visibleRuleAlerts = useMemo(() => ruleAlerts.filter(alert => {
    const id = `rule:${alert.id}`
    const isAcknowledged = acknowledgedIds.has(id)
    if (severityFilter !== 'TODOS') {
      const severity = alert.severity === 'critical' ? 'CRITICO' : alert.severity === 'warning' ? 'ALTO' : 'MEDIO'
      if (severity !== severityFilter) return false
    }
    if (statusFilter === 'ATIVOS' && isAcknowledged) return false
    if (statusFilter === 'RECONHECIDOS' && !isAcknowledged) return false
    return !normalizedSearch || `${alert.label} ${alert.desc}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
  }), [ruleAlerts, acknowledgedIds, severityFilter, statusFilter, normalizedSearch])

  const { data: aiAlertas, isLoading: aiLoading } = useAIAlertas({ ...aiAlertasInput, enabled: aiEnabled })

  return (
    <div className="space-y-4 max-w-[1600px]">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Notificações & Alertas"
        titleExtra={
          hasAny ? (
            <span className="inline-flex items-center gap-1.5 text-caption font-bold px-2 py-0.5 rounded-full border"
                  style={{ background: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.35)', color: '#f87171' }}>
              {unresolvedAlerts} pendente{unresolvedAlerts !== 1 ? 's' : ''} · {summary.occurrences} ocorrências
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-caption font-bold px-2 py-0.5 rounded-full border"
                  style={{ background: 'rgba(74,222,128,0.10)', borderColor: 'rgba(74,222,128,0.30)', color: '#4ade80' }}>
              {totalAlerts > 0 ? 'Todos reconhecidos' : 'OK'}
            </span>
          )
        }
        description="Motor de regras em tempo real · ERP"
        descriptionExtra={
          !isLoading && (
            <span className="flex items-center gap-1.5 text-caption text-muted">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green" />
              </span>
              Atualizado com a fila operacional
            </span>
          )
        }
        actions={
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 text-caption text-secondary hover:text-text
                       px-3 py-1.5 rounded-xl border border-white/[0.08] hover:border-muted/40
                       hover:bg-surface/30 transition-all duration-150 flex-shrink-0"
          >
            <Gear size={13} /> Configurar
          </button>
        }
      />

      {/* ── Severity Bento ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { sev: 'CRITICO', Icon: ShieldWarning,  desc: 'situações críticas' },
          { sev: 'ALTO',    Icon: Warning, desc: 'pontos de atenção'  },
          { sev: 'MEDIO',   Icon: Info,          desc: 'avisos preventivos' },
        ].map(({ sev, Icon: SIcon, desc }, i) => {
          const s = SEV_CFG_MAP[sev]
          return (
            <div key={sev}
                 className="relative overflow-hidden rounded-2xl border animate-card-enter"
                 style={{ borderColor: `${s.color}25`, animationDelay: `${i * 80}ms` }}>
              <div className="absolute top-0 left-0 right-0 h-[2.5px]"
                   style={{ background: `linear-gradient(90deg, ${s.color}, ${s.color}50, transparent)` }} />
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                   style={{ background: s.glow }} />
              <div className="relative p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                       style={{ background: s.bg, border: `1px solid ${s.color}30` }}>
                    <SIcon size={18} style={{ color: s.color }} />
                  </div>
                  <span className="text-caption font-bold uppercase tracking-[0.07em]"
                        style={{ color: `${s.color}80` }}>
                    {s.label}
                  </span>
                </div>
                <p className="font-mono font-black tabular-nums leading-none mb-1"
                   style={{ fontSize: 'clamp(36px, 5vw, 48px)', color: s.color }}>
                  {(counts as Record<string, number>)[sev]}
                </p>
                <p className="text-caption" style={{ color: `${s.color}70` }}>{desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Context KPIs ──────────────────────────────────────────────────── */}
      {pulso && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { label: 'OS na Fila',    value: totalFila, color: '#3b82f6', sub: 'registros ativos' },
            { label: 'SLA da Fila',   value: `${pulso.slaFila ?? 0}%`,
              color: (pulso.slaFila ?? 0) >= 90 ? '#4ade80' : (pulso.slaFila ?? 0) >= 75 ? '#facc15' : '#f87171',
              sub: (pulso.slaFila ?? 0) >= 90 ? 'dentro do prazo' : 'atenção necessária' },
            { label: 'Aging Médio',   value: `${(pulso.agingMed ?? 0).toFixed(1)}d`,
              color: (pulso.agingMed ?? 0) > 7 ? '#f97316' : '#3b82f6', sub: 'dias na fila ativa' },
          ].map((k, i) => (
            <div key={k.label}
                 className="relative overflow-hidden rounded-xl border bg-card animate-card-enter"
                 style={{ borderColor: `${k.color}20`, animationDelay: `${240 + i * 60}ms` }}>
              <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: k.color }} />
              <div className="p-4">
                <p className="text-caption text-muted mb-2">{k.label}</p>
                <p className="font-mono font-black tabular-nums text-[30px] leading-none" style={{ color: k.color }}>
                  {k.value}
                </p>
                <p className="text-caption text-muted mt-1">{k.sub}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── AI Alertas ───────────────────────────────────────────────────── */}
      {!aiEnabled ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface/10 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkle size={12} className="text-primary/40" />
            <span className="text-caption font-bold text-muted uppercase tracking-wide">Análise de Alertas · IA</span>
          </div>
          <button
            onClick={() => setAiEnabled(true)}
            className="flex items-center gap-1.5 text-caption font-semibold text-primary/70 hover:text-primary
                       px-3 py-1.5 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/[0.08]
                       transition-all duration-fast"
          >
            <Sparkle size={11} /> Analisar com IA
          </button>
        </div>
      ) : (aiLoading || aiAlertas) && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkle size={12} className="text-primary" />
            <span className="text-caption font-bold text-primary/80 uppercase tracking-wide">
              Análise de Alertas · IA
            </span>
            {aiLoading && (
              <span className="text-caption text-muted animate-pulse ml-auto">Analisando…</span>
            )}
          </div>
          {aiAlertas && (
            <>
              {aiAlertas.prioridade && (
                <div className="flex items-center gap-2">
                  <span className="text-caption font-bold uppercase tracking-wide text-muted">Prioridade</span>
                  <span
                    className="text-caption font-bold px-2 py-0.5 rounded-full border"
                    style={{
                      background: aiAlertas.prioridade === 'CRITICA' ? 'rgba(248,113,113,0.12)' : 'rgba(249,115,22,0.10)',
                      borderColor: aiAlertas.prioridade === 'CRITICA' ? 'rgba(248,113,113,0.35)' : 'rgba(249,115,22,0.30)',
                      color: aiAlertas.prioridade === 'CRITICA' ? '#f87171' : '#f97316',
                    }}
                  >
                    {aiAlertas.prioridade}
                  </span>
                </div>
              )}
              {aiAlertas.causa_raiz && (
                <div>
                  <p className="text-caption font-bold uppercase tracking-wide text-muted mb-1">Causa raiz</p>
                  <p className="text-label text-secondary leading-relaxed">{aiAlertas.causa_raiz}</p>
                </div>
              )}
              {aiAlertas.acao_imediata && (
                <div>
                  <p className="text-caption font-bold uppercase tracking-wide text-muted mb-1">Ação imediata</p>
                  <p className="text-label text-text font-semibold leading-relaxed">{aiAlertas.acao_imediata}</p>
                </div>
              )}
              {aiAlertas.insights && aiAlertas.insights.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {aiAlertas.insights.map((ins, i) => (
                    <span
                      key={i}
                      className="text-caption px-2.5 py-1 rounded-full border border-primary/20 bg-primary/[0.06] text-primary/80"
                    >
                      {ins}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Grafana — OS por Cidade ────────────────────────────────────────── */}
      {(grafOS.cidades.length > 0 || grafOS.loading) && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel icon={Pulse} color="#3b82f6">
              OS por Cidade · Vale do Paraíba
            </SectionLabel>
            <div className="flex items-center gap-3">
              {!!grafOS.totais && (() => {
                const t = grafOS.totais as Record<string, unknown>
                return (
                  <span className="text-caption text-muted tabular-nums">
                    {String(t['pendentes'] ?? '—')} pendentes · {String(t['fechados_7d'] ?? '—')} fechados/7d
                  </span>
                )
              })()}
              {grafOS.lastSync && (
                <span className="text-caption text-muted">
                  {grafOS.lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button onClick={grafOS.refresh} title="Atualizar" aria-label="Atualizar dados por cidade"
                className="w-9 h-9 flex items-center justify-center text-muted hover:text-text
                           transition-colors rounded-md hover:bg-surface">
                <ArrowsClockwise size={11} className={grafOS.loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <GrafanaCityStrip cidades={grafOS.cidades as GrafanaCidade[]} loading={grafOS.loading} />
          {grafOS.error && (
            <p className="text-caption text-muted/50 mt-1.5">iManager offline · usando dados ERP locais</p>
          )}
        </section>
      )}

      {/* ── Alert List ────────────────────────────────────────────────────── */}
      {grafOS.error && grafOS.cidades.length === 0 && !grafOS.loading && (
        <div role="status" className="rounded-xl border border-yellow/25 bg-yellow/[0.06] px-4 py-3 text-label text-secondary">
          iManager indisponível. Os alertas continuam usando os dados operacionais do ERP.
        </div>
      )}

      <section aria-label="Filtros de alertas" className="rounded-xl border border-white/[0.08] bg-card p-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <label className="relative flex-1 min-w-0">
            <span className="sr-only">Pesquisar alertas</span>
            <MagnifyingGlass size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Pesquisar OS, cliente, equipe, cidade ou regra"
              className="w-full h-10 rounded-lg border border-white/[0.08] bg-surface pl-9 pr-3 text-label text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50" />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="alert-severity-filter">Severidade</label>
            <select id="alert-severity-filter" value={severityFilter} onChange={event => setSeverityFilter(event.target.value)}
              className="h-10 rounded-lg border border-white/[0.08] bg-surface px-3 text-label text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <option value="TODOS">Todas as severidades</option><option value="CRITICO">Críticos</option>
              <option value="ALTO">Altos</option><option value="MEDIO">Médios</option>
            </select>
            <label className="sr-only" htmlFor="alert-status-filter">Situação</label>
            <select id="alert-status-filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}
              className="h-10 rounded-lg border border-white/[0.08] bg-surface px-3 text-label text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <option value="ATIVOS">Não reconhecidos</option><option value="RECONHECIDOS">Reconhecidos ({summary.acknowledged})</option>
              <option value="TODOS">Todos</option>
            </select>
          </div>
        </div>
      </section>

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
            <p className="text-title font-semibold text-text mb-1">Tudo certo!</p>
            <p className="text-label text-muted">Nenhum alerta ativo com os thresholds configurados</p>
          </div>
        </div>
      ) : visibleAlerts.length === 0 && visibleRuleAlerts.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-card px-5 py-12 text-center">
          <CheckCircle size={24} className="mx-auto mb-3 text-muted" />
          <p className="text-label font-semibold text-text">Nenhum alerta corresponde aos filtros</p>
          <button onClick={() => { setSearch(''); setSeverityFilter('TODOS'); setStatusFilter('TODOS') }}
            className="mt-3 min-h-10 px-3 text-label text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/50 rounded-md">
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {['CRITICO', 'ALTO', 'MEDIO'].map(sev => {
            const group = visibleAlerts.filter(a => a.severity === sev)
            if (!group.length) return null
            const s = SEV_CFG[sev as keyof typeof SEV_CFG]
            return (
              <section key={sev} className="space-y-2">
                <SectionLabel icon={Warning} color={s.color}>
                  {s.label} · {group.reduce((n, a) => n + a.count, 0)} ocorrências
                </SectionLabel>
                {group.map((alert, i) => {
                  const incidentId = `operational:${alert.id}`
                  return <AlertCard key={alert.id} alert={alert} delay={i * 80}
                    acknowledged={acknowledgedIds.has(incidentId)}
                    onToggleAcknowledged={() => toggleAcknowledged(incidentId)}
                    onView={() => navigate('/ordens')} />
                })}
              </section>
            )
          })}

          {visibleRuleAlerts.length > 0 && (
            <section className="space-y-2">
              <SectionLabel icon={ChartBar} color="#3b82f6">
                Regras de Negócio · {visibleRuleAlerts.length} disparo{visibleRuleAlerts.length > 1 ? 's' : ''}
              </SectionLabel>
              {visibleRuleAlerts.map((rule, i) => {
                const incidentId = `rule:${rule.id}`
                return <RuleCard key={rule.id} rule={rule} delay={i * 60}
                  acknowledged={acknowledgedIds.has(incidentId)}
                  onToggleAcknowledged={() => toggleAcknowledged(incidentId)} />
              })}
            </section>
          )}
        </div>
      )}

      {showSettings && (
        <SettingsPanel settings={alertSettings} onSave={setAlertSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
