import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Marca local (persistida) de OS da fila geral (instalação/serviço/rede) que o
// operador já está tratando. Espelha useVTStore — mesmo padrão, chave separada
// porque a fila geral não compartilha as mesmas OS que a fila VT.
interface FilaGeralState {
  emTratativa: Record<string, boolean>
  toggleTratativa: (numos: string) => void
  isTratativa:     (numos: string) => boolean
}

export const useFilaGeralStore = create<FilaGeralState>()(
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
    { name: 'cabonnet-fila-geral-v1' },
  ),
)
