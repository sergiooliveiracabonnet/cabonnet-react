import { useState, useMemo, useCallback } from 'react'
import { MousePointerClick } from 'lucide-react'
import type { OSRow } from '../../lib/types'
import { useOSDerived }  from '../../contexts/OSDataContext'
import { buildGraficos } from '../../lib/builders'
import { TabBar }        from '../../components/ui/TabBar'
import {
  FORN_PILLS, TABS,
  DrillModal, TabDistribuicao, TabTendencia, TabEstatistica, TabCohort,
  type DrillState,
} from './GraficosComponents'

export default function GraficosPage() {
  const [tab,        setTab]        = useState('distribuicao')
  const [fornecedor, setFornecedor] = useState('')
  const [drill,      setDrill]      = useState<DrillState | null>(null)

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

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-headline text-xl font-semibold text-text">Gráficos &amp; Análises</h2>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted/60">
            <MousePointerClick size={11} className="flex-shrink-0" />
            <span>Clique nos gráficos para ver as OS detalhadas</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-medium text-muted/60 mr-0.5">Frente:</span>
          {FORN_PILLS.map(f => (
            <button key={f.value} onClick={() => setFornecedor(f.value)}
              className={`text-[11px] font-medium px-3 py-1 rounded-md border transition-all duration-150 cursor-pointer
                          ${fornecedor === f.value
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-white/[0.08] text-muted hover:text-secondary hover:border-muted/30'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} className="mb-2" />

      {tab === 'distribuicao' && <TabDistribuicao d={d} rows={activeRows} onDrill={openDrill} />}
      {tab === 'tendencia'    && <TabTendencia    d={d} rows={activeRows} onDrill={openDrill}
                                                   totalAtivo={rows.filter(r => ['Pendente','Atendimento'].includes(r.descsituacao)).length}
                                                   fila={rows.filter(r => r.descsituacao === 'Pendente').length} />}
      {tab === 'estatistica'  && <TabEstatistica  d={d} rows={activeRows} onDrill={openDrill} />}
      {tab === 'cohort'       && <TabCohort       d={d} rows={activeRows} onDrill={openDrill} />}

      <DrillModal drill={drill} onClose={() => setDrill(null)} />
    </div>
  )
}
