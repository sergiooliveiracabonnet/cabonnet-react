import { Maximize2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface ChartCardProps {
  title:      string
  dot?:       string
  children:   ReactNode
  height?:    string
  onExpand?:  () => void
  className?: string
}

export function ChartCard({ title, dot, children, height = 'h-48', onExpand, className = '' }: ChartCardProps) {
  return (
    <div className={`relative bg-card border border-white/[0.07] rounded-xl overflow-hidden card-shine ${className}`}>
      <div
        className="absolute top-0 left-0 right-0 h-[1.5px] z-10"
        style={dot
          ? { background: `linear-gradient(90deg, transparent 0%, ${dot}99 40%, ${dot}99 60%, transparent 100%)` }
          : { background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' }
        }
      />
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          {dot && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: dot, boxShadow: `0 0 8px ${dot}90` }}
            />
          )}
          <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-muted">{title}</p>
        </div>
        {onExpand && (
          <button
            onClick={onExpand}
            className="text-muted/60 hover:text-text transition-colors duration-fast p-1 rounded-md hover:bg-white/[0.06]"
          >
            <Maximize2 size={11} />
          </button>
        )}
      </div>
      <div className={`relative ${height} px-1 pb-2`}>{children}</div>
    </div>
  )
}
