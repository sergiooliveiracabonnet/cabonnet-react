import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Download, Package, BarChart3, ArrowRight } from 'lucide-react'
import type { OSRow, KPI, AccentColor } from '../../lib/types'
import { useOSDerived } from '../../contexts/OSDataContext'
import { useAINarrative } from '../../hooks/useAINarrative'
import { useStats } from '../../hooks/useStats'
import { exportCSV } from '../../lib/export'
import { KPIGridSkeleton } from '../../components/ui/Skeleton'
import { Modal } from '../../components/ui/Modal'
import OSDrawer from '../ordens/OSDrawer'
import {
  SectionLabel, PulsoHero, BentoKPICard, ExecutadasHeroBlock, MetaMesCard, AlertaTopoBanner,
  ClustersBairroPanel, AgingPanel, RitmoEquipesPanel, CidadesPanel, FornecedorCard, AnomaliaSection, KpiModalTable,
  MudancasStrip, ProjecaoRiscoPanel, KPI_ICONS, KPI_FILTERS, ALLROWS_KPIS, FOCO_NAVEGAVEL,
  type ModalState, type TypedDashboard, type CampoProjecaoReal,
} from './DashboardComponents'

export default function DashboardPage() {
  const { derived: { dashboard, anomalias, campo }, rows, allRows, isLoading, error, builderErrors = [] } = useOSDerived()
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
        <p className="text-[14px] font-semibold text-text">Servidor indisponível</p>
        <p className="text-[12px] text-muted text-center max-w-xs leading-relaxed">
          {(error as Error)?.message ?? String(error)}
        </p>
      </div>
    )
  }

  if (isLoading) {
    const f = stats?.fila
    if (f) {
      const slaAccent: AccentColor = f.sla_pct >= 90 ? 'green' : f.sla_pct >= 75 ? 'yellow' : 'red'
      const statsKpis: KPI[] = [
        { id: 'criticas', title: 'OS Críticas',   value: f.criticas,        sub: 'SLA 2× excedido',  accent: 'red'     },
        { id: 'semEq',    title: 'Sem Equipe',     value: f.sem_equipe,      sub: 'sem atribuição',   accent: 'orange'  },
        { id: 'pend',     title: 'Pendentes',      value: f.pendente,        sub: 'aguardando',       accent: 'yellow'  },
        { id: 'atend',    title: 'Em Atendimento', value: f.atendimento,     sub: 'em campo',         accent: 'cyan'    },
        { id: 'reagend',  title: 'Reagendamentos', value: f.reagend ?? 0,    sub: 'aguardando rescheduling', accent: 'orange' },
        { id: 'total',    title: 'Fila Total',     value: f.total,           sub: 'OS ativas',        accent: 'primary' },
        { id: 'rede',     title: 'Rede',           value: f.rede,            sub: 'OS de rede',       accent: 'green'   },
        { id: 'sla',      title: 'SLA da Fila',    value: `${f.sla_pct}%`,  sub: 'dentro do prazo',  accent: slaAccent },
        { id: 'aging',    title: 'Aging Médio',    value: `${f.aging_med}d`, sub: 'dias em aberto',  accent: 'purple'  },
      ]
      return (
        <div className="space-y-4 max-w-[1600px]">
          <section>
            <SectionLabel icon={AlertCircle} color="#f87171">Alertas &amp; Risco</SectionLabel>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-2">
              {statsKpis.slice(0, 5).map((k, i) => (
                <BentoKPICard key={k.id} kpi={k} icon={KPI_ICONS[k.id]} delay={i * 60} scope="aovivo" />
              ))}
            </div>
          </section>
          <section>
            <SectionLabel icon={BarChart3} color="#3b82f6">Fila Ativa &amp; Performance</SectionLabel>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
              {statsKpis.slice(5).map((k, i) => (
                <BentoKPICard key={k.id} kpi={k} icon={KPI_ICONS[k.id]} delay={i * 60} scope="aovivo" />
              ))}
            </div>
          </section>
        </div>
      )
    }
    return <KPIGridSkeleton count={8} />
  }

  const riskKpis = kpis.slice(0, 5)
  const perfKpis = kpis.slice(5)

  return (
    <>
      <div className="space-y-4 max-w-[1600px]">

        {/* ── Aviso de falha interna de builder (visível só em erro real) ── */}
        {builderErrors.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow/10 border border-yellow/20 text-[11px] text-yellow">
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
          aiData={aiData}
          isLoadingAI={isLoadingAI}
          onRequestAI={(obs: string) => { setObservacao(obs); setAiEnabled(true) }}
        />

        {/* ── 1b. Trajetória — Δ do score do período + o que mudou ──────── */}
        <MudancasStrip tendencia={scoreTendencia} mudancas={mudancas} />

        {/* ── 2. KPI BENTO — Alertas & Risco ───────────────────────────── */}
        <section>
          <SectionLabel icon={AlertCircle} color="#f87171">Alertas &amp; Risco</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-2">
            {riskKpis.map((k, i) => (
              <BentoKPICard
                key={k.id}
                kpi={k}
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
          criticasAgora={(kpis.find(k => k.id === 'criticas')?.value as number) ?? 0}
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
            {perfKpis.map((k, i) => (
              <BentoKPICard
                key={k.id}
                kpi={k}
                icon={KPI_ICONS[k.id]}
                delay={i * 60}
                onClick={KPI_FILTERS[k.id] ? () => openKpi(k) : undefined}
                scope={ALLROWS_KPIS.has(k.id) ? 'aovivo' : 'periodo'}
              />
            ))}
          </div>
        </section>

        {/* ── 5. Faixa: Clusters + Risk Panel + Ritmo por Equipe + Meta ──── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div ref={clustersRef}>
            <ClustersBairroPanel clusters={clustersAtivos} />
          </div>
          <AgingPanel pulso={pulso} />
          <RitmoEquipesPanel semaforo={campo.semaforo} />
          <MetaMesCard meta={pulso.metaMes} />
        </div>

        {/* ── 6. Fornecedores ───────────────────────────────────────────── */}
        {fornecedores.length > 0 && (
          <section>
            <SectionLabel icon={Package} color="#c4b5fd">Desempenho por Fornecedor</SectionLabel>
            <div className="grid gap-3 mt-2 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
              {fornecedores.map(f => <FornecedorCard key={f.nome} {...f} />)}
            </div>
          </section>
        )}

        {/* ── 7. Top Cidades Críticas ───────────────────────────────────── */}
        {pulso.topCidadesCriticas?.length > 0 && (
          <CidadesPanel cidades={pulso.topCidadesCriticas} />
        )}

        {/* ── 8. Anomalias ──────────────────────────────────────────────── */}
        {anomalias?.total > 0 && (
          <div ref={anomaliasRef}>
            <AnomaliaSection
              anomalias={anomalias}
              contexto={{
                total:     (kpis.find(k => k.id === 'total')?.value    as number) ?? 0,
                sla_pct:   pulso.slaFila    ?? 0,
                criticas:  (kpis.find(k => k.id === 'criticas')?.value as number) ?? 0,
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
        maxWidth="900px"
        headerAction={
          (modal?.rows?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2">
              {modal?.foco && FOCO_NAVEGAVEL.has(modal.foco) && (
                <button
                  onClick={() => { const foco = modal!.foco; setModal(null); navigate('/ordens', { state: { foco } }) }}
                  className="flex items-center gap-1.5 text-[10px] font-semibold text-primary
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
                className="flex items-center gap-1.5 text-[10px] text-muted hover:text-primary
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

