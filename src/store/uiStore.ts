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
  theme:                'dark' | 'light'
  globalRefreshTick:    number
  dateFilter:           DateFilter
  mensalAnchor:         Date
  triggerGlobalRefresh: () => void
  toggleSidebar:        () => void
  setSidebar:           (open: boolean) => void
  toggleHideRede:       () => void
  toggleTheme:          () => void
  setPreset:            (preset: string) => void
  setCustomRange:       (from: Date, to: Date) => void
  setCampo:             (campo: DateCampo) => void
  mensalPrevMonth:      () => void
  mensalNextMonth:      () => void
}

const _savedTheme = localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
const initRange   = getPresetRange('hoje')

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen:       true,
  hideRede:          true,
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
