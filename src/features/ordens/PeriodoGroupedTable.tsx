import { useMemo } from 'react'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
import { Badge } from '../../components/ui/Badge'
import type { OSRow } from '../../lib/types'
import { PERIOD_ORDER } from './ClienteGroupedTable'

export function PeriodoGroupedTable({ rows, density, onRowClick, equipe }: {
  rows: OSRow[]; density: string; onRowClick?: (r: OSRow) => void; equipe?: string
}) {
  const groups = useMemo(() => {
    const map: Record<string, OSRow[]> = {}
    for (const r of rows) {
      const p = (r.periodo || '').trim() || 'Sem Período'
      ;(map[p] = map[p] || []).push(r)
    }
    for (const p of Object.keys(map)) {
      map[p].sort((a, b) => (a.bairro || '').localeCompare(b.bairro || '', 'pt-BR'))
    }
    return Object.entries(map).sort(([a], [b]) => {
      const ia = PERIOD_ORDER.indexOf(a.toLowerCase())
      const ib = PERIOD_ORDER.indexOf(b.toLowerCase())
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [rows])

  const rowPy = density === 'mini' ? 'py-1' : density === 'compact' ? 'py-1.5' : 'py-2.5'

  // Larguras fixas — mesma referência no header e nas linhas
  const C = {
    aging:   'w-14  flex-shrink-0',
    numos:   'w-28  flex-shrink-0',
    cliente: 'w-52  flex-shrink-0',
    cidade:  'w-40  flex-shrink-0',
    bairro:  'w-44  flex-shrink-0',
    logr:    'w-60  flex-shrink-0',
    tipo:    'w-36  flex-shrink-0',
    status:  'flex-shrink-0',
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1200px]">

        {/* Nome da equipe filtrada */}
        {equipe && (
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/[0.05] border-b border-primary/20">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Equipe</span>
            <span className="text-[12px] font-bold text-primary">{shortEquipe(equipe)}</span>
            <span className="text-[11px] text-muted">— {rows.length} OS</span>
          </div>
        )}

        {/* Cabeçalho de colunas */}
        <div className="flex items-center gap-3 px-4 py-2 bg-elevated/40 border-b border-white/[0.08]
                        text-[10px] font-bold uppercase tracking-wide text-muted">
          <span className={`${C.aging}  text-center`}>Aging</span>
          <span className={C.numos}>Nº OS</span>
          <span className={C.cliente}>Cliente</span>
          <span className={C.tipo}>Tipo</span>
          <span className={C.cidade}>Cidade</span>
          <span className={C.bairro}>Bairro</span>
          <span className={C.logr}>Endereço</span>
          <span className={C.status}>Situação</span>
        </div>

        {groups.length === 0 && (
          <p className="px-6 py-10 text-center text-[12px] text-muted italic">
            Nenhuma OS encontrada para esta equipe.
          </p>
        )}

        {groups.map(([periodo, periodoRows], gi) => {
          const isManha = periodo.toLowerCase().includes('manh')
          const isTarde = periodo.toLowerCase().includes('tarde')
          const color   = isManha ? 'text-yellow'          : isTarde ? 'text-indigo-400'          : 'text-secondary'
          const bg      = isManha ? 'bg-yellow/[0.06]'     : isTarde ? 'bg-purple/[0.06]'     : 'bg-surface/30'
          const dot     = isManha ? 'bg-yellow'            : isTarde ? 'bg-purple'            : 'bg-secondary'
          const border  = isManha ? 'border-amber-400/[0.25]' : isTarde ? 'border-indigo-400/[0.25]' : 'border-white/[0.08]'

          return (
            <div key={periodo}>
              {/* Cabeçalho do período */}
              {(() => {
                const inst  = periodoRows.filter(r => r._tipo === 'INSTALACAO').length
                const manut = periodoRows.filter(r => r._tipo === 'MANUTENCAO').length
                const serv  = periodoRows.length - inst - manut
                const tipoItems: { n: number; label: string }[] = [
                  inst  > 0 ? { n: inst,  label: inst  === 1 ? 'Instalação'  : 'Instalações' } : null,
                  manut > 0 ? { n: manut, label: manut === 1 ? 'Manutenção'  : 'Manutenções' } : null,
                  serv  > 0 ? { n: serv,  label: serv  === 1 ? 'Serviço'     : 'Serviços'    } : null,
                ].filter(Boolean) as { n: number; label: string }[]
                return (
                  <div className={`flex items-center gap-2.5 px-4 py-2.5 border-b ${border}
                                  ${gi > 0 ? 'border-t border-white/[0.08]' : ''} ${bg}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                    <span className={`text-[11px] font-bold uppercase tracking-[0.06em] ${color}`}>
                      Período: {periodo}
                    </span>
                    <span className="text-[11px] font-mono text-muted ml-1">— {periodoRows.length} OS</span>
                    <div className="ml-auto flex items-center gap-2">
                      {tipoItems.map(({ n, label }, idx) => (
                        <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted">
                          {idx > 0 && <span className="text-white/20">|</span>}
                          <span className="font-mono font-bold text-secondary">{n}</span>
                          <span>{label}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()}


              {/* Linhas */}
              {(periodoRows as OSRow[]).map((row: OSRow, i: number) => {
                const aging      = row._aging ?? 0
                const agingColor = aging >= 6 ? 'text-red'   : aging >= 3 ? 'text-yellow'  : 'text-cyan'
                const agingBg    = aging >= 6 ? 'bg-red/10'  : aging >= 3 ? 'bg-yellow/10' : 'bg-cyan/10'
                return (
                  <div
                    key={row.numos || i}
                    onClick={() => onRowClick?.(row)}
                    className={`flex items-center gap-3 px-4 ${rowPy} cursor-pointer
                                hover:bg-surface/30 transition-all border-b border-white/[0.03]`}
                  >
                    <span className={`${C.aging} text-center`}>
                      <span className={`inline-block font-mono font-bold text-[11px] rounded-full px-2 py-0.5 ${agingColor} ${agingBg}`}>
                        {aging}d
                      </span>
                    </span>
                    <span className={`${C.numos} font-mono text-[11px] text-secondary`}>
                      {row.numos}
                    </span>
                    <span
                      className={`${C.cliente} text-[12px] ${row.nomecliente ? 'text-text font-medium' : 'text-muted italic'}`}
                      title={(row.nomecliente || row.codigocliente || 'Sem nome no cadastro') as string}
                    >
                      {row.nomecliente || (row.codigocliente ? `Cód. ${row.codigocliente}` : '(Sem nome)')}
                    </span>
                    <span className={`${C.tipo} text-[11px] text-muted`}>
                      {row.tiposervico || '—'}
                    </span>
                    <span className={`${C.cidade} text-[12px] text-muted`} title={row.nomedacidade}>
                      {(row.nomedacidade || '—').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <span className={`${C.bairro} text-[12px] text-secondary`} title={row.bairro}>
                      {(row.bairro || '—').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <span className={`${C.logr} text-[12px] text-muted`}
                          title={[row.logradouro, row.numero, row.complemento].filter(Boolean).join(', ') || '—'}>
                      {[row.logradouro, row.numero, row.complemento].filter(Boolean).join(', ') || '—'}
                    </span>
                    <div className={C.status}>
                      <Badge variant={situacaoVariant(row._situacaoEfetiva)}>
                        {row._situacaoEfetiva}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}

      </div>
    </div>
  )
}

