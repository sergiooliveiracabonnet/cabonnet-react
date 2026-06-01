import { useState } from 'react'
import { Send, CheckCircle, XCircle } from 'lucide-react'
import { Modal }   from '../../components/ui/Modal'
import { Button }  from '../../components/ui/Button'
import { captureOSPorEquipe, captureOSDetalhado, type CaptureOSRow } from '../../lib/captureOSTable'
import { telegram }       from '../../lib/api'
import { useAuditStore }  from '../../store/auditStore'
import type { OSRow }     from '../../lib/types'

interface FornecedorOpt { value: string; label: string; color: string }

const FORNECEDOR_OPTS: FornecedorOpt[] = [
  { value: 'WES',        label: 'WES',        color: '#c4b5fd' },
  { value: 'Instacable', label: 'Instacable',  color: '#facc15' },
  { value: 'THM',        label: 'THM',         color: '#22d3ee' },
  { value: 'REDE',       label: 'Rede',         color: '#4ade80' },
  { value: 'MANUTENCAO', label: 'Manutenção',  color: '#f97316' },
  { value: 'INSTALACAO', label: 'Instalação',  color: '#3b82f6' },
  { value: 'INTERNO',    label: 'COPE Interno', color: '#94a3b8' },
]

interface TelegramOrdensModalProps {
  open:   boolean
  onClose: () => void
  ordens: OSRow[]
}

function getTodayStrings() {
  const t  = new Date()
  const dd = String(t.getDate()).padStart(2, '0')
  const mm = String(t.getMonth() + 1).padStart(2, '0')
  const yyyy = String(t.getFullYear())
  return { hojeDMY: `${dd}/${mm}/${yyyy}`, hojeISO: `${yyyy}-${mm}-${dd}` }
}

