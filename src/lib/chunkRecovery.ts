const RELOAD_KEY = 'cabonnet:chunk-reload-at'
const RELOAD_COOLDOWN_MS = 30_000

export function shouldReloadStaleChunk(lastReload: string | null, now = Date.now()): boolean {
  if (lastReload === null) return true
  const timestamp = Number(lastReload)
  return Number.isFinite(timestamp) && now - timestamp >= RELOAD_COOLDOWN_MS
}

export function installChunkRecovery(): void {
  window.addEventListener('vite:preloadError', event => {
    event.preventDefault()

    let lastReload: string | null = null
    try { lastReload = sessionStorage.getItem(RELOAD_KEY) } catch { /* armazenamento indisponível */ }
    if (!shouldReloadStaleChunk(lastReload)) return

    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())) } catch { /* recarrega mesmo assim */ }
    window.location.reload()
  })
}
