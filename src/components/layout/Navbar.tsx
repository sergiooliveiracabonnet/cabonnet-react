import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { ListBullets, MagnifyingGlass, PaperPlaneTilt, ChatText } from '@phosphor-icons/react'
import { AnimatedThemeToggler } from '../ui/AnimatedThemeToggler'
import { useUIStore } from '../../store/uiStore'
import { useOSDerived } from '../../contexts/OSDataContext'
import { isCOPE, isReagend } from '../../lib/transform'
import { GlobalSearch } from '../ui/GlobalSearch'
import { useAlerts } from '../../hooks/useAlerts'
import { useAlertasEngine } from '../../hooks/useAlertasEngine'
import { useTelegramStore } from '../../store/telegramStore'
import TelegramPanel from '../../features/alertas/TelegramPanel'
import { ChatDrawer } from '../../features/ai/ChatDrawer'
import type { OSRow } from '../../lib/types'
import {
  RefreshControl, AIStatusBadge, SlaCriticasBadge, AlertasEngineBadge, AuditLogBadge,
} from './NavbarComponents'

const ROUTE_LABELS: Record<string, string> = {
  '/':           'Resumo Geral',
  '/ordens':     'Ordens de Serviço',
  '/graficos':   'Gráficos',
  '/cidades':    'Cidades & Categorias',
  '/fornecedor': 'Fornecedor',
  '/juniper':    'Juniper',
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

export function Navbar() {
  const { toggleSidebar } = useUIStore()
  const location = useLocation()
  const { allRows, rows } = useOSDerived()

  const slaCriticas = useMemo(
    () => (allRows as OSRow[])
      .filter(r => r._slaCritico && r._tipo !== 'REDE' && !isCOPE(r) && !isReagend(r))
      .sort((a, b) => ((b._agingAbertura as number) ?? 0) - ((a._agingAbertura as number) ?? 0))
      .slice(0, 15),
    [allRows]
  )

  const alerts = useAlerts(rows as OSRow[], allRows as OSRow[])
  useAlertasEngine(allRows as OSRow[], rows as OSRow[])

  const tg = useTelegramStore()
  const naoLidos = (tg.history as { lido: boolean }[]).filter(a => !a.lido).length

  const [searchOpen,   setSearchOpen]   = useState(false)
  const [telegramOpen, setTelegramOpen] = useState(false)
  const [chatOpen,     setChatOpen]     = useState(false)

  const title = ROUTE_LABELS[location.pathname] ?? 'Dashboard'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(v => !v)
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault()
        setChatOpen(v => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
    <header className="navbar-premium fixed left-0 right-0 top-0 z-header flex h-14 max-w-full items-center gap-1.5 px-2 sm:gap-3 sm:px-4">
      <button
        onClick={toggleSidebar}
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg sm:h-8 sm:w-8
                   text-muted hover:text-text hover:bg-surface
                   transition-all duration-fast flex-shrink-0"
        aria-label="Abrir ou fechar menu de navegação"
      >
        <ListBullets size={17} />
      </button>
      <div className="hidden h-5 w-px flex-shrink-0 bg-border sm:block" />
      <div className="flex-1 min-w-0">
        <h1 className="font-headline font-bold text-text text-title leading-none tracking-tight truncate">
          {title}
        </h1>
      </div>

      <button
        onClick={() => setSearchOpen(true)}
        title="Busca global (Ctrl+K)"
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center gap-2 rounded-lg border border-white/[0.08]
                   px-0 sm:h-8 sm:w-auto sm:min-w-[160px] sm:justify-start sm:px-3
                   bg-surface text-muted hover:border-muted/30 hover:text-secondary
                   transition-colors duration-150"
      >
        <MagnifyingGlass size={12} className="flex-shrink-0" />
        <span className="text-caption flex-1 text-left hidden sm:block">Buscar OS, contrato ou CPF…</span>
        <kbd className="hidden md:flex items-center text-caption font-mono
                        bg-surface border border-white/[0.08] rounded px-1.5 py-0.5 leading-none text-muted">Ctrl K</kbd>
      </button>

      <div className="hidden lg:contents">
        <SlaCriticasBadge slaCriticas={slaCriticas} />
        <AlertasEngineBadge alerts={alerts} />
      </div>

      <div className="relative hidden flex-shrink-0 md:block">
        <button
          onClick={() => setTelegramOpen(v => !v)}
          title="Alertas & Telegram"
          aria-label="Abrir Alertas e Telegram"
          aria-expanded={telegramOpen}
          className={`relative w-8 h-8 rounded-md flex items-center justify-center transition-all duration-fast
            ${tg.enabled ? 'text-green hover:bg-green/10' : 'text-muted hover:text-secondary hover:bg-surface'}`}
        >
          <PaperPlaneTilt size={13} />
          {naoLidos > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full
                             bg-primary text-caption font-bold text-white flex items-center justify-center leading-none">
              {naoLidos > 9 ? '9+' : naoLidos}
            </span>
          )}
        </button>
        {telegramOpen && (
          <div className="absolute right-0 top-10 z-50">
            <TelegramPanel onClose={() => setTelegramOpen(false)} />
          </div>
        )}
      </div>

      <div className="hidden xl:block">
        <AuditLogBadge />
      </div>

      <button
        onClick={() => setChatOpen(true)}
        title="Assistente IA (Ctrl+Shift+A)"
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md sm:h-8 sm:w-8
                   text-primary bg-primary/10 hover:bg-primary/20 transition-all duration-fast"
      >
        <ChatText size={14} />
      </button>

      <div className="hidden xl:block"><AIStatusBadge /></div>
      <div className="hidden sm:block"><AnimatedThemeToggler /></div>
      <RefreshControl />
    </header>

    <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  )
}
