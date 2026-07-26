// Persistência cross-tab para o cache de OS queries.
// Combina localStorage (para novas abas) + BroadcastChannel (para sync em tempo real).

const STORAGE_KEY   = 'cbn_os_query_v1'
const CHANNEL_NAME  = 'cbn_query_sync'
const MAX_SYNC_PAYLOAD_CHARS = 4_000_000

interface StoredQuery {
  ts:      number
  payload: Record<string, string>
}

type SyncMessage = { type: 'data'; ts: number; payload: Record<string, string> }

// ── localStorage ──────────────────────────────────────────────────────────────

function payloadChars(payload: Record<string, string>): number {
  return Object.values(payload).reduce(
    (total, value) => total + (typeof value === 'string' ? value.length : 0),
    0,
  )
}

function canSyncPayload(payload: Record<string, string>): boolean {
  return payloadChars(payload) <= MAX_SYNC_PAYLOAD_CHARS
}

export function persistSave(payload: Record<string, string>): boolean {
  if (!canSyncPayload(payload)) return false
  try {
    const entry: StoredQuery = { ts: Date.now(), payload }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
    return true
  } catch {
    // QuotaExceededError — silently skip, dados reais chegam do servidor
    return false
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

export function broadcastData(payload: Record<string, string>): boolean {
  if (!canSyncPayload(payload) || !('BroadcastChannel' in window)) return false
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME)
    ch.postMessage({ type: 'data', ts: Date.now(), payload } satisfies SyncMessage)
    ch.close()
    return true
  } catch {
    return false
  }
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
