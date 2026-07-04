import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE_SEL = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  open:          boolean
  onClose?:      () => void
  title?:        ReactNode
  subtitle?:     string
  maxWidth?:     string
  headerAction?: ReactNode
  children:      ReactNode
}

export function Modal({ open, onClose, title, subtitle, maxWidth = '960px', headerAction, children }: ModalProps) {
  const dialogRef    = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<Element | null>(null)
  // Callers costumam passar onClose como função inline (ex: () => { reset(); onClose() }),
  // que muda de identidade a cada render. Guardamos a versão mais recente num ref e
  // deixamos o efeito abaixo depender só de `open` — senão, qualquer re-render do
  // conteúdo do modal (ex: digitar num input controlado) recria onClose, o efeito
  // roda de novo e rouba o foco pro primeiro elemento focável (o botão de fechar).
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  // Selecionar texto arrastando o mouse a partir de dentro do modal pode terminar
  // (mouseup) em cima do backdrop — sem isso, o "clicar fora fecha" interpretava
  // esse arraste como um clique fora e fechava o modal no meio da seleção.
  // Só fecha se o mousedown E o click tiverem começado/terminado no próprio backdrop.
  const mouseDownOnBackdrop = useRef(false)

  useEffect(() => {
    if (!open) return

    prevFocusRef.current = document.activeElement

    const first = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SEL)?.[0]
    first?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCloseRef.current?.(); return }
      if (e.key !== 'Tab') return

      const els = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SEL) ?? [])]
      if (!els.length) return

      const firstEl = els[0]
      const lastEl  = els[els.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
      } else {
        if (document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      ;(prevFocusRef.current as HTMLElement | null)?.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnBackdrop.current) onClose?.()
        mouseDownOnBackdrop.current = false
      }}
      className="fixed inset-0 bg-black/65 backdrop-blur-[4px] z-modal
                 flex items-center justify-center p-5 animate-fade-in"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{ maxWidth }}
        className="w-full bg-card border border-white/[0.08] rounded-xl
                   flex flex-col overflow-hidden shadow-2xl max-h-[85vh]
                   animate-card-enter"
      >
        <div className="flex items-center gap-4 px-6 py-4 border-b border-white/[0.08] flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p id="modal-title" className="font-headline font-bold text-[14px] text-text">{title}</p>
            {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
          </div>
          {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            className="w-8 h-8 rounded-md border border-white/[0.08] flex items-center justify-center
                       text-muted hover:text-text hover:bg-surface transition-all duration-fast"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-auto min-h-0">{children}</div>
      </div>
    </div>,
    document.body
  )
}
