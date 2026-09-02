import { CaretDown } from '@phosphor-icons/react'
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
  ariaLabel?:   string
}

export function FilterSelect({ value, onChange, options, placeholder, className = '', ariaLabel }: FilterSelectProps) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        aria-label={ariaLabel ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 appearance-none pl-3 pr-7 text-label rounded-md text-text
                   border border-border bg-surface-2 dark:bg-surface-1 hover:border-border-hover
                   outline-none focus-visible:ring-2 focus-visible:ring-orange/40 transition-colors duration-fast
                   cursor-pointer"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <CaretDown
        size={11}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary pointer-events-none"
      />
    </div>
  )
}
