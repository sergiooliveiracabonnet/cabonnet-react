/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useOSData } from '../hooks/useOSData'
import { useServerEvents } from '../hooks/useServerEvents'
import { useRevisitasData } from '../hooks/useRevisitasData'
import { useUIStore } from '../store/uiStore'
import { applyDateFilter } from '../lib/transform'
import {
  buildDashboard, buildSla, buildGraficos, buildAuditoria,
  buildCidades, buildCampo, buildRevisitas, buildOrdens, buildAnomalias,
} from '../lib/builders'
import type {
  OSRow, KPI, QuickInsight, ClusterAtivo,
  CampoSemaforo, CampoAgingDist, CampoHeroReal,
  PicoDiaAnomalia, BairroAnomalia, EquipeAnomalia,
  SlaHipotese, SlaResumoItem, SlaRankingItem, SlaSemaforo, SlaCluster,
  CidadeItem, CidadeRankItem, CidadePendItem, CidadeFilaItem,
  CidadeHeatmapItem, CidadeExecItem, CidadeConsolidItem,
  RevisitaHipotese, RevisitaCausa,
} from '../lib/types'

// Tipos locais não exportados de types.ts — espelham retorno real dos builders.
// Anotações explícitas nos arrays evitam inferência `never[]` downstream.

type AuditSummaryReal = { label: string; value: number; ok: boolean; sub?: string }
type AuditProblemReal = { title: string; severity: string; desc: string; rows: { numos: string; status: string; cidade: string }[] }
type AuditTipReal     = { text: string }

const EMPTY_DERIVED = {
  dashboard: {
    kpis:         [] as KPI[],
    fornecedores: [] as { nome: string; total: number; concluidas: number; sla: number; cor: string }[],
    pulso: {
      score: 0, scoreLabel: '—', narrativa: '—',
      scoreBreakdown:     [] as { id: string; label: string; value: number; weight: number }[],
      quickInsights:      [] as QuickInsight[],
      agingMed: 0, agingDist: { '≤1d': 0, '2-3d': 0, '4-7d': 0, '8+d': 0 } as { '≤1d': number; '2-3d': number; '4-7d': number; '8+d': number },
      slaFila: 0, semAgendamento: 0, mttr: 0,
      topCidadesCriticas: [] as { cidade: string; count: number }[],
      clustersAtivos:     [] as ClusterAtivo[],
      entradasHoje: 0, saidasHoje: 0, fluxoHoje: 0,
      metaMes: {
        concluidas: 0, meta: 0, pct: null as number | null,
        diasUteisRestantes: 0, diasUteisTotal: 0, projecaoFinal: null as number | null,
        status: 'neutro' as 'acima' | 'abaixo' | 'neutro',
      },
    },
  },
  sla: {
    pulso:    { narrativa: '', ok: 0, atencao: 0, fora: 0, criticas: 0, score: 0, scoreLabel: '' },
    hipoteses: [] as SlaHipotese[],
    resumo:    [] as SlaResumoItem[],
    ranking:   [] as SlaRankingItem[],
    agingEq:   { labels: [] as string[], values: [] as number[] },
    semaforo:  [] as SlaSemaforo[],
    clusters:  [] as SlaCluster[],
  },
  graficos: {
    status:      { labels: [] as string[], values: [] as number[] },
    tipo:        { labels: [] as string[], values: [] as number[] },
    cidade:      { labels: [] as string[], values: [] as number[] },
    equipes:     { labels: [] as string[], values: [] as number[] },
    aging:       { labels: [] as string[], values: [] as number[] },
    eficiencia:  { labels: [] as string[], values: [] as number[] },
    cohort:      { labels: [] as string[], total: [] as number[], concluidas: [] as number[], mesmoMes: [] as number[], taxaResolucao: [] as number[], mttr: [] as number[] },
    evolucao:    { labels: [] as string[], abertas: [] as number[], concluidas: [] as number[] },
    mensal:      { labels: [] as string[], abertas: [] as number[], concluidas: [] as number[], slaExcedido: [] as number[] },
    comparativo: { labels: [] as string[], pendente: [] as number[], atendimento: [] as number[], concluida: [] as number[] },
    taxaDia:     { labels: [] as string[], values: [] as number[] },
    burndown:    { labels: [] as string[], realizado: [] as number[], meta: [] as number[] },
  },
  auditoria: {
    score:    { value: 0, label: '—', ts: '' },
    summary:  [] as AuditSummaryReal[],
    problems: [] as AuditProblemReal[],
    tips:     [] as AuditTipReal[],
  },
  anomalias: {
    total:           0,
    picosDia:        [] as PicoDiaAnomalia[],
    bairrosAnomalia: [] as BairroAnomalia[],
    equipesAnomalia: [] as EquipeAnomalia[],
  },
  cidades: {
    ranking:      [] as CidadeRankItem[],
    pendencias:   [] as CidadePendItem[],
    fila:         [] as CidadeFilaItem[],
    heatmap:      [] as CidadeHeatmapItem[],
    execucoes:    [] as CidadeExecItem[],
    consolidado:  [] as CidadeConsolidItem[],
    kpis:         [] as KPI[],
    todasCidades: [] as CidadeItem[],
  },
  campo: {
    kpis:       [] as KPI[],
    semaforo:   [] as CampoSemaforo[],
    risco:      { count: 0, pct: 0, desc: '' },
    concluidas: [] as CampoSemaforo[],
    fila:       [] as CampoSemaforo[],
    ritmo:      { labels: [] as string[], values: [] as number[] },
    tecnicos:   [] as never[],
    projecao:   null as { equipe: string; fila: number; ritmo: number; dias: number | string }[] | null,
    agingDist:  { labels: [] as string[], values: [] as number[], hasCritical: false } as CampoAgingDist,
    hero:       { status: '', title: '', msg: '', criticoCount: 0, atencaoCount: 0, totalEquipes: 0 } as CampoHeroReal,
  },
  revisitas: {
    taxa:      { inst: 0, manut: 0, serv: 0, geral: 0 },
    narrativa: '',
    hipoteses: [] as RevisitaHipotese[],
    causas:    [] as RevisitaCausa[],
    causaRaiz: [] as RevisitaCausa[],
    cronicos:  [] as OSRow[],
    chart:     { labels: [] as string[], values: [] as number[] },
    totalRevisitas: 0, revInst: 0, revManut: 0, revServ: 0,
    porEquipe: [] as { equipe: string; total: number; taxa: number }[],
    porCidade: [] as { cidade: string; total: number; taxa: number }[],
    evitaveis:    { count: 0, pct: 0 },
    tempoMedio:   0,
    custoEstimado: 0,
    diasDist:  { '1-7': 0, '8-14': 0, '15-20': 0, '21-30': 0 },
    base:      { total: 0, inst: 0, manut: 0, serv: 0 },
    tendencia: { delta: 0, prevTaxa: 0 },
    intervalo: { labels: [] as string[], values: [] as number[] },
    tabela:    [] as unknown[],
  },
  ordens: {
    ordens:  [] as OSRow[],
    options: { tipos: [] as string[], cidades: [] as string[], equipes: [] as string[], bairros: [] as string[], periodos: [] as string[] },
  },
}

