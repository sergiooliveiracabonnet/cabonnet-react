import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { OSRow } from '../lib/types'

// ─── Kanban ───────────────────────────────────────────────────────────────────

export type KanbanColumnId = 'nova' | 'agendada' | 'atendimento' | 'concluida' | 'cancelada'

export const KANBAN_COLUMNS: Record<KanbanColumnId, { label: string; order: number }> = {
  nova:        { label: 'Nova',           order: 0 },
  agendada:    { label: 'Agendada',       order: 1 },
  atendimento: { label: 'Em Atendimento', order: 2 },
  concluida:   { label: 'Concluída',      order: 3 },
  cancelada:   { label: 'Cancelada',      order: 4 },
}

export function getKanbanColumn(row: Pick<OSRow, 'numos' | 'descsituacao'>, overrides: Record<string, KanbanColumnId> = {}): KanbanColumnId {
  if (overrides[row.numos]) return overrides[row.numos]
  const s = (row.descsituacao || '').toLowerCase()
  if (s.includes('conclu')) return 'concluida'
  if (s.includes('cancel')) return 'cancelada'
  if (s.includes('atend'))  return 'atendimento'
  if (s.includes('agend'))  return 'agendada'
  return 'nova'
}

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
  erpOrdensView:          string
  statusOverrides:        Record<string, KanbanColumnId>
  filterEquipe:           string
  filterTipo:             string
  alertSettings:          AlertSettings
  dispatchedAssignments:  Record<string, string>
  teamExtras:             TeamExtras
  custoFornecedor:        Record<string, number>
  custoEquipe:            Record<string, number>
  equipeIndisponivel:     Record<string, boolean>
  metaEquipeDiaria:       Record<string, number>

  setERPOrdensView:       (v: string) => void
  setStatusOverride:      (numos: string, column: KanbanColumnId) => void
  clearStatusOverride:    (numos: string) => void
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
      erpOrdensView:         'kanban',
      statusOverrides:       {},
      filterEquipe:          '',
      filterTipo:            '',
      alertSettings:         { agingCriticoDias: 14, capacidadePct: 85, slaEquipePct: 75, semAgendDias: 7 },
      dispatchedAssignments: {},
      teamExtras:            {},
      custoFornecedor:       { WES: 0, Instacable: 0, THM: 0, REDE: 0, MANUTENCAO: 0 },
      custoEquipe:           {},
      equipeIndisponivel:    {},
      metaEquipeDiaria:      {},

      setERPOrdensView: (v) => set({ erpOrdensView: v }),

      setStatusOverride: (numos, column) =>
        set(s => ({ statusOverrides: { ...s.statusOverrides, [numos]: column } })),

      clearStatusOverride: (numos) =>
        set(s => { const next = { ...s.statusOverrides }; delete next[numos]; return { statusOverrides: next } }),

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
