import { create } from 'zustand'
import type { DateFilter, DatePreset, DateCampo } from '../lib/types'
import type { ClusterFilter } from '../lib/clusters'

// ─── Date helpers ─────────────────────────────────────────────────────────────

function startOfDay(d = new Date()): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r
}
function endOfDay(d = new Date()): Date {
  const r = new Date(d); r.setHours(23, 59, 59, 999); return r
}
function daysAgo(n: number): Date {
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d
}
function tomorrow(): Date {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}
function endOfMonth(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + 1, 0); r.setHours(23, 59, 59, 999); return r
}
export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function getPresetRange(preset: DatePreset | string): { from: Date | null; to: Date | null } {
  const today = startOfDay()
  const now   = endOfDay()
  switch (preset) {
    case 'hoje':    return { from: today, to: now }
    case 'ontem':   return { from: daysAgo(1), to: endOfDay(daysAgo(1)) }
    case 'semanal': return { from: daysAgo(6), to: now }
    case 'mensal':  return { from: startOfMonth(today), to: now }
    case 'anual':   return { from: new Date(today.getFullYear(), 0, 1), to: now }
    case 'amanha':  return { from: tomorrow(), to: endOfDay(tomorrow()) }
    default:        return { from: null, to: null }
  }
}

export function getMonthRange(anchor: Date): { from: Date; to: Date } {
  const from = startOfMonth(anchor)
  const to   = isSameMonth(anchor, new Date()) ? endOfDay(new Date()) : endOfMonth(anchor)
  return { from, to }
}

export interface DatePresetOption {
  id:    string
  label: string
}

export const PRESETS: DatePresetOption[] = [
  { id: 'ontem',   label: 'Ontem'         },
  { id: 'hoje',    label: 'Hoje'          },
  { id: 'amanha',  label: 'Amanhã'        },
  { id: 'semanal', label: 'Semanal'       },
  { id: 'mensal',  label: 'Mensal'        },
  { id: 'anual',   label: 'Anual'         },
  { id: 'custom',  label: 'Personalizado' },
]

// ─── Store ────────────────────────────────────────────────────────────────────

interface UIState {
  sidebarOpen:          boolean
  hideRede:             boolean
  cluster:              ClusterFilter
  /** Dono da escolha guardada. Sem ele, o cluster de um usuario vaza para o proximo. */
  clusterDono:          string | null
  theme:                'dark' | 'light'
  globalRefreshTick:    number
  dateFilter:           DateFilter
  mensalAnchor:         Date
  triggerGlobalRefresh: () => void
  toggleSidebar:        () => void
  setSidebar:           (open: boolean) => void
  toggleHideRede:       () => void
  setCluster:           (cluster: ClusterFilter) => void
  aplicarClusterDaSessao: (doUsuario: ClusterFilter, username: string | null) => void
  toggleTheme:          () => void
  setPreset:            (preset: string) => void
  setCustomRange:       (from: Date, to: Date) => void
  setCampo:             (campo: DateCampo) => void
  mensalPrevMonth:      () => void
  mensalNextMonth:      () => void
}

const _savedTheme = localStorage.getItem('theme') === 'light' ? 'light' : 'dark'

// A escolha de cluster e por usuario. Uma chave unica nao distinguia a escolha
// de um admin do recorte que o servidor amarra numa conta regional, e a segunda
// vazava para o login seguinte: o admin entrava depois do Oscar e via a operacao
// inteira recortada em Adamantina, sem ter escolhido nada.
const _CLUSTER_DONO_KEY = 'clusterUltimoDono'
const clusterKeyDe = (username: string | null): string | null =>
  username ? `cluster:${username}` : null

// Default VALE, nao TODOS: somar Adamantina de saida mudaria todos os KPIs
// historicos sem aviso. Adamantina e opt-in.
const clusterGuardadoDe = (username: string | null): ClusterFilter => {
  const chave = clusterKeyDe(username)
  const salvo = chave ? localStorage.getItem(chave) : null
  return salvo === 'ADAMANTINA' || salvo === 'TODOS' ? salvo : 'VALE'
}

