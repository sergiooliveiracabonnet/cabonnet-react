import type { ReactNode } from 'react'
import { Modal }  from '../../../components/ui/Modal'
import { Badge }  from '../../../components/ui/Badge'
import { shortEquipe, situacaoVariant } from '../../../lib/osFormat'
import type { OSRow } from '../../../lib/types'


export function OSListModal({ open, onClose, title, rows = [] as OSRow[], color = '#3b82f6' }: {
  open: boolean; onClose: () => void; title: string; rows?: OSRow[]; color?: string
}) {
  if (!open) return null
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="780px">
      <div className="flex flex-col" style={{ maxHeight: '72vh' }}>
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.08] flex-shrink-0">
          <span className="text-[12px] font-semibold" style={{ color }}>
            {rows.length} {rows.length === 1 ? 'ordem' : 'ordens'}
          </span>
        </div>
        <div className="grid grid-cols-[80px_1fr_110px_110px_55px] gap-3 px-5 py-2
                        bg-surface/20 border-b border-white/[0.05] flex-shrink-0
                        text-[10px] font-bold uppercase tracking-[0.05em] text-muted">
          <span>OS #</span><span>Cliente</span><span>Cidade</span><span>Equipe</span>
          <span className="text-right">Aging</span>
        </div>
        <div className="overflow-y-auto flex-1">
          {rows.length === 0
            ? <div className="px-5 py-10 text-center text-[12px] text-muted">Nenhuma OS encontrada</div>
            : <div className="divide-y divide-white/[0.04]">
                {rows.map(r => {
                  const aging = r._agingAbertura ?? 0
                  const agClr = aging >= 6 ? '#f87171' : aging >= 3 ? '#f97316' : '#94a3b8'
                  return (
                    <div key={r.numos}
                         className="grid grid-cols-[80px_1fr_110px_110px_55px] gap-3
                                    px-5 py-2.5 items-center hover:bg-surface/20 transition-colors">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono font-bold text-[11px]" style={{ color }}>{r.numos}</span>
                        <Badge variant={situacaoVariant(r.descsituacao)} className="text-[9px] px-1.5 py-px w-fit">
                          {(r.descsituacao || '—').replace('Concluída/Sem Execução', 'S/Exec')}
                        </Badge>
                      </div>
                      <span className="text-[12px] font-semibold text-text truncate">{r.nomecliente || '—'}</span>
                      <span className="text-[11px] text-secondary truncate">{r.nomedacidade || '—'}</span>
                      <span className="text-[11px] text-muted truncate">{shortEquipe(r.nomedaequipe) || '—'}</span>
                      <span className="font-mono font-bold text-[12px] text-right" style={{ color: agClr }}>{aging}d</span>
                    </div>
                  )
                })}
              </div>}
        </div>
      </div>
    </Modal>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────


export function Section({ title, subtitle, action, children, height = 'h-64' }: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode; height?: string
}) {
  return (
    <div className="bg-elevated border border-white/[0.08] rounded-xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] flex-shrink-0">
        <div>
          <p className="text-[13px] font-semibold text-text">{title}</p>
          {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={`${height} p-4`}>
        {children}
      </div>
    </div>
  )
}

// ── RelatoriosPage ────────────────────────────────────────────────────────────


export function Empty({ label = 'Sem dados' }) {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-sm text-muted/40">{label}</p>
    </div>
  )
}
