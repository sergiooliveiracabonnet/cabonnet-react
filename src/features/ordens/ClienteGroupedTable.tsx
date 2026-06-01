import { useMemo } from 'react'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
import { Badge } from '../../components/ui/Badge'
import type { OSRow } from '../../lib/types'

export const PERIOD_ORDER = ['manhã', 'tarde']

// ── Agrupamento por cliente — Timeline visual ─────────────────────────────────

function _parseDateStr(s: string | null | undefined): Date | null {
  if (!s) return null
  const p = s.split(' ')[0].split(/[/-]/)
  if (p.length < 3) return null
  // Suporta DD/MM/YYYY e YYYY-MM-DD
  const [a, b, c] = p
  const dt = a.length === 4
    ? new Date(+a, +b - 1, +c)        // YYYY-MM-DD
    : new Date(+c, +b - 1, +a)        // DD/MM/YYYY
  return isNaN(dt.getTime()) ? null : dt
}

function _computeGap(prev: OSRow | null, curr: OSRow): number | null {
  if (!prev) return null
  const prevClose = _parseDateStr(prev.dataexecucao || prev.databaixa)
  const currOpen  = _parseDateStr(curr.datacadastro)
  if (!prevClose || !currOpen) return null
  const dias = Math.floor((currOpen.getTime() - prevClose.getTime()) / 86400000)
  return dias >= 0 ? dias : null
}

function _dotColor(situacao: string | null | undefined): string {
  if (!situacao) return 'bg-muted/40'
  if (situacao === 'Concluída') return 'bg-green'
  if (situacao === 'Atendimento' || situacao === 'Reagendamento') return 'bg-cyan'
  return 'bg-yellow'
}

function _revisitaBadge(gapDias: number | null): { variant: string; label: string } | null {
  if (gapDias == null || gapDias > 30) return null
  if (gapDias < 7)  return { variant: 'red',    label: `Revisita ${gapDias}d` }
  if (gapDias < 15) return { variant: 'orange',  label: `Revisita ${gapDias}d` }
  return               { variant: 'yellow',  label: `Revisita ${gapDias}d` }
}

