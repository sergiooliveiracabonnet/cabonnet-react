import { useMemo, useState } from 'react'
import {
  AlertTriangle, Clock, User, ChevronUp, ChevronDown,
  Package, Wrench, Network, MapPin, TrendingUp,
} from 'lucide-react'
import { useERPRows } from '../useERPRows'
import { shortEquipe } from '../../../lib/osFormat'

const RISCO_LEVELS = [
  { min: 70, label: 'Crítico', cls: 'bg-red/20 text-red border-red/30',     bar: 'bg-red',     row: 'hover:bg-red/[0.03]' },
  { min: 40, label: 'Alto',    cls: 'bg-orange/20 text-orange border-orange/30', bar: 'bg-orange',  row: 'hover:bg-orange/[0.03]' },
  { min: 20, label: 'Médio',   cls: 'bg-yellow/20 text-yellow border-yellow/30', bar: 'bg-yellow',  row: 'hover:bg-yellow/[0.03]' },
  { min: 0,  label: 'Baixo',   cls: 'bg-green/20 text-green border-green/30', bar: 'bg-green', row: 'hover:bg-surface/20' },
]

function getRiscoLevel(score: any) {
  return RISCO_LEVELS.find(l => score >= l.min) || RISCO_LEVELS[3]
}

const TIPO_ICON = {
  INSTALACAO: { Icon: Package, cls: 'text-primary',    label: 'Instalação' },
  MANUTENCAO: { Icon: Wrench,  cls: 'text-orange',  label: 'Manutenção' },
  REDE:       { Icon: Network, cls: 'text-green', label: 'Rede' },
}

export function FilaInteligente({ equipeFilter, tipoFilter }: { equipeFilter: string; tipoFilter: string }) {
  const { rows }  = useERPRows()
  const [sortDir, setSortDir] = useState('desc')

  const sorted = useMemo(() => {
    let r = rows.filter(row => {
      const s = (row.descsituacao || '').toLowerCase()
      if (s.includes('conclu') || s.includes('cancel')) return false
      if (equipeFilter && !row.nomedaequipe?.includes(equipeFilter)) return false
      if (tipoFilter   && row._tipo !== tipoFilter) return false
      return true
    })
    return r
      .sort((a, b) => sortDir === 'desc' ? b._riskScore - a._riskScore : a._riskScore - b._riskScore)
  }, [rows, equipeFilter, tipoFilter, sortDir])

  const buckets = useMemo(() => ({
    critico: sorted.filter(r => r._riskScore >= 70).length,
    alto:    sorted.filter(r => r._riskScore >= 40 && r._riskScore < 70).length,
    medio:   sorted.filter(r => r._riskScore >= 20 && r._riskScore < 40).length,
    baixo:   sorted.filter(r => r._riskScore < 20).length,
  }), [sorted])

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {/* Summary + sort */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm text-text font-semibold">
            <TrendingUp size={15} className="text-primary" />
            {sorted.length} OS na fila
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            {[
              { label: 'Crítico', count: buckets.critico, cls: 'bg-red/15 text-red' },
              { label: 'Alto',    count: buckets.alto,    cls: 'bg-orange/15 text-orange' },
              { label: 'Médio',   count: buckets.medio,   cls: 'bg-yellow/15 text-yellow' },
              { label: 'Baixo',   count: buckets.baixo,   cls: 'bg-green/15 text-green' },
            ].map(b => b.count > 0 && (
              <span key={b.label} className={`px-2 py-0.5 rounded-full font-semibold ${b.cls}`}>
                {b.count} {b.label}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1.5 text-[11px] text-secondary hover:text-text
                     px-3 py-1.5 rounded-lg hover:bg-surface/40 border border-white/[0.08]
                     transition-all duration-150"
        >
          {sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          Risco {sortDir === 'desc' ? '↓' : '↑'}
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-white/[0.08] min-h-0">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0 z-10 bg-elevated border-b border-white/[0.08]">
            <tr>
              {['Prioridade', 'OS', 'Cliente', 'Tipo', 'Equipe', 'Cidade', 'Aging', 'SLA'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-muted font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const level = getRiscoLevel(row._riskScore)
              const tipoInfo = (TIPO_ICON as Record<string, { Icon: any; cls: string; label: string }>)[row._tipo as string] || { Icon: AlertTriangle, cls: 'text-muted', label: row._tipo || '—' }
              const TipoIcon = tipoInfo.Icon
              const aging = row._aging ?? row._agingAbertura ?? 0

              return (
                <tr key={row.numos}
                    className={`border-b border-white/[0.04] transition-colors ${level.row}`}>
                  {/* Priority */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-1 h-8 rounded-full flex-shrink-0 ${level.bar}`} />
                      <div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${level.cls}`}>
                          {level.label}
                        </span>
                        <div className="mt-1 w-16 h-1 bg-surface rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${level.bar}`}
                               style={{ width: `${row._riskScore}%` }} />
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* OS */}
                  <td className="px-4 py-2.5 font-mono text-[11px] text-primary/80 whitespace-nowrap">
                    #{row.numos}
                  </td>

                  {/* Cliente */}
                  <td className="px-4 py-2.5 text-text max-w-[160px] truncate">
                    {row.nomecliente || '—'}
                  </td>

                  {/* Tipo */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <TipoIcon size={11} className={tipoInfo.cls} />
                      <span className="text-secondary">{tipoInfo.label}</span>
                    </div>
                  </td>

                  {/* Equipe */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {row.nomedaequipe ? (
                      <span className="text-secondary text-[11px]">
                        {shortEquipe(row.nomedaequipe).split(' - ')[0]}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-red">
                        <User size={10} />Sem equipe
                      </span>
                    )}
                  </td>

                  {/* Cidade */}
                  <td className="px-4 py-2.5 text-secondary whitespace-nowrap">
                    {row.nomedacidade ? (
                      <span className="flex items-center gap-1">
                        <MapPin size={10} className="text-muted" />
                        {row.nomedacidade}
                      </span>
                    ) : '—'}
                  </td>

                  {/* Aging */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`flex items-center gap-1 text-[11px] font-medium
                      ${aging > 7 ? 'text-red' : aging > 3 ? 'text-orange' : 'text-secondary'}`}>
                      <Clock size={10} />{aging}d
                    </span>
                  </td>

                  {/* SLA */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`text-[11px] font-semibold ${
                      row._slaCritico  ? 'text-red' :
                      row._slaExcedido ? 'text-orange' : 'text-green'
                    }`}>
                      {row._slaCritico ? 'Crítico' : row._slaExcedido ? 'Excedido' : 'OK'}
                    </span>
                  </td>
                </tr>
              )
            })}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-muted text-sm">
                  Nenhuma OS na fila com os filtros aplicados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
