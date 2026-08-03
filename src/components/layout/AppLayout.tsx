import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Warning, X } from '@phosphor-icons/react'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'
import { DateFilterBar } from '../ui/DateFilterBar'
import { useUIStore } from '../../store/uiStore'
import { OSDataProvider } from '../../contexts/OSDataContext'
import { useOSDerived } from '../../contexts/OSDataContext'
import { useFilterURL } from '../../hooks/useFilterURL'
import { PicoAlertaModal } from '../global/PicoAlertaModal'

function FilterURLSync() {
  useFilterURL()
  return null
}

const BUILDER_LABELS: Record<string, string> = {
  dashboard:  'Dashboard operacional',
  sla:        'Análise de SLA',
  graficos:   'Gráficos e relatórios',
  auditoria:  'Auditoria de dados',
  anomalias:  'Detecção de anomalias',
  cidades:    'Dados por cidade',
  campo:      'Campo e equipes',
  revisitas:  'Análise de revisitas',
  ordens:     'Lista de ordens',
}

function BuilderErrorBanner() {
  const { builderErrors } = useOSDerived()
  const [dismissed, setDismissed] = useState<string[]>([])

  const active = builderErrors.filter(e => !dismissed.includes(e))
  if (!active.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-[500] max-w-sm space-y-2">
      {active.map(name => (
        <div
          key={name}
          className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl
                     bg-elevated border border-yellow/30 shadow-lg shadow-black/30"
          role="alert"
        >
          <Warning size={13} className="text-yellow flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-label font-semibold text-text leading-snug">
              {BUILDER_LABELS[name] ?? name} temporariamente indisponível
            </p>
            <p className="text-caption text-muted mt-0.5">
              Exibindo última versão dos dados — será resolvido no próximo recarregamento.
            </p>
          </div>
          <button
            onClick={() => setDismissed(p => [...p, name])}
            aria-label="Fechar alerta"
            className="text-muted hover:text-text transition-colors flex-shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function AppLayout() {
  const { sidebarOpen, setSidebar } = useUIStore()

  return (
    <OSDataProvider>
      <FilterURLSync />
      <BuilderErrorBanner />
      <PicoAlertaModal />
      <div className="min-h-screen max-w-full overflow-x-clip bg-bg text-text">
        <Sidebar />
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Fechar menu de navegação"
            onClick={() => setSidebar(false)}
            className="fixed inset-0 z-[350] bg-black/60 backdrop-blur-[1px] md:hidden"
          />
        )}
        <Navbar />
        <DateFilterBar sidebarOpen={sidebarOpen} />

        <main className={`min-w-0 max-w-full overflow-x-clip pt-28 transition-[padding] duration-200 md:pt-24
                          ${sidebarOpen ? 'md:pl-[224px]' : 'md:pl-[52px]'}`}>
          <div className="animate-page-enter p-3 sm:p-4 lg:p-6">
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            }>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </OSDataProvider>
  )
}
