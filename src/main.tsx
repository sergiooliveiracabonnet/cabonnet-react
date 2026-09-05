import { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { IconContext } from '@phosphor-icons/react'
import { queryClient } from './lib/queryClient'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installChunkRecovery } from './lib/chunkRecovery'
import './index.css'
import 'leaflet/dist/leaflet.css'
import App from './App'

const rootEl = document.getElementById('root')!

installChunkRecovery()

// A UI foi desenhada em cima do traço do lucide (2 num grid 24 = 8,3% do
// viewBox). O padrão do Phosphor, "regular", é 16/256 = 6,25% — visivelmente
// mais fino, e este app usa ícone de 11 a 14px o tempo todo. "bold" (24/256 =
// 9,4%) é o peso que preserva a legibilidade nesses tamanhos.
createRoot(rootEl).render(
  <ErrorBoundary>
    <IconContext.Provider value={{ weight: 'bold' }}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen bg-bg">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <App />
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </IconContext.Provider>
  </ErrorBoundary>,
)