type Derived = typeof EMPTY_DERIVED

// fn tipado como () => unknown permite que qualquer builder seja passado sem as any;
// o cast para T é seguro porque T é inferido do fallback (EMPTY_DERIVED), que é a fonte de verdade do tipo.
function safe<T>(name: string, fn: () => unknown, fallback: T): T {
  try { return fn() as T } catch (e) { console.error(`[OSData] ${name} builder error:`, e); return fallback }
}

interface OSDataContextValue {
  rows:          OSRow[]
  allRows:       OSRow[]
  isLoading:     boolean
  error:         unknown
  dataUpdatedAt: number
  builderErrors: string[]
  derived:       Derived
}

const Ctx = createContext<OSDataContextValue | null>(null)

export function OSDataProvider({ children }: { children: ReactNode }) {
  useServerEvents()  // push SSE → invalida ['os-query'] automaticamente
  const { rows, allRows, prevRows, discardedLixo, duplicadosLixo, isLoading, error, dataUpdatedAt } = useOSData()
  const { revisitaRows: allRevisitaRows } = useRevisitasData()
  const { hideRede, dateFilter } = useUIStore()

  // Quando hideRede está ativo, remove as OS de Rede Interna de todos os builders
  const activeRows    = useMemo(() => hideRede ? rows.filter(r => r._tipo !== 'REDE')    : rows,    [rows,    hideRede])
  const activeAllRows = useMemo(() => hideRede ? allRows.filter(r => r._tipo !== 'REDE') : allRows, [allRows, hideRede])
  const activePrev    = useMemo(() => hideRede ? prevRows.filter(r => r._tipo !== 'REDE'): prevRows, [prevRows, hideRede])

  // Revisitas: usa OS concluídas filtradas por dataexecucao (não datacadastro)
  const activeRevisitaRows = useMemo(() => {
    const filtered = applyDateFilter(allRevisitaRows, { ...dateFilter, campo: 'dataexecucao' })
    return hideRede ? filtered.filter(r => r._tipo !== 'REDE') : filtered
  }, [allRevisitaRows, dateFilter, hideRede])

  const prevRevisitaRows = useMemo(() => {
    const { from, to } = dateFilter ?? {}
    if (!from || !to) return []
    const duration = to.getTime() - from.getTime()
    const prevTo   = new Date(from.getTime() - 1)
    const prevFrom = new Date(from.getTime() - duration - 1)
    const filtered = applyDateFilter(allRevisitaRows, { ...dateFilter, campo: 'dataexecucao', from: prevFrom, to: prevTo })
    return hideRede ? filtered.filter(r => r._tipo !== 'REDE') : filtered
  }, [allRevisitaRows, dateFilter, hideRede])

  const dashboard  = useMemo(() => safe('dashboard', () => buildDashboard(activeRows, activeAllRows, activePrev), EMPTY_DERIVED.dashboard), [activeRows, activeAllRows, activePrev])
  const sla        = useMemo(() => safe('sla',        () => buildSla(activeRows),        EMPTY_DERIVED.sla),        [activeRows])
  const graficos   = useMemo(() => safe('graficos',   () => buildGraficos(activeRows),   EMPTY_DERIVED.graficos),   [activeRows])
  const auditoria  = useMemo(() => safe('auditoria',  () => buildAuditoria(activeRows, discardedLixo, duplicadosLixo), EMPTY_DERIVED.auditoria), [activeRows, discardedLixo, duplicadosLixo])
  const anomalias  = useMemo(() => safe('anomalias',  () => buildAnomalias(activeRows),  EMPTY_DERIVED.anomalias),  [activeRows])
  const cidades    = useMemo(() => safe('cidades',    () => buildCidades(activeRows),    EMPTY_DERIVED.cidades),    [activeRows])
  const campo      = useMemo(() => safe('campo',      () => buildCampo(activeRows),      EMPTY_DERIVED.campo),      [activeRows])
  const revisitas  = useMemo(() => safe('revisitas',  () => buildRevisitas(activeRevisitaRows, prevRevisitaRows), EMPTY_DERIVED.revisitas), [activeRevisitaRows, prevRevisitaRows])
  const ordens     = useMemo(() => safe('ordens',     () => buildOrdens(activeRows),     EMPTY_DERIVED.ordens),     [activeRows])

  // Detecta falhas de builders por identidade de referência com o fallback
  const builderErrors = useMemo(() => [
    dashboard === EMPTY_DERIVED.dashboard && 'dashboard',
    sla       === EMPTY_DERIVED.sla       && 'sla',
    graficos  === EMPTY_DERIVED.graficos  && 'graficos',
    auditoria === EMPTY_DERIVED.auditoria && 'auditoria',
    anomalias === EMPTY_DERIVED.anomalias && 'anomalias',
    cidades   === EMPTY_DERIVED.cidades   && 'cidades',
    campo     === EMPTY_DERIVED.campo     && 'campo',
    revisitas === EMPTY_DERIVED.revisitas && 'revisitas',
    ordens    === EMPTY_DERIVED.ordens    && 'ordens',
  ].filter(Boolean) as string[], [dashboard, sla, graficos, auditoria, anomalias, cidades, campo, revisitas, ordens])

  const value = useMemo<OSDataContextValue>(() => ({
    rows:    activeRows,
    allRows: activeAllRows,
    isLoading,
    error,
    dataUpdatedAt,
    builderErrors,
    derived: { dashboard, sla, graficos, auditoria, anomalias, cidades, campo, revisitas, ordens },
  }), [activeRows, activeAllRows, isLoading, error, dataUpdatedAt, builderErrors,
       dashboard, sla, graficos, auditoria, anomalias, cidades, campo, revisitas, ordens])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOSDerived(): OSDataContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) {
    console.warn('[useOSDerived] usado fora do OSDataProvider — retornando defaults')
    return { rows: [], allRows: [], isLoading: true, error: null, dataUpdatedAt: 0, builderErrors: [], derived: EMPTY_DERIVED }
  }
  return ctx
}
