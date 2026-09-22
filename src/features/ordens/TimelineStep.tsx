import { useState, type ComponentType } from 'react'
import { CaretRight, Calendar, Users, Clock, Package, ArrowCounterClockwise, ChatText, ArrowRight } from '@phosphor-icons/react'
import { Badge } from '../../components/ui/Badge'

interface TimelineNodeProps {
  icon:    ComponentType<{ size?: number; className?: string }>
  color:   string
  filled?: boolean
}

function TimelineNode({ icon: Icon, color, filled }: TimelineNodeProps) {
  const base = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2'
  const cls  = filled
    ? `${base} border-${color} bg-${color}/15 text-${color}`
    : `${base} border-subtle bg-surface/30 text-muted/50`
  return <div className={cls}><Icon size={14} /></div>
}

interface HistoricoEntry { autor?: string; data?: string; hora?: string; isReagend?: boolean; texto?: string }
interface Material       { quantidade?: string | number; nome?: string; id?: string }
interface StepDetails {
  obs?:           string
  nomeTecnico?:   string
  equipeAgendada?: string
  duracao?:       string
  periodo?:       string
  hora?:          string
  servico?:       string
  contrato?:      string
  equipeReagend?: string
  reagendada?:    boolean
  historico?:     HistoricoEntry[]
  materiais?:     Material[]
  matRetirados?:  Material[]
}

interface TimelineStepProps {
  icon:    ComponentType<{ size?: number; className?: string }>
  color:   string
  label:   string
  date?:   string | null
  equipe?: string | null
  obs?:    string | null
  /** Quando a ação foi de fato registrada (polling) — distinto de `date`, que é
   *  a data/hora para a qual a OS ficou agendada e costuma vir sem horário. */
  registradoEm?: string | null
  details?: StepDetails
  isLast?: boolean
  done?:   boolean
}

