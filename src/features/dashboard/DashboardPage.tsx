import { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Download, BarChart3, ArrowRight } from 'lucide-react'
import type { OSRow, KPI, AccentColor } from '../../lib/types'
import { useOSDerived } from '../../contexts/OSDataContext'
import { useAINarrative } from '../../hooks/useAINarrative'
import { useStats } from '../../hooks/useStats'
import { exportCSV } from '../../lib/export'
import { KPIGridSkeleton } from '../../components/ui/Skeleton'
import { Modal } from '../../components/ui/Modal'
import OSDrawer from '../ordens/OSDrawer'
import { PulsoHero } from './PulsoHero'
import { FluxoOSPanel } from './FluxoOSPanel'
import { AnomaliaSection } from './AnomaliaSection'
import { StatCard, accentToTone } from '../../components/ui/StatCard'
import { SectionLabel } from './DashboardKpiPrimitives'
import { ExecutadasHeroBlock } from './DashboardHeroBlock'
import {
  MetaMesCard, AlertaTopoBanner, ClustersBairroPanel, AgingPanel,
  RitmoEquipesPanel, MudancasStrip, ProjecaoRiscoPanel,
  ParetoServicoPanel, CidadesValePanel, FornecedoresPanel,
} from './DashboardPaineis'
import { KpiModalTable } from './DashboardKpiModal'
import {
  KPI_ICONS, KPI_FILTERS, ALLROWS_KPIS, FOCO_NAVEGAVEL,
  type ModalState, type TypedDashboard, type CampoProjecaoReal,
} from './DashboardTypes'

