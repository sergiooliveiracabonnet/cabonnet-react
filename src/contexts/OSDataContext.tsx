/* eslint-disable @typescript-eslint/no-explicit-any */
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
import type { OSRow } from '../lib/types'

const EMPTY_DERIVED = {
  dashboard:  { kpis: [], fornecedores: [], pulso: { score: 0, scoreLabel: '—', narrativa: '—', quickInsights: [], agingMed: 0, agingDist: { '≤1d': 0, '2-3d': 0, '4-7d': 0, '8+d': 0 }, slaFila: 0, semAgendamento: 0, mttr: 0, topCidadesCriticas: [], clustersAtivos: [] } },
  sla:        { pulso: { narrativa: '', ok: 0, atencao: 0, fora: 0, criticas: 0, score: 0, scoreLabel: '' }, hipoteses: [], resumo: [], ranking: [], agingEq: { labels: [], values: [] }, semaforo: [], clusters: [] },
  graficos:   { status: { labels: [], values: [] }, tipo: { labels: [], values: [] }, cidade: { labels: [], values: [] }, equipes: { labels: [], values: [] }, aging: { labels: [], values: [] }, eficiencia: { labels: [], values: [] }, cohort: { labels: [], total: [], concluidas: [], mesmoMes: [], taxaResolucao: [], mttr: [] }, evolucao: { labels: [], abertas: [], concluidas: [] }, mensal: { labels: [], abertas: [], concluidas: [], slaExcedido: [] }, comparativo: { labels: [], pendente: [], atendimento: [], concluida: [] }, taxaDia: { labels: [], values: [] }, burndown: { labels: [], realizado: [], meta: [] } },
  auditoria:  { score: { value: 0, label: '—', ts: '' }, summary: [], problems: [], tips: [] },
  anomalias:  { total: 0, picosDia: [], bairrosAnomalia: [], equipesAnomalia: [] },
  cidades:    { ranking: [], pendencias: [], fila: [], heatmap: [], execucoes: [], consolidado: [], kpis: [], todasCidades: [] },
  campo:      { kpis: [], semaforo: [], risco: { count: 0, pct: 0, desc: '' }, concluidas: [], fila: [], ritmo: { labels: [], values: [] }, tecnicos: [], projecao: null, agingDist: null, hero: null },
  revisitas:  { taxa: { inst: 0, manut: 0, serv: 0, geral: 0 }, narrativa: '', hipoteses: [], causas: [], causaRaiz: [], cronicos: [], chart: { labels: [], values: [] }, totalRevisitas: 0, revInst: 0, revManut: 0, revServ: 0, porEquipe: [], porCidade: [], evitaveis: { count: 0, pct: 0 }, tempoMedio: 0, custoEstimado: 0, diasDist: { '1-7': 0, '8-14': 0, '15-20': 0, '21-30': 0 }, base: { total: 0, inst: 0, manut: 0, serv: 0 }, tendencia: { delta: 0, prevTaxa: 0 }, intervalo: { labels: [], values: [] }, tabela: [] },
  ordens:     { ordens: [], options: { statuses: [], tipos: [], cidades: [], equipes: [], bairros: [] } },
}

type Derived = typeof EMPTY_DERIVED

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch (e) { console.error('[OSData] builder error:', e); return fallback }
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

  const dashboard  = useMemo(() => safe(() => buildDashboard(activeRows, activeAllRows, activePrev) as any, EMPTY_DERIVED.dashboard), [activeRows, activeAllRows, activePrev])
  const sla        = useMemo(() => safe(() => buildSla(activeRows) as any,        EMPTY_DERIVED.sla),        [activeRows])
  const graficos   = useMemo(() => safe(() => buildGraficos(activeRows) as any,   EMPTY_DERIVED.graficos),   [activeRows])
  const auditoria  = useMemo(() => safe(() => buildAuditoria(activeRows, discardedLixo, duplicadosLixo) as any, EMPTY_DERIVED.auditoria), [activeRows, discardedLixo, duplicadosLixo])
  const anomalias  = useMemo(() => safe(() => buildAnomalias(activeRows) as any,  EMPTY_DERIVED.anomalias),  [activeRows])
  const cidades    = useMemo(() => safe(() => buildCidades(activeRows) as any,    EMPTY_DERIVED.cidades),    [activeRows])
  const campo      = useMemo(() => safe(() => buildCampo(activeRows) as any,      EMPTY_DERIVED.campo),      [activeRows])
  const revisitas  = useMemo(() => safe(() => buildRevisitas(activeRevisitaRows, prevRevisitaRows) as any, EMPTY_DERIVED.revisitas), [activeRevisitaRows, prevRevisitaRows])
  const ordens     = useMemo(() => safe(() => buildOrdens(activeRows) as any,     EMPTY_DERIVED.ordens),     [activeRows])

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