// Quem recarrega a pagina costuma ser quem acabou de sair dela: restaurar a
// escolha do ultimo dono evita a tela piscar no Vale ate a sessao responder.
const _ultimoDono   = localStorage.getItem(_CLUSTER_DONO_KEY)
const _initialCluster: ClusterFilter = clusterGuardadoDe(_ultimoDono)
const initRange   = getPresetRange('hoje')
const initialSidebarOpen = typeof window === 'undefined' || window.innerWidth >= 768

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen:       initialSidebarOpen,
  hideRede:          true,
  cluster:           _initialCluster,
  clusterDono:       _ultimoDono,
  theme:             _savedTheme,
  globalRefreshTick: 0,
  mensalAnchor:      new Date(),
  triggerGlobalRefresh: () => set((s) => ({ globalRefreshTick: s.globalRefreshTick + 1 })),

  dateFilter: {
    preset: 'hoje',
    from:   initRange.from,
    to:     initRange.to,
    campo:  'dataagendamento',
  },

  toggleSidebar:  () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebar:     (open) => set({ sidebarOpen: open }),
  toggleHideRede: () => set((s) => ({ hideRede: !s.hideRede })),
  setCluster:     (cluster) => set((s) => {
    const chave = clusterKeyDe(s.clusterDono)
    if (chave) localStorage.setItem(chave, cluster)
    return { cluster }
  }),
  // Conta amarrada a um cluster nao escolhe: o servidor ja recorta o CSV, e
  // deixar o seletor livre so mostraria um filtro que nao muda nada. Por nao ser
  // escolha, esse valor nao vai para o disco — se fosse, seria lido no proximo
  // login como se o usuario seguinte tivesse pedido.
  aplicarClusterDaSessao: (doUsuario, username) => set(() => {
    if (username) localStorage.setItem(_CLUSTER_DONO_KEY, username)
    if (doUsuario !== 'TODOS') return { cluster: doUsuario, clusterDono: username }
    return { cluster: clusterGuardadoDe(username), clusterDono: username }
  }),
  toggleTheme:    () => set((s) => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    document.documentElement.classList.toggle('light', next === 'light')
    return { theme: next }
  }),

  setPreset: (preset) => {
    if (preset === 'custom') {
      set((s) => ({ dateFilter: { ...s.dateFilter, preset: 'custom' as DatePreset } }))
    } else if (preset === 'mensal') {
      const anchor = new Date()
      const { from, to } = getMonthRange(anchor)
      set((s) => ({
        mensalAnchor: anchor,
        dateFilter:   { ...s.dateFilter, preset: 'mensal' as DatePreset, from, to },
      }))
    } else {
      const { from, to } = getPresetRange(preset)
      set((s) => ({
        dateFilter: {
          ...s.dateFilter,
          preset: preset as DatePreset, from, to,
          ...(preset === 'amanha' && { campo: 'dataagendamento' as DateCampo }),
        },
      }))
    }
  },

  setCustomRange: (from, to) =>
    set((s) => ({ dateFilter: { ...s.dateFilter, preset: 'custom', from, to } })),

  setCampo: (campo) =>
    set((s) => ({ dateFilter: { ...s.dateFilter, campo } })),

  mensalPrevMonth: () => set((s) => {
    const anchor = new Date(s.mensalAnchor.getFullYear(), s.mensalAnchor.getMonth() - 1, 1)
    const { from, to } = getMonthRange(anchor)
    return { mensalAnchor: anchor, dateFilter: { ...s.dateFilter, preset: 'mensal' as DatePreset, from, to } }
  }),

  mensalNextMonth: () => set((s) => {
    const now = new Date()
    if (isSameMonth(s.mensalAnchor, now)) return s
    const anchor = new Date(s.mensalAnchor.getFullYear(), s.mensalAnchor.getMonth() + 1, 1)
    const { from, to } = getMonthRange(anchor)
    return { mensalAnchor: anchor, dateFilter: { ...s.dateFilter, preset: 'mensal' as DatePreset, from, to } }
  }),
}))
