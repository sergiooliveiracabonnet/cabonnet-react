export type EscalaModo = 'grade' | 'timeline' | 'planner'

export function EscalaModeToggle({ modo, onChange }: { modo: EscalaModo; onChange: (m: EscalaModo) => void }) {
  const opcoes: { key: EscalaModo; label: string }[] = [
    { key: 'grade',    label: 'Grade semanal' },
    { key: 'timeline', label: 'Linha do tempo' },
    { key: 'planner',  label: 'Planner' },
  ]
  return (
    <div className="flex gap-1 bg-elevated border border-subtle rounded-lg p-0.5">
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
