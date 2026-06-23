import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Marca local (persistida) de OS de VT que o operador já está tratando.
// Não escreve no ERP — é um sinal operacional para tirar a OS do topo da fila.
interface VTState {
  emTratativa: Record<string, boolean>
  toggleTratativa: (numos: string) => void
  isTratativa:     (numos: string) => boolean
}

export const useVTStore = create<VTState>()(
  persist(
    (set, get) => ({
      emTratativa: {},
      toggleTratativa: (numos) =>
        set(s => {
          const next = { ...s.emTratativa }
          if (next[numos]) delete next[numos]
          else next[numos] = true
          return { emTratativa: next }
        }),
      isTratativa: (numos) => !!get().emTratativa[numos],
    }),
    { name: 'cabonnet-vt-v1' },
  ),
)
