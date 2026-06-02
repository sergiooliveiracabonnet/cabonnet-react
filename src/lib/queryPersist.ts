// Persistência cross-tab para o cache de OS queries.
// Combina localStorage (para novas abas) + BroadcastChannel (para sync em tempo real).

const STORAGE_KEY   = 'cbn_os_query_v1'
const CHANNEL_NAME  = 'cbn_query_sync'

interface StoredQuery {
  ts:      number
  payload: Record<string, string>
}

type SyncMessage = { type: 'data'; ts: number; payload: Record<string, string> }

// ── localStorage ──────────────────────────────────────────────────────────────

export function persistSave(payload: Record<string, string>): void {
  try {
    const entry: StoredQuery = { ts: Date.now(), payload }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
  } catch {
    // QuotaExceededError — silently skip, dados reais chegam do servidor
  }
}

export function persistLoad(): StoredQuery | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as StoredQuery
    if (!entry?.ts || !entry?.payload) return null
    return entry
  } catch {
    return null
  }
}

// ── BroadcastChannel ──────────────────────────────────────────────────────────
// Broadcast: abre um canal temporário, envia e fecha imediatamente.
// Subscribe: mantém canal aberto enquanto o componente estiver montado.

export function broadcastData(payload: Record<string, string>): void {
  if (!('BroadcastChannel' in window)) return
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME)
    ch.postMessage({ type: 'data', ts: Date.now(), payload } satisfies SyncMessage)
    ch.close()
  } catch { /* ignore */ }
}

export function subscribeSync(
  onData: (payload: Record<string, string>, ts: number) => void,
): () => void {
  if (!('BroadcastChannel' in window)) return () => {}
  const ch = new BroadcastChannel(CHANNEL_NAME)
  ch.onmessage = (e: MessageEvent<SyncMessage>) => {
    if (e.data?.type === 'data' && e.data.payload) {
      onData(e.data.payload, e.data.ts)
    }
  }
  return () => ch.close()
}
