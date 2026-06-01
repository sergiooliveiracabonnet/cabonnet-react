// Utilitários tipados para localStorage — centralizam tratamento de erros
// e evitam chamadas diretas espalhadas pelo código.

export const storage = {
  getString(key: string, defaultValue: string): string {
    try {
      const v = localStorage.getItem(key)
      return v !== null ? v : defaultValue
    } catch { return defaultValue }
  },

  getInt(key: string, defaultValue: number): number {
    try {
      const v = parseInt(localStorage.getItem(key) ?? '')
      return isNaN(v) ? defaultValue : v
    } catch { return defaultValue }
  },

  getJSON<T>(key: string, defaultValue: T): T {
    try {
      const v = localStorage.getItem(key)
      return v !== null ? (JSON.parse(v) as T) : defaultValue
    } catch { return defaultValue }
  },

  set(key: string, value: string): void {
    try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
  },

  setJSON(key: string, value: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
  },

  remove(key: string): void {
    try { localStorage.removeItem(key) } catch { /* storage unavailable */ }
  },
}
