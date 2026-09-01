import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface AuditEntry {
  id:       string
  ts:       number
  action:   string
  detail?:  string
  category: 'kanban' | 'export' | 'telegram' | 'fechamento' | 'auth' | 'other'
}

const MAX_ENTRIES = 100

interface AuditState {
  entries: AuditEntry[]
  log:   (action: string, detail?: string, category?: AuditEntry['category']) => void
  clear: () => void
}

export const useAuditStore = create<AuditState>()(
  persist(
    (set) => ({
      entries: [],

      log: (action, detail, category = 'other') => {
        const entry: AuditEntry = {
          id:      `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ts:      Date.now(),
          action,
          detail,
          category,
        }
        set(s => ({ entries: [entry, ...s.entries].slice(0, MAX_ENTRIES) }))
      },

      clear: () => set({ entries: [] }),
    }),
    {
      name:    'cabonnet-audit-v1',
      storage: createJSONStorage(() => sessionStorage),
      // Persiste apenas as entradas; métodos são recriados na hidratação.
      partialize: (state) => ({ entries: state.entries }),
    }
  )
)
