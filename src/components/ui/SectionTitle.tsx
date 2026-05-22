import type { ReactNode, ComponentType } from 'react'

interface SectionTitleProps {
  children:  ReactNode
  icon?:     ComponentType<{ size?: number; className?: string }>
  className?: string
}

export function SectionTitle({ children, icon: Icon, className = '' }: SectionTitleProps) {
  return (
    <h2 className={`flex items-center gap-2 font-headline font-semibold text-[12px]
                    uppercase tracking-[1.2px] text-secondary
                    mt-6 mb-3 ${className}`}>
      {Icon && <Icon size={13} className="text-muted" />}
      {children}
    </h2>
  )
}
