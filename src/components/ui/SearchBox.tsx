import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

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
      <Search size={12} className="absolute left-2.5 text-muted pointer-events-none" />
      <input
        type="text"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-7 pr-7 py-1.5 text-[12px] rounded-lg
                   bg-surface border border-white/[0.08] text-text placeholder:text-muted
                   outline-none focus:border-primary/40 transition-colors duration-fast"
      />
      {local && (
        <button
          onClick={handleClear}
          className="absolute right-2 text-muted hover:text-text transition-colors"
        >
          <X size={11} />
        </button>
      )}
    </div>
  )
}
