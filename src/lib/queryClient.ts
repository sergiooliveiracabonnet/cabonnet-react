import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            1000 * 60 * 5,
      gcTime:               1000 * 60 * 30,
      retry:                2,
      retryDelay:           attempt => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
    },
  },
})
