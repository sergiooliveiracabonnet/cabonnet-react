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
    <div className={`relative bg-card border border-white/[0.08] rounded-xl overflow-hidden ${className}`}>
      {/* Top accent — só quando dot está definido */}
      {dot && (
        <div
          className="absolute top-0 left-0 right-0 h-px z-10"
          style={{ background: `linear-gradient(90deg, transparent 0%, ${dot}80 40%, ${dot}80 60%, transparent 100%)` }}
        />
      )}

      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {dot && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: dot }}
            />
          )}
          <p className="text-[11px] font-medium text-muted">{title}</p>
        </div>
        {onExpand && (
          <button
            onClick={onExpand}
            className="text-muted hover:text-text transition-colors duration-150 p-1 rounded-md hover:bg-surface"
          >
            <Maximize2 size={11} />
          </button>
        )}
      </div>

      <div className={`relative ${height} px-1 pb-2`}>{children}</div>
    </div>
  )
}
