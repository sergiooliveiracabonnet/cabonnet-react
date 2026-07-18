export type PlannerModo = 'executado' | 'planejado'

export function PlannerModeToggle({ modo, onChange }: { modo: PlannerModo; onChange: (m: PlannerModo) => void }) {
  const opcoes: { key: PlannerModo; label: string }[] = [
    { key: 'executado', label: 'Executado' },
    { key: 'planejado', label: 'Planejado' },
  ]
  return (
    <div className="flex gap-1 bg-elevated border border-white/[0.08] rounded-lg p-0.5">
      {opcoes.map(o => (
        <button
          key={o.key}
          type="button"
          aria-pressed={modo === o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all duration-150
            ${modo === o.key ? 'bg-primary/20 text-primary' : 'text-secondary hover:text-text hover:bg-surface/40'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
