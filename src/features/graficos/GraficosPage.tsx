import { useState, useMemo, useCallback } from 'react'
import { CursorClick } from '@phosphor-icons/react'
import type { OSRow } from '../../lib/types'
import { useOSDerived }  from '../../contexts/OSDataContext'
import { buildGraficos } from '../../lib/builders'
import { TabBar }        from '../../components/ui/TabBar'
import { useUIStore, PRESETS } from '../../store/uiStore'
import OSDrawer from '../ordens/OSDrawer'
import { useIsFornecedor } from '../../hooks/useRole'
import {
  FORN_PILLS, TABS,
  DrillModal, TabDistribuicao, TabTendencia, TabEstatistica, TabCohort,
  type DrillState,
} from './GraficosComponents'

export default function GraficosPage() {
  const [tab,        setTab]        = useState('distribuicao')
  const [fornecedor, setFornecedor] = useState('')
  const [drill,      setDrill]      = useState<DrillState | null>(null)
  const [drawerOS,   setDrawerOS]   = useState<OSRow | null>(null)
  const { dateFilter } = useUIStore()
  const isFornecedor = useIsFornecedor()

  const { rows, derived: { graficos: graficosCtx } } = useOSDerived()

  const activeRows = useMemo(
    () => fornecedor ? rows.filter(r => r._fornecedor === fornecedor) : rows,
    [rows, fornecedor]
  )
  const d = useMemo(
    () => fornecedor ? buildGraficos(activeRows) : graficosCtx,
    [activeRows, fornecedor, graficosCtx]
  )

  const openDrill = useCallback((title: string, filteredRows: OSRow[]) => {
    setDrill({ title, rows: filteredRows })
  }, [])
  const periodoLabel = PRESETS.find(p => p.id === dateFilter.preset)?.label ?? 'Período personalizado'
  const campoLabel = dateFilter.campo === 'dataexecucao' ? 'execução'
    : dateFilter.campo === 'dataagendamento' ? 'agendamento' : 'cadastro'
  const openOS = useCallback((os: OSRow) => { setDrill(null); setDrawerOS(os) }, [])

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-headline text-xl font-semibold text-text">Gráficos &amp; Análises</h2>
          <div className="flex items-center gap-1.5 mt-1 text-caption text-muted/60">
            <CursorClick size={11} className="flex-shrink-0" />
            <span>Clique nos gráficos para ver as OS detalhadas</span>
          </div>
        </div>
        {!isFornecedor && <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-caption font-medium text-muted/60 mr-0.5">Frente:</span>
          {FORN_PILLS.map(f => (
            <button key={f.value} onClick={() => setFornecedor(f.value)}
              className={`text-caption font-medium px-3 py-1 rounded-md border transition-all duration-150 cursor-pointer
                          ${fornecedor === f.value
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-white/[0.08] text-muted hover:text-secondary hover:border-muted/30'}`}>
              {f.label}
            </button>
          ))}
        </div>}
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} className="mb-2" />

      {(['distribuicao', 'tendencia', 'estatistica', 'cohort'].includes(tab)) && (
        <div className="flex flex-wrap items-center gap-1.5 text-caption text-muted" aria-label="Escopo dos gráficos">
          <span className="rounded-full border border-white/[0.08] bg-surface/40 px-2 py-1">Período: {periodoLabel}</span>
          <span className="rounded-full border border-white/[0.08] bg-surface/40 px-2 py-1">Data de {campoLabel}</span>
          <span className="rounded-full border border-white/[0.08] bg-surface/40 px-2 py-1">Escopo: {isFornecedor ? 'Seu fornecedor' : (FORN_PILLS.find(f => f.value === fornecedor)?.label ?? 'Todos')}</span>
          <span className="rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-1 text-primary">{activeRows.length.toLocaleString('pt-BR')} OS</span>
        </div>
      )}

      {tab === 'distribuicao' && <TabDistribuicao d={d} rows={activeRows} onDrill={openDrill} />}
      {tab === 'tendencia'    && <TabTendencia    d={d} rows={activeRows} onDrill={openDrill}
                                                   totalAtivo={rows.filter(r => ['Pendente','Atendimento'].includes(r.descsituacao)).length}
                                                   fila={rows.filter(r => r.descsituacao === 'Pendente').length} />}
      {tab === 'estatistica'  && <TabEstatistica  d={d} rows={activeRows} onDrill={openDrill} />}
      {tab === 'cohort'       && <TabCohort       d={d} rows={activeRows} onDrill={openDrill} />}

      <DrillModal drill={drill} onClose={() => setDrill(null)} onOS={openOS} />
      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />
    </div>
  )
}
