import { ChevronDown } from 'lucide-react'

interface Option {
  value: string
  label: string
}

interface FilterSelectProps {
  value:        string
  onChange:     (value: string) => void
  options:      Option[]
  placeholder?: string
  className?:   string
}

export function FilterSelect({ value, onChange, options, placeholder, className = '' }: FilterSelectProps) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none pl-3 pr-7 py-1.5 text-label rounded-md
                   bg-surface border border-white/[0.08] text-text rounded-lg
                   outline-none focus:border-primary/40 transition-colors duration-fast
                   cursor-pointer"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown
        size={11}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
      />
    </div>
  )
}
