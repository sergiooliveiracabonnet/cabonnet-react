import { useState, type ComponentType } from 'react'
import { Calendar, Users, Clock, ChevronDown, ChevronRight, Wrench, Package, RotateCcw, MessageSquare } from 'lucide-react'

interface TimelineNodeProps {
  icon:    ComponentType<{ size?: number; className?: string }>
  color:   string
  filled?: boolean
}

function TimelineNode({ icon: Icon, color, filled }: TimelineNodeProps) {
  const base = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2'
  const cls  = filled
    ? `${base} border-${color} bg-${color}/15 text-${color}`
    : `${base} border-border bg-surface/30 text-muted/50`
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
  details?: StepDetails
  isLast?: boolean
  done?:   boolean
}

export function TimelineStep({ icon, color, label, date, equipe, obs, details, isLast, done }: TimelineStepProps) {
  const [open, setOpen] = useState(false)

  const d = details || {}
  const hasExtra = !!(
    d.obs || d.nomeTecnico || d.equipeAgendada || d.duracao ||
    d.periodo || d.hora || d.servico || d.contrato ||
    d.equipeReagend || d.reagendada === true ||
    ((d.historico?.length ?? 0) > 0) ||
    ((d.materiais?.length ?? 0) > 0) || ((d.matRetirados?.length ?? 0) > 0)
  )

  return (
    <div className="flex gap-3">
      {/* Nó + linha vertical */}
      <div className="flex flex-col items-center">
        <TimelineNode icon={icon} color={color} filled={done} />
        {!isLast && (
          <div className={`w-px flex-1 my-1 min-h-[20px] ${done ? 'bg-primary/25' : 'bg-surface'}`} />
        )}
      </div>

      {/* Conteúdo */}
      <div className={`flex-1 min-w-0 ${isLast ? 'pb-0' : 'pb-4'}`}>

        {/* Cabeçalho — clicável se há detalhes */}
        <button
          onClick={() => hasExtra && setOpen(v => !v)}
          disabled={!hasExtra}
          className={`w-full text-left flex items-center gap-1 ${hasExtra ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        >
          <p className={`text-[12px] font-semibold leading-snug flex-1 ${done ? `text-${color}` : 'text-muted'}`}>
            {label}
            {d.reagendada === true && (
              <span className="ml-1.5 text-[10px] font-bold text-orange/80 uppercase tracking-wide">· reagendada</span>
            )}
          </p>
          {hasExtra && (
            open
              ? <ChevronDown  size={11} className="text-muted/50 flex-shrink-0" />
              : <ChevronRight size={11} className="text-muted/50 flex-shrink-0" />
          )}
        </button>

        {/* Data + equipe */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          {date && (
            <span className="font-mono text-[11px] text-secondary flex items-center gap-1">
              <Calendar size={9} className="opacity-50 flex-shrink-0" />
              {date}
            </span>
          )}
          {equipe && (
            <span className="text-[11px] text-muted flex items-center gap-1">
              <Users size={9} className="opacity-50 flex-shrink-0" />
              {equipe}
            </span>
          )}
        </div>

        {/* Obs inline quando fechado */}
        {obs && !open && (
          <div className="mt-1.5 bg-surface/30 border border-white/[0.08] rounded-xl px-3 py-2">
            <p className="text-[11px] text-secondary leading-relaxed">{obs}</p>
          </div>
        )}

        {/* Painel expandido */}
        {open && hasExtra && (
          <div className="mt-2 space-y-2.5">

            {/* Metadados em linha */}
            {(d.nomeTecnico || d.duracao || d.hora || d.periodo || d.contrato) && (
              <div className="bg-surface/30 border border-white/[0.08] rounded-xl px-3 py-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                {d.nomeTecnico && <Meta icon={Wrench}    label="Técnico"   value={d.nomeTecnico} />}
                {d.duracao     && <Meta icon={Clock}     label="Duração"   value={d.duracao} />}
                {d.hora        && <Meta icon={Clock}     label="Hora"      value={d.hora} />}
                {d.periodo     && <Meta icon={Clock}     label="Período"   value={d.periodo} />}
                {d.contrato    && <Meta icon={Calendar}  label="Contrato"  value={d.contrato} mono />}
              </div>
            )}

            {/* Troca de equipe — agendada vs. executante */}
            {d.equipeAgendada && (
              <div className="bg-yellow/[0.07] border border-yellow/20 rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-yellow/80 mb-1.5 flex items-center gap-1.5">
                  <Users size={10} /> Equipe diferente da agendada
                </p>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-muted">Agendada:</span>
                  <span className="text-secondary font-medium">{d.equipeAgendada}</span>
                </div>
              </div>
            )}

            {/* Serviço */}
            {d.servico && (
              <InfoBlock label="Serviço" text={d.servico!} />
            )}

            {/* Histórico de notas / reagendamentos */}
            {(d.historico?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted flex items-center gap-1.5">
                  <MessageSquare size={10} /> Histórico de ocorrências
                </p>
                {d.historico!.map((entry, i) => (
                  <div
                    key={i}
                    className={`rounded-xl px-3 py-2.5 border ${
                      entry.isReagend
                        ? 'bg-orange/[0.08] border-orange/25'
                        : 'bg-surface/30 border-border'
                    }`}
                  >
                    {/* Cabeçalho da entrada */}
                    {(entry.autor || entry.data) && (
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {entry.isReagend && (
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-orange/80">
                            <RotateCcw size={9} /> Reagendamento
                          </span>
                        )}
                        {entry.autor && (
                          <span className="text-[10px] font-semibold text-muted">{entry.autor}</span>
                        )}
                        {entry.data && (
                          <span className="font-mono text-[10px] text-muted/60">{entry.data}{entry.hora ? ` ${entry.hora}` : ''}</span>
                        )}
                      </div>
                    )}
                    <p className={`text-[11px] leading-relaxed whitespace-pre-wrap ${
                      entry.isReagend ? 'text-orange/90' : 'text-secondary'
                    }`}>
                      {entry.texto}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* O que o técnico fez */}
            {d.obs && (
              <InfoBlock label="O que foi feito" text={d.obs!} />
            )}

            {/* Materiais utilizados */}
            {(d.materiais?.length ?? 0) > 0 && (
              <div className="bg-surface/30 border border-white/[0.08] rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 flex items-center gap-1.5">
                  <Package size={10} /> Materiais utilizados
                </p>
                <div className="space-y-1">
                  {d.materiais!.map((m, i) => (
                    <div key={i} className="flex items-baseline gap-2">
                      <span className="text-[11px] text-cyan font-mono font-semibold min-w-[28px] text-right">{m.quantidade}×</span>
                      <span className="text-[11px] text-secondary leading-snug flex-1">{m.nome}</span>
                      {m.id && <span className="text-[10px] text-muted font-mono">{m.id}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Materiais retirados */}
            {(d.matRetirados?.length ?? 0) > 0 && (
              <div className="bg-red/[0.05] border border-red/15 rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-red/70 mb-2 flex items-center gap-1.5">
                  <Package size={10} /> Materiais retirados
                </p>
                <div className="space-y-1">
                  {d.matRetirados!.map((m, i) => (
                    <div key={i} className="flex items-baseline gap-2">
                      <span className="text-[11px] text-red/70 font-mono font-semibold min-w-[28px] text-right">{m.quantidade}×</span>
                      <span className="text-[11px] text-secondary/80 leading-snug flex-1">{m.nome}</span>
                      {m.id && <span className="text-[10px] text-muted font-mono">{m.id}</span>}
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

interface MetaProps { icon: ComponentType<{ size?: number; className?: string }>; label: string; value: string; mono?: boolean }
function Meta({ icon: Icon, label, value, mono }: MetaProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={10} className="text-muted/40 flex-shrink-0" />
      <span className="text-[10px] font-bold uppercase tracking-[0.04em] text-muted">{label}:</span>
      <span className={`text-[11px] text-secondary font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function InfoBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="bg-surface/30 border border-white/[0.08] rounded-xl px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-1">{label}</p>
      <p className="text-[11px] text-secondary leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  )
}
