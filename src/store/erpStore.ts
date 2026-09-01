import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Store ────────────────────────────────────────────────────────────────────

interface AlertSettings {
  agingCriticoDias: number
  capacidadePct:    number
  slaEquipePct:     number
  semAgendDias:     number
}

interface TeamExtras {
  [key: string]: Record<string, unknown>
}

interface ERPState {
  filterEquipe:           string
  filterTipo:             string
  alertSettings:          AlertSettings
  dispatchedAssignments:  Record<string, string>
  teamExtras:             TeamExtras
  custoFornecedor:        Record<string, number>
  custoEquipe:            Record<string, number>
  equipeIndisponivel:     Record<string, boolean>
  metaEquipeDiaria:       Record<string, number>

  setFilterEquipe:        (v: string) => void
  setFilterTipo:          (v: string) => void
  setAlertSettings:       (patch: Partial<AlertSettings>) => void
  setDispatch:            (numos: string, teamCode: string) => void
  undoDispatch:           (numos: string) => void
  updateTeamExtras:       (code: string, patch: Record<string, unknown>) => void
  setCustoFornecedor:     (fornecedor: string, valor: number) => void
  setCustoEquipe:         (code: string, valor: number) => void
  toggleEquipeDisponivel: (code: string) => void
  setMetaEquipeDiaria:    (code: string, valor: number) => void
}

export const useERPStore = create<ERPState>()(
  persist(
    (set) => ({
      filterEquipe:          '',
      filterTipo:            '',
      alertSettings:         { agingCriticoDias: 14, capacidadePct: 85, slaEquipePct: 75, semAgendDias: 7 },
      dispatchedAssignments: {},
      teamExtras:            {},
      custoFornecedor:       { WES: 0, Instacable: 0, THM: 0, REDE: 0, MANUTENCAO: 0 },
      custoEquipe:           {},
      equipeIndisponivel:    {},
      metaEquipeDiaria:      {},

      setFilterEquipe: (v) => set({ filterEquipe: v }),
      setFilterTipo:   (v) => set({ filterTipo: v }),

      setAlertSettings: (patch) =>
        set(s => ({ alertSettings: { ...s.alertSettings, ...patch } })),

      setDispatch: (numos, teamCode) =>
        set(s => ({ dispatchedAssignments: { ...s.dispatchedAssignments, [numos]: teamCode } })),

      undoDispatch: (numos) =>
        set(s => { const next = { ...s.dispatchedAssignments }; delete next[numos]; return { dispatchedAssignments: next } }),

      updateTeamExtras: (code, patch) =>
        set(s => ({ teamExtras: { ...s.teamExtras, [code]: { ...s.teamExtras[code], ...patch } } })),

      setCustoFornecedor: (fornecedor, valor) =>
        set(s => ({ custoFornecedor: { ...s.custoFornecedor, [fornecedor]: Number(valor) } })),

      setCustoEquipe: (code, valor) =>
        set(s => ({ custoEquipe: { ...s.custoEquipe, [code]: Number(valor) } })),

      toggleEquipeDisponivel: (code) =>
        set(s => { const next = { ...s.equipeIndisponivel }; if (next[code]) delete next[code]; else next[code] = true; return { equipeIndisponivel: next } }),

      setMetaEquipeDiaria: (code, valor) =>
        set(s => ({ metaEquipeDiaria: { ...s.metaEquipeDiaria, [code]: Number(valor) } })),
    }),
    { name: 'cabonnet-erp-v1' }
  )
)
