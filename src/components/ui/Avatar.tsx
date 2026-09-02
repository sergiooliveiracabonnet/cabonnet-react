export interface AvatarProps {
  name: string
  src?: string
  size?: 'sm' | 'md'
  className?: string
}

const SIZE = { sm: 'h-[30px] w-[30px] text-caption', md: 'h-[38px] w-[38px] text-label' }

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0][0] ?? ''
  const last  = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}

export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const base = `${SIZE[size]} rounded-[9px] overflow-hidden flex-shrink-0 ${className}`
  if (src) {
    return <img src={src} alt={name} className={`${base} object-cover`} />
  }
  return (
    <div
      className={`${base} flex items-center justify-center bg-surface-active font-semibold text-secondary`}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  )
}
