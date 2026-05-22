import { useLayoutEffect, useRef, useState } from 'react'
import { AlertTriangle, Calendar, Clock, FileText, MapPin, Users, Wrench } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { situacaoVariant, shortEquipe } from '../../lib/osFormat'
import type { OSRow } from '../../lib/types'

interface OSHoverCardProps {
  os?:         OSRow | null
  anchorRect?: DOMRect | null
}

export function OSHoverCard({ os, anchorRect }: OSHoverCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: -9999, left: -9999, opacity: 0 })

  // Measure card after render and calculate fixed position relative to the row
  useLayoutEffect(() => {
    if (!os || !anchorRect || !cardRef.current) return
    const { width: cw, height: ch } = cardRef.current.getBoundingClientRect()
    const gap = 12
    const vw  = window.innerWidth
    const vh  = window.innerHeight

    // Prefer right side; fall back to left
    let left = anchorRect.right + gap
    if (left + cw > vw - 8) left = anchorRect.left - cw - gap
    left = Math.max(8, left)

    // Center vertically on the row, clamped to viewport
    let top = anchorRect.top + anchorRect.height / 2 - ch / 2
    top = Math.max(8, Math.min(top, vh - ch - 8))

    setPos({ top, left, opacity: 1 })
  }, [os, anchorRect])

  if (!os) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o: any = os

  const sit      = o._situacaoEfetiva ?? o.descsituacao
  const agingVar = (o._aging ?? 0) >= 6 ? 'red' : (o._aging ?? 0) >= 3 ? 'yellow' : 'cyan'
  const equipe   = shortEquipe(o.nomedaequipe)
  const loc      = [o.nomedacidade, o.bairro].filter(Boolean).join(' · ')
  const address  = [o.logradouro || o.enderecoconexao, o.numero, o.complemento]
                     .filter(Boolean).join(', ')
  const agend    = o.dataagendamento
                     ? o.dataagendamento.slice(0, 10).split('-').reverse().join('/')
                     : null
  const obsCrit  = o.observacaocritica || null
  const obs      = o.observacoes || o.obs || o.observacao || o.nota || o.descricao_obs || null

  return (
    <div
      ref={cardRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, opacity: pos.opacity, width: 320, zIndex: 590 }}
      className="bg-elevated border border-white/[0.13] rounded-xl shadow-2xl
                 transition-opacity duration-fast pointer-events-none overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2.5 border-b border-white/[0.07]">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text leading-none">OS #{o.numos}</p>
          <p className="text-[11px] text-muted truncate mt-1">{o.nomecliente || '—'}</p>
        </div>
        <Badge variant={situacaoVariant(sit)} className="text-[11px] flex-shrink-0 mt-0.5">
          {sit ?? '—'}
        </Badge>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2.5">

        {/* Location */}
        {(loc || address) && (
          <div className="flex gap-2 items-start">
            <MapPin size={11} className="text-muted flex-shrink-0 mt-px" />
            <div className="min-w-0">
              {loc     && <p className="text-[11px] font-semibold text-muted truncate">{loc}</p>}
              {address && <p className="text-[11px] text-secondary truncate">{address}</p>}
            </div>
          </div>
        )}

        {/* Service type + Team */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex gap-1.5 items-start">
            <Wrench size={10} className="text-muted flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-secondary truncate">{o.tiposervico || '—'}</p>
          </div>
          <div className="flex gap-1.5 items-start">
            <Users size={10} className="text-muted flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-secondary truncate">{equipe}</p>
          </div>
        </div>

        {/* Aging + Scheduled date + Period */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Clock size={10} className="text-muted" />
            <span className="text-[11px] text-muted">Aging:</span>
            <Badge variant={agingVar} className="text-[11px] px-1.5 py-0 leading-[1.6]">
              {o._aging ?? 0}d
            </Badge>
          </div>
          {agend && (
            <div className="flex items-center gap-1.5">
              <Calendar size={10} className="text-muted" />
              <span className="text-[11px] text-secondary">{agend}</span>
              {(o.periodo || o.horaatendimento) && (
                <span className="text-[11px] text-muted/70">
                  · {[o.periodo, o.horaatendimento ? `${o.horaatendimento}h` : ''].filter(Boolean).join(' ')}
                </span>
              )}
            </div>
          )}
          {!agend && (
            <span className="text-[11px] text-muted/50">Sem agendamento</span>
          )}
        </div>

        {/* Critical observation */}
        {obsCrit && (
          <div className="flex gap-2 bg-red/[0.07] border border-red/[0.20] rounded-xl px-2.5 py-2">
            <AlertTriangle size={10} className="text-red flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-red/90 line-clamp-2 leading-relaxed">{obsCrit}</p>
          </div>
        )}

        {/* Regular observation */}
        {obs && (
          <div className="flex gap-2 bg-white/[0.03] border border-white/[0.08] rounded-xl px-2.5 py-2">
            <FileText size={10} className="text-muted flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-secondary line-clamp-3 leading-relaxed">{obs}</p>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 pb-3 flex justify-end">
        <span className="inline-flex items-center gap-1.5 text-[10px] text-muted/40">
          <kbd className="bg-white/[0.05] border border-white/[0.08] rounded px-1.5 py-0.5 font-mono leading-none">↵</kbd>
          ver detalhes
        </span>
      </div>
    </div>
  )
}
