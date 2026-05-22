import type { ReactNode, ButtonHTMLAttributes } from 'react'

const base = [
  'inline-flex items-center justify-center gap-2',
  'font-bold tracking-wide rounded-md',
  'transition-all duration-fast',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
  'disabled:opacity-40 disabled:pointer-events-none',
  'active:scale-[.96]',
].join(' ')

const variants = {
  primary: [
    'bg-gradient-to-b from-sky-400 to-primary',
    'text-white',
    'shadow-[0_4px_20px_rgba(14,165,233,.30),0_1px_3px_rgba(0,0,0,.40)]',
    'hover:shadow-[0_6px_28px_rgba(14,165,233,.40),0_2px_6px_rgba(0,0,0,.40)]',
    'hover:brightness-110',
  ].join(' '),

  ghost: [
    'bg-white/[0.04] text-secondary',
    'border border-white/[0.09]',
    'hover:bg-white/[0.08] hover:text-text hover:border-white/[0.18]',
  ].join(' '),

  danger: [
    'bg-red/[0.10] text-red',
    'border border-red/[0.25]',
    'hover:bg-red/[0.18] hover:border-red/[0.45]',
    'hover:shadow-[0_4px_16px_rgba(239,68,68,.22)]',
  ].join(' '),

  outline: [
    'border border-primary/40 text-primary',
    'hover:bg-primary/[0.10] hover:border-primary/70',
    'hover:shadow-[0_2px_12px_rgba(14,165,233,.18)]',
  ].join(' '),

  success: [
    'bg-gradient-to-b from-emerald-400 to-green',
    'text-white',
    'shadow-[0_4px_20px_rgba(34,197,94,.30),0_1px_3px_rgba(0,0,0,.40)]',
    'hover:brightness-110',
    'hover:shadow-[0_6px_28px_rgba(34,197,94,.40)]',
  ].join(' '),
} as const

const sizes = {
  sm: 'h-7  px-3   text-[11px]',
  md: 'h-9  px-4   text-[13px]',
  lg: 'h-11 px-6   text-[15px]',
} as const

type Variant = keyof typeof variants
type Size    = keyof typeof sizes

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children:  ReactNode
  variant?:  Variant
  size?:     Size
  className?: string
}

export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}
