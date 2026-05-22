import { create } from 'zustand'
import type { DateFilter, DatePreset, DateCampo } from '../lib/types'

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
function daysFromNow(n: number): Date {
  const d = new Date(); d.setDate(d.getDate() + n); d.setHours(23, 59, 59, 999); return d
}
function tomorrow(): Date {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d
}

export function getPresetRange(preset: DatePreset | string): { from: Date | null; to: Date | null } {
  const today = startOfDay()
  const now   = endOfDay()
  switch (preset) {
    case 'hoje':      return { from: today, to: now }
    case 'ontem':     return { from: daysAgo(1), to: endOfDay(daysAgo(1)) }
    case 'semanal':   return { from: daysAgo(6), to: now }
    case 'quinzenal': return { from: daysAgo(14), to: now }
    case 'mensal':    return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: now }
    case 'anual':     return { from: new Date(today.getFullYear(), 0, 1), to: now }
    case 'amanha':    return { from: tomorrow(), to: endOfDay(tomorrow()) }
    case 'futuro':    return { from: tomorrow(), to: daysFromNow(90) }
    default:          return { from: null, to: null }
  }
}

export interface DatePresetOption {
  id:    string
  label: string
}

export const PRESETS: DatePresetOption[] = [
  { id: 'hoje',      label: 'Hoje'          },
  { id: 'ontem',     label: 'Ontem'         },
  { id: 'semanal',   label: 'Semanal'       },
  { id: 'quinzenal', label: 'Quinzenal'     },
  { id: 'mensal',    label: 'Mensal'        },
  { id: 'anual',     label: `${new Date().getFullYear()}` },
  { id: 'amanha',    label: 'Amanhã'        },
  { id: 'futuro',    label: 'Futuro'        },
  { id: 'custom',    label: 'Personalizado' },
]

// ─── Store ────────────────────────────────────────────────────────────────────

interface UIState {
  sidebarOpen:          boolean
  hideRede:             boolean
  theme:                'dark' | 'light'
  globalRefreshTick:    number
  dateFilter:           DateFilter
  triggerGlobalRefresh: () => void
  toggleSidebar:        () => void
  setSidebar:           (open: boolean) => void
  toggleHideRede:       () => void
  toggleTheme:          () => void
  setPreset:            (preset: string) => void
  setCustomRange:       (from: Date, to: Date) => void
  setCampo:             (campo: DateCampo) => void
}

const _savedTheme = localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
const initRange   = getPresetRange('hoje')

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen:       true,
  hideRede:          true,
  theme:             _savedTheme,
  globalRefreshTick: 0,
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
  toggleTheme:    () => set((s) => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    document.documentElement.classList.toggle('light', next === 'light')
    return { theme: next }
  }),

  setPreset: (preset) => {
    if (preset === 'custom') {
      set((s) => ({ dateFilter: { ...s.dateFilter, preset: 'custom' as DatePreset } }))
    } else {
      const { from, to } = getPresetRange(preset)
      set((s) => ({
        dateFilter: {
          ...s.dateFilter,
          preset: preset as DatePreset, from, to,
          ...((preset === 'amanha' || preset === 'futuro') && { campo: 'dataagendamento' as DateCampo }),
        },
      }))
    }
  },

  setCustomRange: (from, to) =>
    set((s) => ({ dateFilter: { ...s.dateFilter, preset: 'custom', from, to } })),

  setCampo: (campo) =>
    set((s) => ({ dateFilter: { ...s.dateFilter, campo } })),
}))
