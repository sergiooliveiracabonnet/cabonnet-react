import { useState } from 'react'
import { Calendar, ChevronDown, Server } from 'lucide-react'
import { useUIStore, PRESETS } from '../../store/uiStore'
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

export function DateFilterBar({ sidebarOpen }: DateFilterBarProps) {
  const { dateFilter, setPreset, setCustomRange, setCampo, hideRede, toggleHideRede } = useUIStore()
  const { preset, from, to, campo } = dateFilter
  const [showCampo, setShowCampo] = useState(false)

  const campoLabel = CAMPOS.find(c => c.value === campo)?.label ?? 'Abertura'

  const rangeLabel = (() => {
    if (preset === 'custom') {
      const f = from ? fmt(from) : '...'
      const t = to   ? fmt(to)   : 'hoje'
      return `${f} → ${t}`
    }
    const f = from ? fmt(from) : '...'
    const t = fmt(new Date())
    return `${f} → ${t}`
  })()

  return (
    <div
      className={`fixed z-[39] right-0 top-14 h-10
                  bg-elevated border-b border-border
                  flex items-center gap-1.5 px-3
                  transition-all duration-normal
                  ${sidebarOpen ? 'left-[220px]' : 'left-[52px]'}`}
    >
      <Calendar size={13} className="text-muted flex-shrink-0" />

      <div className="flex items-center gap-1 flex-shrink-0">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-all duration-fast whitespace-nowrap
                        ${preset === p.id
                          ? p.id === 'amanha'
                            ? 'bg-cyan/15 border-cyan/40 text-cyan'
                            : p.id === 'futuro'
                              ? 'bg-orange/15 border-orange/40 text-orange'
                              : 'bg-primary/15 border-primary/40 text-primary'
                          : p.id === 'amanha'
                            ? 'border-cyan/20 text-cyan/60 hover:text-cyan hover:border-cyan/40'
                            : p.id === 'futuro'
                              ? 'border-orange/20 text-orange/60 hover:text-orange hover:border-orange/40'
                              : 'border-border text-muted hover:text-secondary hover:border-muted/30'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <span className="w-px h-4 bg-surface mx-0.5 flex-shrink-0" />

      {preset === 'custom' && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input
            type="date"
            value={toInputVal(from)}
            onChange={e => setCustomRange(fromInputVal(e.target.value)!, to!)}
            className="bg-surface border border-border rounded-md px-2 py-0.5 font-mono text-secondary
                       outline-none focus:border-primary/50 w-[120px] text-[11px]"
          />
          <span className="text-muted text-[10px]">→</span>
          <input
            type="date"
            value={toInputVal(to)}
            onChange={e => setCustomRange(from!, toEndOfDay(e.target.value)!)}
            className="bg-surface border border-border rounded-md px-2 py-0.5 font-mono text-secondary
                       outline-none focus:border-primary/50 w-[120px] text-[11px]"
          />
        </div>
      )}

      {preset !== 'custom' && (
        <span className="text-[11px] text-muted font-mono whitespace-nowrap flex-shrink-0">
          {rangeLabel}
        </span>
      )}

      <div className="flex-1" />

      <div className="relative flex-shrink-0">
        <button
          onClick={() => setShowCampo(v => !v)}
          className="flex items-center gap-1 text-[11px] text-muted hover:text-secondary transition-colors"
        >
          <span className="opacity-60">por</span>
          <span className="font-semibold">{campoLabel}</span>
          <ChevronDown size={10} className={`transition-transform ${showCampo ? 'rotate-180' : ''}`} />
        </button>

        {showCampo && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowCampo(false)} />
            <div className="absolute right-0 top-6 z-50 bg-elevated border border-border rounded-lg shadow-accent overflow-hidden min-w-[140px]">
              {CAMPOS.map(c => (
                <button
                  key={c.value}
                  onClick={() => { setCampo(c.value); setShowCampo(false) }}
                  className={`w-full text-left px-3 py-2 text-[11px] transition-colors
                              ${campo === c.value ? 'text-primary bg-primary/10' : 'text-secondary hover:bg-surface/40'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <span className="w-px h-4 bg-surface mx-0.5 flex-shrink-0" />

      <button
        onClick={toggleHideRede}
        title={hideRede ? 'Rede Interna oculta — clique para exibir' : 'Clique para ocultar OS de Rede Interna'}
        className={`flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-[10px] font-semibold
                    transition-all duration-fast flex-shrink-0
                    ${hideRede
                      ? 'border-orange/40 bg-orange/[0.07] text-orange'
                      : 'border-border text-muted hover:text-secondary hover:border-muted/30'}`}
      >
        <Server size={10} className="flex-shrink-0" />
        <span>Rede</span>
        {hideRede && <span className="text-[9px] font-bold opacity-80">OFF</span>}
      </button>
    </div>
  )
}
