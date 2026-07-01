import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Search, Send, MessageSquare } from 'lucide-react'
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
    <header className="fixed top-0 right-0 left-0 h-14 z-header navbar-premium flex items-center gap-3 px-4">
      <button
        onClick={toggleSidebar}
        className="w-8 h-8 rounded-lg flex items-center justify-center
                   text-muted hover:text-text hover:bg-surface
                   transition-all duration-fast flex-shrink-0"
        aria-label="Toggle sidebar"
      >
        <Menu size={15} />
      </button>
      <div className="w-px h-5 bg-border flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <h1 className="font-headline font-bold text-text text-[14px] leading-none tracking-tight truncate">
          {title}
        </h1>
      </div>

      <button
        onClick={() => setSearchOpen(true)}
        title="Busca global (Ctrl+K)"
        className="flex items-center gap-2 h-8 px-3 rounded-lg border border-white/[0.08]
                   bg-surface text-muted hover:border-muted/30 hover:text-secondary
                   transition-colors duration-150 flex-shrink-0 min-w-[160px]"
      >
        <Search size={12} className="flex-shrink-0" />
        <span className="text-[11px] flex-1 text-left hidden sm:block">Buscar OS, cliente…</span>
        <kbd className="hidden md:flex items-center text-[9px] font-mono
                        bg-surface border border-white/[0.08] rounded px-1.5 py-0.5 leading-none text-muted">⌃K</kbd>
      </button>

      <SlaCriticasBadge slaCriticas={slaCriticas} />
      <AlertasEngineBadge alerts={alerts} />

      <div className="relative flex-shrink-0">
        <button
          onClick={() => setTelegramOpen(v => !v)}
          title="Alertas & Telegram"
          className={`relative w-8 h-8 rounded-md flex items-center justify-center transition-all duration-fast
            ${tg.enabled ? 'text-green hover:bg-green/10' : 'text-muted hover:text-secondary hover:bg-surface'}`}
        >
          <Send size={13} />
          {naoLidos > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full
                             bg-primary text-[10px] font-bold text-white flex items-center justify-center leading-none">
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

      <AuditLogBadge />

      <button
        onClick={() => setChatOpen(true)}
        title="Assistente IA (Ctrl+Shift+A)"
        className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0
                   text-primary bg-primary/10 hover:bg-primary/20 transition-all duration-fast"
      >
        <MessageSquare size={14} />
      </button>

      <AIStatusBadge />
      <AnimatedThemeToggler />
      <RefreshControl />
    </header>

    <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  )
}
