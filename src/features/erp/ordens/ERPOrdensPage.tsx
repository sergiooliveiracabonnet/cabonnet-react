import { useMemo } from 'react'
import {
  Kanban, List, CalendarDays, AlertTriangle, Clock, Users, Layers,
  Filter, X,
} from 'lucide-react'
import { useERPRows } from '../useERPRows'
import { useERPStore } from '../../../store/erpStore'
import { KanbanBoard } from './KanbanBoard'
import { FilaInteligente } from './FilaInteligente'
import { AgendaView } from './AgendaView'

const VIEWS = [
  { id: 'kanban', label: 'Kanban',           Icon: Kanban      },
  { id: 'fila',   label: 'Fila Inteligente', Icon: List        },
  { id: 'agenda', label: 'Agenda',           Icon: CalendarDays },
]

export default function ERPOrdensPage() {
  const { rows, isLoading } = useERPRows()
  const {
    erpOrdensView, setERPOrdensView,
    filterEquipe, setFilterEquipe,
    filterTipo, setFilterTipo,
  } = useERPStore()

  const kpis = useMemo(() => {
    const total     = rows.length
    const criticas  = rows.filter(r => r._slaCritico).length
    const semEquipe = rows.filter(r => !r.nomedaequipe).length
    const aging7    = rows.filter(r => (r._aging ?? 0) > 7).length
    return [
      { label: 'Total na Fila',  value: total,     Icon: Layers,        colorCls: 'text-primary',       bgCls: 'bg-primary/10'     },
      { label: 'SLA Crítico',    value: criticas,  Icon: AlertTriangle, colorCls: 'text-red-400',       bgCls: 'bg-red-500/10'     },
      { label: 'Sem Equipe',     value: semEquipe, Icon: Users,         colorCls: 'text-orange-400',    bgCls: 'bg-orange-500/10'  },
      { label: 'Aging > 7 dias', value: aging7,    Icon: Clock,         colorCls: 'text-yellow-400',    bgCls: 'bg-yellow-500/10'  },
    ]
  }, [rows])

  const equipeOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(r => r.nomedaequipe && set.add(r.nomedaequipe as string))
    return Array.from(set).sort()
  }, [rows])

  const hasFilters = filterEquipe || filterTipo

  return (
    <div className="flex flex-col h-full gap-4 p-6 min-h-0 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-headline font-bold text-text">Ordens de Serviço</h1>
          <p className="text-[12px] text-secondary mt-0.5">Gestão operacional · ERP</p>
        </div>

        {/* View switcher */}
        <div className="flex items-center gap-1 bg-elevated border border-white/[0.08] rounded-lg p-1">
          {VIEWS.map(v => {
            const VIcon = v.Icon
            return (
              <button
                key={v.id}
                onClick={() => setERPOrdensView(v.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium
                            transition-all duration-150
                            ${erpOrdensView === v.id
                              ? 'bg-primary/20 text-primary shadow-sm'
                              : 'text-secondary hover:text-text hover:bg-surface/40'}`}
              >
                <VIcon size={13} />{v.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
        {kpis.map(k => {
          const KIcon = k.Icon
          return (
            <div key={k.label}
                 className="bg-elevated border border-white/[0.08] rounded-xl px-4 py-3
                            flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${k.bgCls} flex items-center justify-center flex-shrink-0`}>
                <KIcon size={16} className={k.colorCls} />
              </div>
              <div>
                <p className="text-2xl font-headline font-bold text-text leading-none">{k.value}</p>
                <p className="text-[11px] text-secondary mt-0.5 leading-none">{k.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <Filter size={12} className="text-muted flex-shrink-0" />

        <select
          value={filterEquipe}
          onChange={e => setFilterEquipe(e.target.value)}
          className="text-[12px] bg-elevated border border-white/[0.08] rounded-lg px-3 py-1.5
                     text-secondary focus:outline-none focus:border-primary/40 cursor-pointer"
        >
          <option value="">Todas as equipes</option>
          {equipeOptions.map(eq => (
            <option key={eq} value={eq}>{eq}</option>
          ))}
        </select>

        <div className="flex gap-1 bg-elevated border border-white/[0.08] rounded-lg p-0.5">
          {[
            { value: '',           label: 'Todos' },
            { value: 'INSTALACAO', label: 'Instalação' },
            { value: 'MANUTENCAO', label: 'Manutenção' },
            { value: 'REDE',       label: 'Rede' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterTipo(opt.value)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-150
                          ${filterTipo === opt.value
                            ? 'bg-primary/20 text-primary'
                            : 'text-secondary hover:text-text hover:bg-surface/40'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {hasFilters && (
          <button
            onClick={() => { setFilterEquipe(''); setFilterTipo('') }}
            className="flex items-center gap-1 text-[11px] text-muted hover:text-text
                       px-2 py-1 rounded-md hover:bg-surface/40 transition-colors"
          >
            <X size={11} />Limpar
          </button>
        )}

        <span className="ml-auto text-[11px] text-muted">
          {rows.length.toLocaleString('pt-BR')} ordens carregadas
        </span>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center flex-1 gap-3 text-secondary text-sm">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Carregando ordens…
          </div>
        ) : erpOrdensView === 'kanban' ? (
          <KanbanBoard    equipeFilter={filterEquipe} tipoFilter={filterTipo} />
        ) : erpOrdensView === 'agenda' ? (
          <AgendaView     equipeFilter={filterEquipe} tipoFilter={filterTipo} />
        ) : (
          <FilaInteligente equipeFilter={filterEquipe} tipoFilter={filterTipo} />
        )}
      </div>

    </div>
  )
}
