import { useEffect, useId, useRef, useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'

export interface OpcaoMulti { value: string; label: string }

interface MultiSelectProps {
  label: string
  options: OpcaoMulti[]
  /** Valores marcados; lista vazia = "todos" (nenhum filtro). */
  value: string[]
  onChange: (value: string[]) => void
  /** Texto do botão quando nada está marcado. */
  allLabel: string
  /** Ex.: "cidades" → "3 cidades". */
  pluralLabel?: string
  className?: string
}

/** Escolha de vários itens de uma lista. Nada marcado significa "sem filtro". */
export function MultiSelect({ label, options, value, onChange, allLabel, pluralLabel = 'selecionados', className = '' }: MultiSelectProps) {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const idLista = useId()

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla) }
  }, [aberto])

  const marcadas = options.filter(o => value.includes(o.value))
  const resumo = !marcadas.length ? allLabel : marcadas.length === 1 ? marcadas[0].label : `${marcadas.length} ${pluralLabel}`
  const alternar = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])

  return (
    <div ref={raiz} className={`relative flex min-w-48 flex-1 flex-col gap-1 text-caption font-semibold text-secondary sm:flex-none ${className}`}>
      <span id={`${idLista}-rotulo`}>{label}</span>
      <button type="button" aria-haspopup="true" aria-expanded={aberto} aria-controls={idLista} aria-labelledby={`${idLista}-rotulo ${idLista}-botao`}
        id={`${idLista}-botao`} onClick={() => setAberto(a => !a)}
        className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-elevated px-3 text-left text-label font-normal text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
        <span className="truncate">{resumo}</span>
        <CaretDown size={13} className={`flex-shrink-0 text-muted transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div id={idLista} role="group" aria-label={label}
          className="absolute left-0 top-full z-dropdown mt-1 w-full min-w-56 rounded-lg border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
            <button type="button" onClick={() => onChange(options.map(o => o.value))} className="min-h-9 cursor-pointer text-caption font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Selecionar todas</button>
            <button type="button" onClick={() => onChange([])} className="min-h-9 cursor-pointer text-caption font-semibold text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Limpar</button>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {options.map(o => (
              <li key={o.value}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 text-label font-normal text-text hover:bg-elevated">
                  <input type="checkbox" checked={value.includes(o.value)} onChange={() => alternar(o.value)} className="h-4 w-4 cursor-pointer accent-primary" />
                  <span className="truncate">{o.label}</span>
                </label>
              </li>
            ))}
            {!options.length && <li className="px-3 py-3 text-label font-normal text-muted">Nenhuma opção.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
