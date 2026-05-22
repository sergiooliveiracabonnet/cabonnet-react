import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// Conecta ao endpoint SSE /events e invalida o cache React Query
// sempre que o servidor emite mudanças de status ou nova carga de OS.
// Montado uma vez dentro de OSDataProvider.
export function useServerEvents(): void {
  const qc = useQueryClient()

  useEffect(() => {
    const es = new EventSource('/events', { withCredentials: true })

    es.addEventListener('os-updated', () => {
      qc.invalidateQueries({ queryKey: ['os-query'] })
    })

    es.addEventListener('os-status-changed', () => {
      qc.invalidateQueries({ queryKey: ['os-query'] })
    })

    es.onerror = () => {
      // O browser reconecta automaticamente
    }

    return () => es.close()
  }, [qc])
}