export function TimelineStep({ icon, color, label, date, equipe, obs, registradoEm, details, isLast, done }: TimelineStepProps) {
  const [open, setOpen] = useState(false)

  const d = details || {}
  // Fatos rápidos ficam sempre visíveis, como pills — só o que é lista longa ou
  // texto extenso (serviço, histórico, materiais) fica atrás de "Ver detalhes".
  const pills: { label: string; value: string; mono?: boolean }[] = []
  if (d.nomeTecnico) pills.push({ label: 'Técnico',  value: d.nomeTecnico })
  if (d.duracao)     pills.push({ label: 'Duração',  value: d.duracao })
  if (d.hora)        pills.push({ label: 'Hora',     value: d.hora })
  if (d.periodo)     pills.push({ label: 'Período',  value: d.periodo })
  if (d.contrato)    pills.push({ label: 'Contrato', value: d.contrato, mono: true })

  const hasMore = !!(
    d.servico ||
    ((d.historico?.length ?? 0) > 0) ||
    ((d.materiais?.length ?? 0) > 0) || ((d.matRetirados?.length ?? 0) > 0)
  )
  const timestamp = registradoEm || date

  return (
    <div className="flex gap-3">
      {/* Nó + linha vertical */}
      <div className="flex flex-col items-center">
        <TimelineNode icon={icon} color={color} filled={done} />
        {!isLast && (
          <div className={`w-px flex-1 my-1 min-h-[20px] ${done ? 'bg-primary/25' : 'bg-surface'}`} />
        )}
      </div>

      {/* Cartão do evento */}
      <div className={`flex-1 min-w-0 rounded-xl border border-subtle bg-surface/20 px-3.5 py-3 ${isLast ? 'mb-0' : 'mb-3'}`}>

        {/* Cabeçalho: título + horário */}
        <div className="flex items-start justify-between gap-3">
          <p className={`text-label font-semibold leading-snug ${done ? `text-${color}` : 'text-muted'}`}>
            {label}
          </p>
          {timestamp && (
            <span className="flex-shrink-0 font-mono text-caption text-muted/70 whitespace-nowrap">
              {timestamp}
            </span>
          )}
        </div>

        {/* Subtítulo: equipe · data-alvo (quando difere do horário registrado) · badges */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {equipe && (
            <span className="inline-flex items-center gap-1 text-caption text-secondary">
              <Users size={9} className="opacity-50 flex-shrink-0" />
              {equipe}
            </span>
          )}
          {date && registradoEm && date !== registradoEm && (
            <>
              {equipe && <span className="text-muted/30">·</span>}
              <span className="inline-flex items-center gap-1 text-caption text-muted">
                <Calendar size={9} className="opacity-50 flex-shrink-0" />
                agendado p/ {date}
              </span>
            </>
          )}
          {d.reagendada === true && <Badge variant="orange" dot={false}>reagendada</Badge>}
        </div>

        {/* Pills de fatos rápidos */}
        {pills.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {pills.map(p => <InfoPill key={p.label} {...p} />)}
          </div>
        )}

        {/* Troca de equipe — agendada vs. executante */}
        {d.equipeAgendada && (
          <div className="mt-2.5 bg-yellow/[0.07] border border-yellow/20 rounded-xl px-3 py-2.5">
            <p className="text-caption font-bold uppercase tracking-label text-yellow/80 mb-1.5 flex items-center gap-1.5">
              <Users size={10} /> Equipe diferente da agendada
            </p>
            <div className="flex items-center gap-2 text-caption">
              <span className="text-secondary font-medium">{d.equipeAgendada}</span>
              <ArrowRight size={10} className="text-muted/50" />
              <span className="text-secondary font-medium">{equipe ?? '—'}</span>
            </div>
          </div>
        )}

        {/* Obs inline */}
        {obs && (
          <div className="mt-2.5 bg-surface/30 border border-subtle rounded-xl px-3 py-2">
            <p className="text-caption text-secondary leading-relaxed">{obs}</p>
          </div>
        )}

        {/* Ver detalhes */}
        {hasMore && (
          <button
            onClick={() => setOpen(v => !v)}
            className="mt-2.5 inline-flex items-center gap-1 text-caption font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            {open ? 'Ocultar detalhes' : 'Ver detalhes'}
            <CaretRight size={10} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        )}

        {/* Painel expandido */}
        {open && hasMore && (
          <div className="mt-2.5 space-y-2.5">

            {/* Serviço */}
            {d.servico && (
              <InfoBlock label="Serviço" text={d.servico!} />
            )}

            {/* Histórico de notas / reagendamentos */}
            {(d.historico?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <p className="text-caption font-bold uppercase tracking-label text-muted flex items-center gap-1.5">
                  <ChatText size={10} /> Histórico de ocorrências
                </p>
                {d.historico!.map((entry, i) => (
                  <div
                    key={i}
                    className={`rounded-xl px-3 py-2.5 border ${
                      entry.isReagend
                        ? 'bg-orange/[0.08] border-orange/25'
                        : 'bg-surface/30 border-subtle'
                    }`}
                  >
                    {/* Cabeçalho da entrada */}
                    {(entry.autor || entry.data) && (
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {entry.isReagend && (
                          <span className="flex items-center gap-1 text-caption font-bold uppercase tracking-wide text-orange/80">
                            <ArrowCounterClockwise size={9} /> Reagendamento
                          </span>
                        )}
                        {entry.autor && (
                          <span className="text-caption font-semibold text-muted">{entry.autor}</span>
                        )}
                        {entry.data && (
                          <span className="font-mono text-caption text-muted/60">{entry.data}{entry.hora ? ` ${entry.hora}` : ''}</span>
                        )}
                      </div>
                    )}
                    <p className={`text-caption leading-relaxed whitespace-pre-wrap ${
                      entry.isReagend ? 'text-orange/90' : 'text-secondary'
                    }`}>
                      {entry.texto}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Materiais utilizados */}
            {(d.materiais?.length ?? 0) > 0 && (
              <div className="bg-surface/30 border border-subtle rounded-xl px-3 py-2.5">
                <p className="text-caption font-bold uppercase tracking-label text-muted mb-2 flex items-center gap-1.5">
                  <Package size={10} /> Materiais utilizados
                </p>
                <div className="space-y-1">
                  {d.materiais!.map((m, i) => (
                    <div key={i} className="flex items-baseline gap-2">
                      <span className="text-caption text-cyan font-mono font-semibold min-w-[28px] text-right">{m.quantidade}×</span>
                      <span className="text-caption text-secondary leading-snug flex-1">{m.nome}</span>
                      {m.id && <span className="text-caption text-muted font-mono">{m.id}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Materiais retirados */}
            {(d.matRetirados?.length ?? 0) > 0 && (
              <div className="bg-red/[0.05] border border-red/15 rounded-xl px-3 py-2.5">
                <p className="text-caption font-bold uppercase tracking-label text-red/70 mb-2 flex items-center gap-1.5">
                  <Package size={10} /> Materiais retirados
                </p>
                <div className="space-y-1">
                  {d.matRetirados!.map((m, i) => (
                    <div key={i} className="flex items-baseline gap-2">
                      <span className="text-caption text-red/70 font-mono font-semibold min-w-[28px] text-right">{m.quantidade}×</span>
                      <span className="text-caption text-secondary/80 leading-snug flex-1">{m.nome}</span>
                      {m.id && <span className="text-caption text-muted font-mono">{m.id}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

function InfoPill({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-subtle bg-surface/40 px-2.5 py-1 text-caption">
      <Clock size={9} className="text-muted/40 flex-shrink-0" />
      <span className="text-muted">{label}</span>
      <span className={`font-semibold text-text ${mono ? 'font-mono' : ''}`}>{value}</span>
    </span>
  )
}

function InfoBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="bg-surface/30 border border-subtle rounded-xl px-3 py-2.5">
      <p className="text-caption font-bold uppercase tracking-label text-muted mb-1">{label}</p>
      <p className="text-caption text-secondary leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  )
}
