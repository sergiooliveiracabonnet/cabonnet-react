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
    'bg-orange text-white',
    'shadow-sm',
    // brightness em vez de um segundo token: o design system tem um só laranja de marca.
    'hover:brightness-110 dark:hover:shadow-[0_0_18px_rgb(var(--orange)/.18)]',
  ].join(' '),

  // `bg-text`/`text-bg` dão o contraste invertido do DS: escuro sobre claro no
  // tema claro, claro sobre escuro no escuro — sem precisar de variante `.dark`.
  secondary: 'bg-text text-bg hover:opacity-90',

  outline: [
    'bg-transparent border border-border text-text',
    'hover:border-border-hover hover:bg-surface-hover',
  ].join(' '),

  ghost: [
    'bg-transparent text-secondary',
    'hover:bg-surface-hover hover:text-text',
  ].join(' '),

  danger: [
    'bg-red text-white',
    'hover:brightness-110',
  ].join(' '),
} as const

const sizes = {
  sm: 'h-7  px-3 text-label',
  md: 'h-9  px-3 text-label',
  lg: 'h-10 px-5 text-body',
} as const

export type ButtonVariant = keyof typeof variants
type Size = keyof typeof sizes

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children:   ReactNode
  variant?:   ButtonVariant
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
