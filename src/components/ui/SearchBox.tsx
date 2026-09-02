import { useState, useEffect, useRef } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
interface SearchBoxProps {
  value:        string
  onChange:     (value: string) => void
  placeholder?: string
  className?:   string
  debounce?:    number
}

export function SearchBox({ value, onChange, placeholder = 'Buscar…', className = '', debounce: delay = 300 }: SearchBoxProps) {
  const [local, setLocal]  = useState(value)
  const timerRef           = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setLocal(value) }, [value])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  function handleChange(newVal: string) {
    setLocal(newVal)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onChange(newVal), delay)
  }

  function handleClear() {
    setLocal('')
    if (timerRef.current) clearTimeout(timerRef.current)
    onChange('')
  }

  return (
    <div className={`relative flex items-center ${className}`}>
      <MagnifyingGlass size={12} className="absolute left-2.5 text-secondary pointer-events-none" />
      <input
        type="text"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-8 pl-7 pr-7 text-label rounded-md text-text placeholder:text-muted
                   border border-border bg-surface-2 dark:bg-surface-1 hover:border-border-hover
                   outline-none focus-visible:ring-2 focus-visible:ring-orange/40 transition-colors duration-fast"
      />
      {local && (
        <button
          onClick={handleClear}
          aria-label="Limpar busca"
          className="absolute right-2 text-muted hover:text-text transition-colors"
        >
          <X size={11} />
        </button>
      )}
    </div>
  )
}
