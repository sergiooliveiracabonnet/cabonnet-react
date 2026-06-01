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
}