export default function DashboardPage() {
  const { derived: { dashboard, anomalias, campo, graficos, revisitas }, rows, allRows, isLoading, error, builderErrors = [] } = useOSDerived()
  const { kpis, fornecedores, pulso, scoreTendencia, mudancas, metaScore, projecaoRisco } = dashboard as unknown as TypedDashboard
  const projecaoHoje = campo.projecao as unknown as CampoProjecaoReal | null
  const fluxoHoje = { entradas: pulso.entradasHoje, saidas: pulso.saidasHoje, saldo: pulso.fluxoHoje, mediaEntrada: pulso.entradaMediaDia }
  const { clustersAtivos = [] } = pulso
  const clustersRef  = useRef<HTMLDivElement>(null)
  const anomaliasRef = useRef<HTMLDivElement>(null)
  const [aiEnabled, setAiEnabled] = useState(false)
  const [observacao, setObservacao] = useState('')
  const { data: aiData, isLoading: isLoadingAI } = useAINarrative({ kpis, pulso: pulso as unknown as Record<string, unknown>, fornecedores, anomalias, observacao, enabled: aiEnabled })
  const { data: stats } = useStats()
  const navigate = useNavigate()

  const [modal,    setModal]    = useState<ModalState | null>(null)
  const [drawerOS, setDrawerOS] = useState<OSRow | null>(null)

  // Fila ativa ao vivo — mesmo predicado do KPI "Fila Total" e do agingDist do builder
  const filaAtiva = useMemo(() => allRows.filter(KPI_FILTERS.total), [allRows])

  function openKpi(kpi: KPI) {
    const filter = KPI_FILTERS[kpi.id]
    if (!filter) return
    const source   = ALLROWS_KPIS.has(kpi.id) ? allRows : rows
    const filtered = source.filter(filter)
    setModal({ title: kpi.title, rows: filtered, foco: kpi.id })
  }

  if (error && !rows.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-14 h-14 rounded-full bg-red/10 border border-red/20 flex items-center justify-center">
          <AlertCircle size={24} className="text-red" />
        </div>
        <p className="text-title font-semibold text-text">Servidor indisponível</p>
        <p className="text-label text-muted text-center max-w-xs leading-relaxed">
          {(error as Error)?.message ?? String(error)}
        </p>
      </div>
    )
  }

  if (isLoading) {
    const f = stats?.fila
    if (f) {
      const slaAccent: AccentColor = f.sla_pct >= 90 ? 'green' : f.sla_pct >= 75 ? 'yellow' : 'red'
      const reagendTotal = (f.reagend_inviab ?? 0) + (f.reagend_mobile ?? 0) + (f.reagend_futura ?? 0)
      // 5 + 5 — mesmas colunas nas duas linhas para os cartões alinharem
      const riskStats: KPI[] = [
        { id: 'criticas', title: 'OS Críticas',   value: f.criticas,        sub: 'SLA 2× excedido',  accent: 'red'     },
        { id: 'semEq',    title: 'Sem Equipe',     value: f.sem_equipe,      sub: 'sem atribuição',   accent: 'orange'  },
        { id: 'pend',     title: 'Pendentes',      value: f.pendente,        sub: 'aguardando',       accent: 'yellow'  },
        { id: 'copeAguardando', title: 'Aguard. Roteirização', value: f.cope_aguardando ?? 0, sub: 'parado no COPE', accent: 'orange' },
        { id: 'reagend',  title: 'Reagendadas',    value: reagendTotal,
          sub: `inviab. ${f.reagend_inviab ?? 0} · mobile ${f.reagend_mobile ?? 0} · futura ${f.reagend_futura ?? 0}`, accent: 'orange' },
      ]
      const perfStats: KPI[] = [
        { id: 'atend',    title: 'Em Atendimento', value: f.atendimento,     sub: 'em campo',         accent: 'cyan'    },
        { id: 'total',    title: 'Fila Total',     value: f.total,           sub: 'OS ativas',        accent: 'primary' },
        { id: 'rede',     title: 'Rede',           value: f.rede,            sub: 'OS de rede',       accent: 'green'   },
        { id: 'sla',      title: 'SLA da Fila',    value: `${f.sla_pct}%`,  sub: 'dentro do prazo',  accent: slaAccent },
        { id: 'aging',    title: 'Aging Médio',    value: `${f.aging_med}d`, sub: 'dias em aberto',  accent: 'purple'  },
      ]
      return (
        <div className="space-y-4 max-w-[1600px]">
          <section>
            <SectionLabel icon={AlertCircle} color="#f87171">Alertas &amp; Risco</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-2">
              {riskStats.map((k, i) => (
                <StatCard
                  key={k.id}
                  title={k.title}
                  value={k.value}
                  sub={k.sub}
                  tone={accentToTone(k.accent)}
                  trend={k.trend ?? undefined}
                  icon={KPI_ICONS[k.id]}
                  delay={i * 60}
                  scope={ALLROWS_KPIS.has(k.id) ? 'aovivo' : 'periodo'}
                />
              ))}
            </div>
          </section>
          <section>
            <SectionLabel icon={BarChart3} color="#3b82f6">Fila Ativa &amp; Performance</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-2">
              {perfStats.map((k, i) => (
                <StatCard
                  key={k.id}
                  title={k.title}
                  value={k.value}
                  sub={k.sub}
                  tone={accentToTone(k.accent)}
                  trend={k.trend ?? undefined}
                  icon={KPI_ICONS[k.id]}
                  delay={i * 60}
                  scope={ALLROWS_KPIS.has(k.id) ? 'aovivo' : 'periodo'}
                />
              ))}
            </div>
          </section>
        </div>
      )
    }
    return <KPIGridSkeleton count={8} />
  }

  // Reagrupamento 5 + 5: os 3 cartões de reagendamento viram um só (com breakdown
  // no subtítulo e drill-down unificado) e "Em Atendimento" vai para performance.
  const kpiById = new Map(kpis.map(k => [k.id, k]))
  const pick    = (ids: string[]) => ids.map(id => kpiById.get(id)).filter((k): k is KPI => k != null)
  const rInv = Number(kpiById.get('reagendInviab')?.value ?? 0)
  const rMob = Number(kpiById.get('reagendMobile')?.value ?? 0)
  const rFut = Number(kpiById.get('reagendFutura')?.value ?? 0)
  const reagendKpi: KPI = {
    id: 'reagend', title: 'Reagendadas', value: rInv + rMob + rFut,
    sub: `inviab. ${rInv} · mobile ${rMob} · futura ${rFut}`, accent: 'orange',
  }
  const riskKpis = [...pick(['criticas', 'semEq', 'pend', 'copeAguardando']), reagendKpi]
  const perfKpis = pick(['atend', 'total', 'rede', 'concl', 'taxa'])

  return (
    <>
      <div className="space-y-4 max-w-[1600px]">

        {/* ── Aviso de falha interna de builder (visível só em erro real) ── */}
        {builderErrors.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow/10 border border-yellow/20 text-caption text-yellow">
            <AlertCircle size={13} />
            <span>Erro interno em: <strong>{builderErrors.join(', ')}</strong> — dados parciais. Verifique o console.</span>
          </div>
        )}

        {/* ── Alerta no topo: clusters/anomalias sobem quando ativos ──────── */}
        <AlertaTopoBanner
          clustersCount={clustersAtivos.length}
          anomaliasCount={anomalias?.total ?? 0}
          onScrollClusters={() => clustersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          onScrollAnomalias={() => anomaliasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />

        {/* ── 1. HERO — Pulso Operacional ──────────────────────────────── */}
        <PulsoHero
          pulso={pulso}
          target={metaScore}
          tendencia={scoreTendencia}
          taxaRevisitas={(revisitas as { taxa?: { geral?: number } } | null)?.taxa?.geral ?? null}
          aiData={aiData}
          isLoadingAI={isLoadingAI}
          onRequestAI={(obs: string) => { setObservacao(obs); setAiEnabled(true) }}
        />

        {/* ── 1b. Trajetória — Δ do score do período + o que mudou ──────── */}
        <MudancasStrip tendencia={scoreTendencia} mudancas={mudancas} />

        {/* ── 2. KPI BENTO — Alertas & Risco ───────────────────────────── */}
        <section>
          <SectionLabel icon={AlertCircle} color="#f87171">Alertas &amp; Risco</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-2">
            {riskKpis.map((k, i) => (
              <StatCard
                key={k.id}
                title={k.title}
                value={k.value}
                sub={k.sub}
                tone={accentToTone(k.accent)}
                trend={k.trend ?? undefined}
                icon={KPI_ICONS[k.id]}
                delay={i * 60}
                onClick={KPI_FILTERS[k.id] ? () => openKpi(k) : undefined}
                scope={ALLROWS_KPIS.has(k.id) ? 'aovivo' : 'periodo'}
              />
            ))}
          </div>
        </section>

        {/* ── 2b. Projeção de risco preditiva (24-48h) ──────────────────── */}
        <ProjecaoRiscoPanel
          proj={projecaoRisco}
          criticasAgora={pulso.criticasTotal ?? 0}
          onOpen={(rows) => setModal({ title: 'Risco de violação · próximas 48h', rows })}
        />

        {/* ── 3. Executadas Hoje ─────────────────────────────────────────── */}
        <ExecutadasHeroBlock
          rows={allRows}
          projecao={projecaoHoje}
          fluxo={fluxoHoje}
          ritmoIntradiario={pulso.ritmoIntradiario}
          onOpenModal={(title, filtered) => setModal({ title, rows: filtered })}
        />

        {/* ── 4. KPI BENTO — Fila & Performance ────────────────────────── */}
        <section>
          <SectionLabel icon={BarChart3} color="#3b82f6">Fila Ativa &amp; Performance</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-2">
            {perfKpis.map((k, i) => (
              <StatCard
                key={k.id}
                title={k.title}
                value={k.value}
                sub={k.sub}
                tone={accentToTone(k.accent)}
                trend={k.trend ?? undefined}
                icon={KPI_ICONS[k.id]}
                delay={i * 60}
                onClick={KPI_FILTERS[k.id] ? () => openKpi(k) : undefined}
                scope={ALLROWS_KPIS.has(k.id) ? 'aovivo' : 'periodo'}
              />
            ))}
          </div>
        </section>

        {/* ── 5. Painéis analíticos — grid único de 3 colunas ───────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch">
          <div className="lg:col-span-2">
            <FluxoOSPanel evolucao={graficos.evolucao} />
          </div>
          <AgingPanel pulso={pulso} filaAtiva={filaAtiva}
                      onOpen={(title, rows) => setModal({ title, rows })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
          <ParetoServicoPanel filaAtiva={filaAtiva}
                              onOpen={(title, rows) => setModal({ title, rows })} />
          <CidadesValePanel filaAtiva={filaAtiva}
                            onOpen={(title, rows) => setModal({ title, rows })} />
          <MetaMesCard meta={pulso.metaMes} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
          <div ref={clustersRef} className="h-full">
            <ClustersBairroPanel clusters={clustersAtivos} />
          </div>
          <RitmoEquipesPanel semaforo={campo.semaforo} />
          <FornecedoresPanel fornecedores={fornecedores} />
        </div>

        {/* ── 8. Anomalias ──────────────────────────────────────────────── */}
        {anomalias?.total > 0 && (
          <div ref={anomaliasRef}>
            <AnomaliaSection
              anomalias={anomalias}
              contexto={{
                total:     (kpis.find(k => k.id === 'total')?.value    as number) ?? 0,
                sla_pct:   pulso.slaFila    ?? 0,
                criticas:  pulso.criticasTotal ?? 0,
                aging_med: pulso.agingMed   ?? 0,
              }}
            />
          </div>
        )}

      </div>

      {/* Modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.title ?? ''}
        subtitle={`${modal?.rows?.length ?? 0} ordens de serviço`}
        maxWidth="1120px"
        headerAction={
          (modal?.rows?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2">
              {modal?.foco && FOCO_NAVEGAVEL.has(modal.foco) && (
                <button
                  onClick={() => { const foco = modal!.foco; setModal(null); navigate('/ordens', { state: { foco } }) }}
                  className="flex items-center gap-1.5 text-caption font-semibold text-primary
                             border border-primary/30 hover:bg-primary/10 rounded-md px-2.5 py-1
                             transition-all duration-fast"
                >
                  Abrir na fila <ArrowRight size={11} />
                </button>
              )}
              <button
                onClick={() => {
                  const date = new Date().toISOString().slice(0, 10)
                  exportCSV(modal!.rows, `os_${modal!.title.toLowerCase().replace(/\s+/g, '_')}_${date}.csv`)
                }}
                className="flex items-center gap-1.5 text-caption text-muted hover:text-primary
                           border border-white/[0.08] hover:border-primary/30 rounded-md px-2.5 py-1
                           transition-all duration-fast"
              >
                <Download size={11} /> CSV
              </button>
            </div>
          )
        }
      >
        <KpiModalTable key={modal?.title} rows={modal?.rows ?? []} onOS={os => { setModal(null); setDrawerOS(os) }} />
      </Modal>

      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />
    </>
  )
}