export function ClienteGroupedTable({ rows, density, onRowClick }: {
  rows: OSRow[]; density: string; onRowClick?: (r: OSRow) => void
}) {
  const showGap = density !== 'mini'

  const groups = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      const key = r.codigocliente || r.nomecliente || '(Sem cliente)'
      if (!map.has(key)) map.set(key, { nome: r.nomecliente || key, codigo: r.codigocliente, rows: [] })
      map.get(key).rows.push(r)
    }
    return [...map.values()]
      .map(g => {
        // Ordenar cronologicamente por datacadastro asc
        const sorted = [...g.rows].sort((a, b) => {
          const da = _parseDateStr(a.datacadastro)?.getTime() ?? 0
          const db = _parseDateStr(b.datacadastro)?.getTime() ?? 0
          return da - db
        })
        // Contar revisitas (gap < 30d)
        let nRevisitas = 0
        for (let i = 1; i < sorted.length; i++) {
          const gap = _computeGap(sorted[i - 1], sorted[i])
          if (gap != null && gap < 30) nRevisitas++
        }
        return { ...g, sorted, nRevisitas }
      })
      .sort((a, b) => b.rows.length - a.rows.length)
  }, [rows])

  if (groups.length === 0) {
    return <p className="px-6 py-10 text-center text-[12px] text-muted italic">Nenhuma OS encontrada.</p>
  }

  return (
    <div className="divide-y divide-white/[0.04]">
      {groups.map((g) => {
        const primeiraData = g.sorted[0]?.datacadastro?.split(' ')[0] ?? '—'
        const ultimaData   = g.sorted[g.sorted.length - 1]?.datacadastro?.split(' ')[0] ?? '—'

        return (
          <div key={g.codigo || g.nome}>
            {/* Header do grupo */}
            <div className="flex items-center gap-2 px-4 py-2 bg-elevated/40 border-b border-white/[0.05]">
              <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                <span className="text-[12px] font-bold text-text truncate">{g.nome}</span>
                {g.codigo && (
                  <span className="text-[10px] text-muted font-mono flex-shrink-0">#{g.codigo}</span>
                )}
                {g.rows.length > 1 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full badge-orange flex-shrink-0">
                    {g.rows.length} OS
                  </span>
                )}
                {g.nRevisitas > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full badge-red flex-shrink-0">
                    {g.nRevisitas} revisita{g.nRevisitas > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted flex-shrink-0">
                {primeiraData}{primeiraData !== ultimaData ? ` → ${ultimaData}` : ''}
              </span>
            </div>

            {/* Timeline */}
            {g.sorted.length === 1 ? (
              /* Caso simples: 1 OS — linha plana sem rail */
              <button
                key={g.sorted[0].numos}
                className="w-full text-left flex items-center gap-3 px-4 py-2.5
                           hover:bg-primary/[0.04] border-b border-white/[0.03]
                           transition-colors text-[11px] cursor-pointer"
                onClick={() => onRowClick?.(g.sorted[0])}
              >
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${_dotColor(g.sorted[0]._situacaoEfetiva)}`} />
                <span className="font-mono text-primary w-20 flex-shrink-0">{g.sorted[0].numos}</span>
                <span className="text-muted w-28 flex-shrink-0">{g.sorted[0].datacadastro?.split(' ')[0] ?? '—'}</span>
                <span className="text-secondary truncate flex-1 min-w-0">{g.sorted[0].tiposervico ?? '—'}</span>
                <span className="text-muted flex-shrink-0">{shortEquipe(g.sorted[0].nomedaequipe) || '—'}</span>
                <Badge variant={situacaoVariant(g.sorted[0]._situacaoEfetiva)} className="flex-shrink-0">
                  {g.sorted[0]._situacaoEfetiva}
                </Badge>
              </button>
            ) : (
              /* Timeline com rail vertical */
              <div className="relative pl-[46px] pr-4">
                {/* Rail vertical */}
                <div className="absolute left-[22px] top-0 bottom-0 w-px bg-surface" />

                {g.sorted.map((r: OSRow, i: number) => {
                  const gap    = _computeGap(g.sorted[i - 1], r)
                  const badge  = _revisitaBadge(gap)
                  const isLast = i === g.sorted.length - 1
                  const ativo  = r._situacaoEfetiva !== 'Concluída'
                  const dotCls = _dotColor(r._situacaoEfetiva)

                  return (
                    <div key={r.numos}>
                      {/* Conector de gap entre OS */}
                      {i > 0 && showGap && (
                        <div className="flex items-center gap-2 py-1 text-[9px] text-muted/50">
                          {gap != null ? `${gap}d depois` : ''}
                          {badge && (
                            <Badge variant={badge.variant} className="text-[9px] px-1 py-px">
                              {badge.label}
                            </Badge>
                          )}
                        </div>
                      )}
                      {i > 0 && !showGap && badge && (
                        <div className="py-0.5">
                          <Badge variant={badge.variant} className="text-[9px] px-1 py-px">{badge.label}</Badge>
                        </div>
                      )}

                      {/* Linha da OS */}
                      <button
                        className="relative w-full text-left flex items-center gap-3 py-2
                                   hover:bg-primary/[0.04] transition-colors text-[11px] cursor-pointer"
                        onClick={() => onRowClick?.(r)}
                      >
                        {/* Dot no rail */}
                        <span className={`absolute -left-[28px] top-1/2 -translate-y-1/2
                                          w-3 h-3 rounded-full ring-2 ring-card flex-shrink-0
                                          ${dotCls} ${isLast && ativo ? 'animate-pulse' : ''}`} />

                        <span className="font-mono text-primary w-20 flex-shrink-0">{r.numos}</span>
                        <span className="text-muted w-28 flex-shrink-0 text-[10px]">
                          {r.datacadastro?.split(' ')[0] ?? '—'}
                        </span>
                        <span className="text-secondary truncate flex-1 min-w-0">{r.tiposervico ?? '—'}</span>
                        <span className="text-muted text-[10px] flex-shrink-0 hidden sm:block">
                          {shortEquipe(r.nomedaequipe) || '—'}
                        </span>
                        <Badge variant={situacaoVariant(r._situacaoEfetiva)} className="flex-shrink-0 text-[9px]">
                          {r._situacaoEfetiva}
                        </Badge>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

