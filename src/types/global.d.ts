// Declarações TypeScript para os globals window expostos para automação Playwright/Python.
// O servidor Python navega para /fechamento e chama essas funções para gerar PDFs automaticamente.

export {}

declare global {
  interface Window {
    __cbnFechamentoReady?: boolean
    relSetAba?:            (aba: string) => void
    relSetPeriodo?:        (periodo: string) => void
    relatorioGerarPDF?:    (sendToTelegram: boolean, chatId?: string | number) => Promise<{ ok: boolean; error?: string }>
  }

  // Injetada em build time via vite.config.js `define`, a partir de package.json.
  const __APP_VERSION__: string
}
