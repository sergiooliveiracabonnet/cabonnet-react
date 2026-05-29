import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface DrawerProps {
  open:           boolean
  onClose?:       () => void
  title?:         string
  subtitle?:      string
  width?:         string
  children:       ReactNode
  actions?:       ReactNode
  footerActions?: ReactNode
}

export function Drawer({ open, onClose, title, subtitle, width = '720px', children, actions, footerActions }: DrawerProps) {
  const titleId    = useId()
  const panelRef   = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
    } else {
      const t = setTimeout(() => setMounted(false), 300)
      return () => clearTimeout(t)
    }
  }, [open])

  const handleClose = useCallback(() => onClose?.(), [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, handleClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => {
    if (open) triggerRef.current = document.activeElement
  }, [open])

  useEffect(() => {
    if (!open || !panelRef.current) return
    const t = setTimeout(() => {
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      focusable?.[0]?.focus()
    }, 80)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open || !panelRef.current) return
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last  = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => document.removeEventListener('keydown', trap)
  }, [open])

  useEffect(() => {
    if (!open && triggerRef.current) {
      (triggerRef.current as HTMLElement)?.focus?.()
      triggerRef.current = null
    }
  }, [open])

  if (!mounted) return null

  return createPortal(
    <>
      <div
        aria-hidden="true"
        onClick={handleClose}
        className={`fixed inset-0 bg-black/60 backdrop-blur-[3px] z-[595]
                    transition-opacity duration-[320ms] ease-[cubic-bezier(.4,0,.2,1)]
                    ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ width, maxWidth: '96vw' }}
        className={`fixed top-0 right-0 h-full flex flex-col z-drawer
                    bg-surface border-l border-white/[0.08] overflow-hidden
                    transition-transform duration-[380ms] ease-[cubic-bezier(.32,.72,0,1)]
                    will-change-transform
                    ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-white/[0.08] bg-card flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p id={titleId} className="text-sm font-bold text-text leading-snug">{title ?? ''}</p>
            {subtitle && <p className="text-xs text-muted mt-0.5 leading-snug">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
            <button
              aria-label="Fechar painel"
              onClick={handleClose}
              className="w-9 h-9 rounded-md border border-white/[0.08] flex items-center justify-center
                         text-muted hover:text-text hover:bg-surface transition-all duration-fast"
            >
              <X size={15} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
        {footerActions && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.08] bg-card flex-shrink-0">
            {footerActions}
          </div>
        )}
      </div>
    </>,
    document.body
  )
}
