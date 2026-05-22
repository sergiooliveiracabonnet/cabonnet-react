import { create } from 'zustand'

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

function ls(key: string, def: string): string {
  try { const v = localStorage.getItem(key); return v !== null ? v : def } catch { return def }
}
function lsInt(key: string, def: number): number {
  try { const v = parseInt(localStorage.getItem(key) ?? ''); return isNaN(v) ? def : v } catch { return def }
}
function loadHistory(): TelegramAlert[] {
  try { return JSON.parse(ls(HISTORY_KEY, '[]')) } catch { return [] }
}

export const useTelegramStore = create<TelegramState>((set, get) => ({
  enabled:       false,
  nivel:         ls('cfg_telegram_nivel', 'atencao'),
  alertaAging:   ls('cfg_telegram_aging', '1') === '1',
  filaThreshold: lsInt('cfg_alerta_fila', 30),
  pollMin:       lsInt('cfg_alerta_poll_min', 5),
  ativo:         false,
  history:       loadHistory(),

  setEnabled:    (v) => set({ enabled: v }),
  setAtivo:      (v) => set({ ativo: v }),

  setNivel: (v) => {
    localStorage.setItem('cfg_telegram_nivel', v)
    set({ nivel: v })
  },
  setAlertaAging: (v) => {
    localStorage.setItem('cfg_telegram_aging', v ? '1' : '0')
    set({ alertaAging: v })
  },
  setFilaThreshold: (v) => {
    localStorage.setItem('cfg_alerta_fila', String(v))
    set({ filaThreshold: v })
  },
  setPollMin: (v) => {
    localStorage.setItem('cfg_alerta_poll_min', String(v))
    set({ pollMin: v })
  },

  addAlert: (alerta) => {
    const entry = { ...alerta, ts: Date.now(), lido: false }
    const novo  = [entry, ...get().history].slice(0, MAX_HISTORY)
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(novo)) } catch {}
    set({ history: novo })
  },

  markAllRead: () => {
    const novo = get().history.map(a => ({ ...a, lido: true }))
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(novo)) } catch {}
    set({ history: novo })
  },

  clearHistory: () => {
    localStorage.removeItem(HISTORY_KEY)
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
    if (localStorage.getItem(AGING_DATE) !== hojeStr) {
      localStorage.setItem(AGING_DATE, hojeStr)
      localStorage.removeItem(AGING_KEY)
      return new Set()
    }
    try { return new Set(JSON.parse(localStorage.getItem(AGING_KEY) ?? '[]')) } catch { return new Set() }
  },
  saveAgingEnviados: (enviados) => {
    try { localStorage.setItem(AGING_KEY, JSON.stringify([...enviados])) } catch {}
  },

  // Filtra alertas por nível de verbosidade configurado
  deveEnviarTelegram: (nivel) => {
    const cfg = get().nivel
    const map: Record<string, string[]> = { critico: ['critico'], atencao: ['critico','atencao'], todos: ['critico','atencao','info'] }
    return (map[cfg] ?? map['atencao']).includes(nivel)
  },
}))
