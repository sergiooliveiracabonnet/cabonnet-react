import { type RefObject, useEffect } from 'react'
import { generateFechamentoPDF } from './fechamentoPDF'
import type { OSRow } from '../../lib/types'
import type { FechamentoStats } from './fechamentoUtils'

export interface FechamentoSnapshot {
  rows:         OSRow[]
  rede:         OSRow[]
  stats:        FechamentoStats
  statsRede:    FechamentoStats | null
  periodoLabel: string
}

// Encapsula o registro/deregistro das funções window usadas pela automação Python.
// O servidor Python abre /fechamento via Playwright e chama window.relatorioGerarPDF()
// para disparar a geração de PDF programaticamente.
export function useFechamentoAutomation(
  pdfDataRef:  RefObject<FechamentoSnapshot | null>,
  isLoading:   boolean,
  setAba:      (aba: string) => void,
  setPeriodo:  (periodo: string) => void,
): void {
  // Atualiza __cbnFechamentoReady em tempo real para que o Python saiba quando esperar.
  useEffect(() => {
    window.__cbnFechamentoReady = !isLoading
  }, [isLoading])

  // Registra as funções de automação na montagem e limpa na desmontagem.
  useEffect(() => {
    window.__cbnFechamentoReady = false
    window.relSetAba     = setAba
    window.relSetPeriodo = setPeriodo
    window.relatorioGerarPDF = async (sendToTelegram, chatId) => {
      const data = pdfDataRef.current
      if (!data) return { ok: false, error: 'Dados não carregados' }

      const doc   = generateFechamentoPDF(data)
      const fname = `relatorio-cabonnet-${new Date().toISOString().slice(0, 10)}.pdf`

      if (sendToTelegram) {
        try {
          const resp = await fetch('/notify/telegram/pdf', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              pdf: doc.output('datauristring'),
              filename: fname,
              ...(chatId && { chat_id: String(chatId) }),
            }),
          })
          return resp.json() as Promise<{ ok: boolean; error?: string }>
        } catch (e) {
          return { ok: false, error: String(e) }
        }
      }

      doc.save(fname)
      return { ok: true }
    }

    return () => {
      delete window.relSetAba
      delete window.relSetPeriodo
      delete window.relatorioGerarPDF
      delete window.__cbnFechamentoReady
    }
  }, [pdfDataRef, setAba, setPeriodo])
}
