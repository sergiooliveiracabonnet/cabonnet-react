import { create } from 'zustand'
import { storage } from '../lib/storage'

interface TelegramAlert {
  ts:     number
  lido:   boolean
  tipo?:  string
  ref?:   string
  icon?:  string
  nivel?: string
  titulo?: string
  msg?:   string
  [key: string]: unknown
}

interface TelegramState {
  enabled:        boolean
  nivel:          string
  alertaAging:    boolean
  filaThreshold:  number
  pollMin:        number
  ativo:          boolean
  history:        TelegramAlert[]
  setEnabled:     (v: boolean) => void
  setAtivo:       (v: boolean) => void
  setNivel:       (v: string) => void
  setAlertaAging: (v: boolean) => void
  setFilaThreshold: (v: number) => void
  setPollMin:     (v: number) => void
  addAlert:       (alerta: Omit<TelegramAlert, 'ts' | 'lido'>) => void
  markAllRead:    () => void
  clearHistory:   () => void
  jaEmitido:      (tipo: string, ref: string) => boolean
  getAgingEnviados: () => Set<unknown>
  saveAgingEnviados: (enviados: Set<unknown>) => void
  deveEnviarTelegram: (nivel: string) => boolean
}

const HISTORY_KEY = 'cabonet_alertas_history'
const AGING_KEY   = 'cabonet_tg_aging_sent'
const AGING_DATE  = 'cabonet_tg_aging_date'
const MAX_HISTORY = 50

function loadHistory(): TelegramAlert[] {
  return storage.getJSON<TelegramAlert[]>(HISTORY_KEY, [])
}

export const useTelegramStore = create<TelegramState>((set, get) => ({
  enabled:       false,
  nivel:         storage.getString('cfg_telegram_nivel', 'atencao'),
  alertaAging:   storage.getString('cfg_telegram_aging', '1') === '1',
  filaThreshold: storage.getInt('cfg_alerta_fila', 30),
  pollMin:       storage.getInt('cfg_alerta_poll_min', 5),
  ativo:         false,
  history:       loadHistory(),

  setEnabled:    (v) => set({ enabled: v }),
  setAtivo:      (v) => set({ ativo: v }),

  setNivel: (v) => {
    storage.set('cfg_telegram_nivel', v)
    set({ nivel: v })
  },
  setAlertaAging: (v) => {
    storage.set('cfg_telegram_aging', v ? '1' : '0')
    set({ alertaAging: v })
  },
  setFilaThreshold: (v) => {
    storage.set('cfg_alerta_fila', String(v))
    set({ filaThreshold: v })
  },
  setPollMin: (v) => {
    storage.set('cfg_alerta_poll_min', String(v))
    set({ pollMin: v })
  },

  addAlert: (alerta) => {
    const entry = { ...alerta, ts: Date.now(), lido: false }
    const novo  = [entry, ...get().history].slice(0, MAX_HISTORY)
    storage.setJSON(HISTORY_KEY, novo)
    set({ history: novo })
  },

  markAllRead: () => {
    const novo = get().history.map(a => ({ ...a, lido: true }))
    storage.setJSON(HISTORY_KEY, novo)
    set({ history: novo })
  },

  clearHistory: () => {
    storage.remove(HISTORY_KEY)
    set({ history: [] })
  },

  // Verifica se já foi emitido nas últimas 1h (deduplicação)
  jaEmitido: (tipo, ref) => {
    const agora  = Date.now()
    const janela = 60 * 60 * 1000
    return get().history.some(a => a.tipo === tipo && a.ref === ref && (agora - a.ts) < janela)
  },

  // Controle diário de aging OS individuais
  getAgingEnviados: () => {
    const hojeStr = new Date().toDateString()
    if (storage.getString(AGING_DATE, '') !== hojeStr) {
      storage.set(AGING_DATE, hojeStr)
      storage.remove(AGING_KEY)
      return new Set()
    }
    return storage.getJSON<unknown[]>(AGING_KEY, []).reduce((s: Set<unknown>, v) => s.add(v), new Set<unknown>())
  },
  saveAgingEnviados: (enviados) => {
    storage.setJSON(AGING_KEY, [...enviados])
  },

  // Filtra alertas por nível de verbosidade configurado
  deveEnviarTelegram: (nivel) => {
    const cfg = get().nivel
    const map: Record<string, string[]> = { critico: ['critico'], atencao: ['critico','atencao'], todos: ['critico','atencao','info'] }
    return (map[cfg] ?? map['atencao']).includes(nivel)
  },
}))
