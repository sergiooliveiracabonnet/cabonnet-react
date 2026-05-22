import type { CSSProperties } from 'react'

interface LogoIconProps {
  className?: string
  style?:     CSSProperties
}

export function LogoIcon({ className = '', style }: LogoIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <circle cx="12" cy="19" r="1.75" fill="white" />
      <path d="M8.8 15.6a4.55 4.55 0 0 1 6.4 0" stroke="white" strokeWidth="1.9" strokeLinecap="round" opacity="0.95" />
      <path d="M5.8 12.5a8.75 8.75 0 0 1 12.4 0" stroke="white" strokeWidth="1.9" strokeLinecap="round" opacity="0.65" />
      <path d="M2.9 9.4a12.95 12.95 0 0 1 18.2 0" stroke="white" strokeWidth="1.9" strokeLinecap="round" opacity="0.35" />
    </svg>
  )
}
