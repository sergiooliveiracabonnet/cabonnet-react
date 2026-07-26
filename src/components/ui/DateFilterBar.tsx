import { useState } from 'react'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Server } from 'lucide-react'
import { useUIStore, PRESETS, isSameMonth } from '../../store/uiStore'
import type { DateCampo } from '../../lib/types'

const CAMPOS: { value: DateCampo; label: string }[] = [
  { value: 'datacadastro',    label: 'Abertura'     },
  { value: 'dataagendamento', label: 'Agendamento'  },
]

function fmt(date: Date | null): string {
  if (!date) return ''
  return date.toLocaleDateString('pt-BR')
}

function toInputVal(date: Date | null): string {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}

function fromInputVal(str: string): Date | null {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

function toEndOfDay(str: string): Date | null {
  const d = fromInputVal(str)
  if (!d) return null
  d.setHours(23, 59, 59, 999)
  return d
}

interface DateFilterBarProps {
  sidebarOpen: boolean
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function DateFilterBar({ sidebarOpen }: DateFilterBarProps) {
  const {
    dateFilter, setPreset, setCustomRange, setCampo, hideRede, toggleHideRede,
    mensalAnchor, mensalPrevMonth, mensalNextMonth,
  } = useUIStore()
  const { preset, from, to, campo } = dateFilter
  const [showCampo, setShowCampo] = useState(false)

  const mensalAtual = isSameMonth(mensalAnchor, new Date())
  const mensalLabel = preset === 'mensal'
    ? `${MESES[mensalAnchor.getMonth()]} ${mensalAnchor.getFullYear()}`
    : 'Mensal'

  const campoLabel = CAMPOS.find(c => c.value === campo)?.label ?? 'Abertura'

  const rangeLabel = (() => {
    if (preset === 'custom') {
      const f = from ? fmt(from) : '...'
      const t = to   ? fmt(to)   : 'hoje'
      return `${f} → ${t}`
    }
    const f = from ? fmt(from) : '...'
    const t = to   ? fmt(to)   : fmt(new Date())
    return `${f} → ${t}`
  })()

  return (
    <div
      className={`fixed right-0 top-14 z-[39] flex h-14 max-w-full items-center gap-0.5 overflow-hidden
                  bg-elevated border-b border-white/[0.08]
                  left-0 px-1.5 transition-all duration-normal sm:gap-1.5 sm:px-3 md:h-10
                  ${sidebarOpen ? 'md:left-[220px]' : 'md:left-[52px]'}`}
    >
      <Calendar size={13} className="hidden flex-shrink-0 text-muted sm:block" />

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain">
        {PRESETS.map((p) => p.id === 'mensal' ? (
          <div key={p.id} className="flex items-center gap-0.5">
            {preset === 'mensal' && (
              <button
                onClick={mensalPrevMonth}
                title="Mês anterior"
                aria-label="Mês anterior"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface/60 hover:text-secondary md:h-5 md:w-5"
              >
                <ChevronLeft size={12} />
              </button>
            )}
            <button
              onClick={() => setPreset(p.id)}
              className={`inline-flex min-h-11 flex-shrink-0 items-center rounded-full border px-3 py-1 font-bold text-caption
                          whitespace-nowrap transition-all duration-fast md:min-h-0 md:px-2.5
                          ${preset === p.id
                            ? 'bg-primary/15 border-primary/40 text-primary'
                            : 'border-white/[0.08] text-muted hover:text-secondary hover:border-muted/30'}`}
            >
              {mensalLabel}
            </button>
            {preset === 'mensal' && (
              <button
                onClick={mensalNextMonth}
                disabled={mensalAtual}
                title={mensalAtual ? 'Mês atual' : 'Próximo mês'}
                aria-label={mensalAtual ? 'Mês atual' : 'Próximo mês'}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface/60 hover:text-secondary disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-muted md:h-5 md:w-5"
              >
                <ChevronRight size={12} />
              </button>
            )}
          </div>
        ) : (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`inline-flex min-h-11 flex-shrink-0 items-center rounded-full border px-3 py-1 font-bold text-caption
                        whitespace-nowrap transition-all duration-fast md:min-h-0 md:px-2.5
                        ${preset === p.id
                          ? p.id === 'amanha'
                            ? 'bg-cyan/15 border-cyan/40 text-cyan'
                            : 'bg-primary/15 border-primary/40 text-primary'
                          : p.id === 'amanha'
                            ? 'border-cyan/20 text-cyan/60 hover:text-cyan hover:border-cyan/40'
                            : 'border-white/[0.08] text-muted hover:text-secondary hover:border-muted/30'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <span className="mx-0.5 hidden h-4 w-px flex-shrink-0 bg-surface md:block" />

      {preset === 'custom' && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input
            type="date"
            value={toInputVal(from)}
            onChange={e => setCustomRange(fromInputVal(e.target.value)!, to!)}
            className="bg-surface border border-white/[0.08] rounded-md px-2 py-0.5 font-mono text-secondary
                       outline-none focus:border-primary/50 w-[120px] text-caption"
          />
          <span className="text-muted text-caption">→</span>
          <input
            type="date"
            value={toInputVal(to)}
            onChange={e => setCustomRange(from!, toEndOfDay(e.target.value)!)}
            className="bg-surface border border-white/[0.08] rounded-md px-2 py-0.5 font-mono text-secondary
                       outline-none focus:border-primary/50 w-[120px] text-caption"
          />
        </div>
      )}

      {preset !== 'custom' && (
        <span className="hidden flex-shrink-0 whitespace-nowrap font-mono text-caption text-muted 2xl:inline">
          {rangeLabel}
        </span>
      )}

      <div className="hidden flex-1 md:block" />

      <div className="relative flex-shrink-0">
        <button
          onClick={() => setShowCampo(v => !v)}
          className="flex h-11 items-center gap-1 whitespace-nowrap px-2 text-caption text-muted transition-colors hover:text-secondary md:h-6 md:px-0"
        >
          <span className="opacity-60">por</span>
          <span className="font-semibold">{campoLabel}</span>
          <ChevronDown size={10} className={`transition-transform ${showCampo ? 'rotate-180' : ''}`} />
        </button>

        {showCampo && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowCampo(false)} />
            <div className="fixed right-[104px] top-[104px] z-50 min-w-[140px] overflow-hidden rounded-lg border border-white/[0.08] bg-elevated shadow-accent md:right-[84px] md:top-[80px]">
              {CAMPOS.map(c => (
                <button
                  key={c.value}
                  onClick={() => { setCampo(c.value); setShowCampo(false) }}
                  className={`w-full text-left px-3 py-2 text-caption transition-colors
                              ${campo === c.value ? 'text-primary bg-primary/10' : 'text-secondary hover:bg-surface/40'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <span className="mx-0.5 hidden h-4 w-px flex-shrink-0 bg-surface md:block" />

      <button
        onClick={toggleHideRede}
        title={hideRede ? 'Rede Interna oculta — clique para exibir' : 'Clique para ocultar OS de Rede Interna'}
        className={`flex h-11 flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-caption font-semibold md:h-6
                    transition-all duration-fast flex-shrink-0
                    ${hideRede
                      ? 'border-orange/40 bg-orange/[0.07] text-orange'
                      : 'border-white/[0.08] text-muted hover:text-secondary hover:border-muted/30'}`}
      >
        <Server size={10} className="flex-shrink-0" />
        <span>Rede</span>
        {hideRede && <span className="text-caption font-bold opacity-80">OFF</span>}
      </button>
    </div>
  )
}