export function TelegramOrdensModal({ open, onClose, ordens }: TelegramOrdensModalProps) {
  const logAudit   = useAuditStore(s => s.log)
  const [fornecedor, setFornecedor] = useState('WES')
  const [sending,    setSending]    = useState<'resumo' | 'detalhado' | null>(null)
  const [result,     setResult]     = useState<'ok' | 'error' | null>(null)

  const isFornGrupo = fornecedor === 'WES' || fornecedor === 'Instacable'
  const { hojeDMY, hojeISO } = getTodayStrings()

  const allRows = ordens.filter(r => r._fornecedor === fornecedor)
  const rows    = isFornGrupo
    ? allRows.filter(r => {
        const ag = (r.dataagendamento ?? '').trim()
        return ag.startsWith(hojeDMY) || ag.startsWith(hojeISO)
      })
    : allRows

  const equipes     = new Set(rows.map(r => (r.nomedaequipe as string)?.trim() || '(Sem Equipe)')).size
  const scopeLabel  = isFornGrupo ? `agendadas hoje · ${hojeDMY.slice(0, 5)}` : 'todas do período'
  const opt         = FORNECEDOR_OPTS.find(f => f.value === fornecedor)

  async function handleSend(modo: 'resumo' | 'detalhado') {
    setSending(modo)
    setResult(null)
    try {
      const label = opt?.label ?? fornecedor
      const color = opt?.color ?? '#3b82f6'
      const date  = new Date().toLocaleDateString('pt-BR')

      if (modo === 'resumo') {
        const caption = isFornGrupo
          ? `<b>Cabonnet · ${label} — Resumo</b>\nOS agendadas para hoje — ${date}\n${rows.length} OS · ordenado menor → maior`
          : `<b>Cabonnet · ${label} — Resumo</b>\nOS por equipe — ${date}\n${rows.length} OS · ordenado menor → maior`
        await telegram.sendPhoto(captureOSPorEquipe(rows as CaptureOSRow[], label, color), caption, 'alertas')
      } else {
        const caption = isFornGrupo
          ? `<b>Cabonnet · ${label} — Relatório Detalhado</b>\nOS agendadas para hoje — ${date}\n${rows.length} OS`
          : `<b>Cabonnet · ${label} — Relatório Detalhado</b>\nTodas as OS por equipe — ${date}\n${rows.length} OS`
        await telegram.sendPhoto(captureOSDetalhado(rows as CaptureOSRow[], label, color), caption, 'alertas', true)
      }

      logAudit(`Telegram enviado (${modo})`, `${opt?.label ?? fornecedor} · ${rows.length} OS`, 'telegram')
      setResult('ok')
      setTimeout(() => { onClose(); setResult(null) }, 1800)
    } catch {
      setResult('error')
    } finally {
      setSending(null)
    }
  }

  function handleClose() {
    if (!sending) { setResult(null); onClose() }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Enviar via Telegram"
      subtitle="Captura OS por equipe e envia para Alertas | Cabonnet"
      maxWidth="480px"
    >
      <div className="p-6 space-y-5">

        {/* Seletor de fornecedor */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-muted uppercase tracking-wide">Fornecedor</p>
          <div className="flex flex-wrap gap-2">
            {FORNECEDOR_OPTS.map(o => {
              const cnt    = ordens.filter(r => r._fornecedor === o.value).length
              const active = fornecedor === o.value
              return (
                <button
                  key={o.value}
                  onClick={() => { setFornecedor(o.value); setResult(null) }}
                  disabled={!!sending}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] font-semibold
                              transition-all duration-fast
                              ${active
                                ? 'border-border0 bg-surface text-text'
                                : 'border-white/[0.08] text-muted hover:text-secondary hover:border-border0'}`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: o.color }} />
                  {o.label}
                  <span className={`text-[10px] font-normal ${active ? 'text-secondary' : 'text-muted'}`}>{cnt}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg bg-elevated border border-white/[0.08] px-4 py-3 text-[12px] space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-text">{opt?.label}</p>
            <span className="text-[10px] text-muted">Alertas | Cabonnet</span>
          </div>
          {isFornGrupo && (
            <p className="text-[10px] text-cyan font-semibold">
              📅 Somente OS agendadas para hoje ({rows.length} de {allRows.length} total)
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-surface/30 rounded px-3 py-2 space-y-0.5">
              <p className="text-[11px] font-bold text-muted uppercase tracking-wide">Resumo</p>
              <p className="text-secondary text-[12px]">{equipes} equipes · {rows.length} OS</p>
              <p className="text-muted text-[11px]">Imagem · {scopeLabel}</p>
            </div>
            <div className="bg-surface/30 rounded px-3 py-2 space-y-0.5">
              <p className="text-[11px] font-bold text-muted uppercase tracking-wide">Detalhado</p>
              <p className="text-secondary text-[12px]">{rows.length} OS individualmente</p>
              <p className="text-muted text-[11px]">Documento · {scopeLabel}</p>
            </div>
          </div>
        </div>

        {/* Feedback */}
        {result === 'ok' && (
          <div className="flex items-center gap-2 text-green text-[13px] font-semibold">
            <CheckCircle size={16} /> Enviado com sucesso!
          </div>
        )}
        {result === 'error' && (
          <div className="flex items-center gap-2 text-red text-[13px] font-semibold">
            <XCircle size={16} /> Falha ao enviar. Verifique o servidor.
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={!!sending}>
            Cancelar
          </Button>
          <Button
            variant="outline" size="sm" className="gap-1.5"
            onClick={() => handleSend('resumo')}
            disabled={!!sending}
          >
            {sending === 'resumo'
              ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Gerando…</>
              : <><Send size={11} /> Resumo</>}
          </Button>
          <Button
            size="sm" className="gap-1.5"
            onClick={() => handleSend('detalhado')}
            disabled={!!sending}
          >
            {sending === 'detalhado'
              ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Gerando…</>
              : <><Send size={11} /> Detalhado</>}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
