import type { ReactNode, ButtonHTMLAttributes } from 'react'

const base = [
  'inline-flex items-center justify-center gap-2',
  'font-semibold rounded-md',
  'transition-colors duration-150',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
  'disabled:opacity-40 disabled:pointer-events-none',
  'active:scale-[.97]',
].join(' ')

const variants = {
  primary: [
    'bg-primary text-white',
    'shadow-sm',
    'hover:bg-primary-dark',
  ].join(' '),

  ghost: [
    'bg-transparent text-secondary',
    'border border-border',
    'hover:bg-card-high hover:text-text hover:border-muted/40',
  ].join(' '),

  danger: [
    'bg-red/[0.10] text-red',
    'border border-red/25',
    'hover:bg-red/[0.18] hover:border-red/45',
  ].join(' '),

  outline: [
    'border border-primary/40 text-primary',
    'hover:bg-primary/10 hover:border-primary/70',
  ].join(' '),

  success: [
    'bg-green text-white',
    'shadow-sm',
    'hover:brightness-110',
  ].join(' '),
} as const

const sizes = {
  sm: 'h-7  px-3   text-[12px]',
  md: 'h-9  px-4   text-[13px]',
  lg: 'h-10 px-5   text-[14px]',
} as const

type Variant = keyof typeof variants
type Size    = keyof typeof sizes

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children:   ReactNode
  variant?:   Variant
  size?:      Size
  className?: string
}

export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}
