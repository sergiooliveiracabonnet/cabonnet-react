import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { useRevisitaMotivos } from '../../../hooks/useRevisitaMotivos'

// Causa raiz REAL de revisitas — não é IA nem estimativa com percentual fixo.
// É a classificação que o próprio operador registra no Telegram, um clique por
// OS, no momento em que o sistema detecta o retorno do cliente. Vem de
// status_history.revisita_motivo (cabonnet/bot.py) — dado que já era capturado
// mas nunca tinha sido lido de volta em nenhuma tela.

const MOTIVO_COLOR: Record<string, string> = {
  'Material / Equipamento': '#f97316',
  'Execução / Técnico':     '#f87171',
  'Cliente':                '#22d3ee',
  'Outro':                  '#94a3b8',
}

function motivoColor(m: string): string {
  return MOTIVO_COLOR[m] ?? '#94a3b8'
}

const PERIODOS = [
  { value: 30,  label: '30 dias'  },
  { value: 90,  label: '90 dias'  },
  { value: 180, label: '180 dias' },
]

export function RevisitaMotivosSection() {
  const [dias, setDias] = useState(90)
  const { data, isLoading, isError } = useRevisitaMotivos(dias)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-muted">
          Motivo registrado pelo time — pelo Telegram na revisita ou classificado direto na OS. Não é estimativa.
        </p>
        <div className="flex rounded-lg border border-white/[0.08] bg-surface/40 overflow-hidden text-[11px]">
          {PERIODOS.map(p => (
            <button key={p.value} onClick={() => setDias(p.value)}
                    className={`px-2.5 py-1 transition-colors ${
                      dias === p.value ? 'bg-primary/20 text-primary font-semibold' : 'text-muted hover:text-text'
                    }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-[12px] text-muted">
          <div className="w-3.5 h-3.5 border border-primary border-t-transparent rounded-full animate-spin" />
          Carregando motivos registrados…
        </div>
      )}

      {isError && (
        <p className="text-[12px] text-red-400 py-4">Erro ao carregar motivos de revisita.</p>
      )}

      {data && data.total === 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-card px-4 py-6 text-center">
          <ClipboardCheck size={18} className="text-muted mx-auto mb-2" />
          <p className="text-[12px] text-muted">
            Nenhuma revisita foi classificada pelo time nos últimos {dias} dias.
          </p>
          <p className="text-[11px] text-muted/70 mt-1">
            A classificação acontece pelo botão que o Telegram envia quando detecta o retorno de um cliente.
          </p>
        </div>
      )}

      {data && data.total > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted mb-3">
            {data.total} revisita{data.total !== 1 ? 's' : ''} classificada{data.total !== 1 ? 's' : ''} pelo time
          </p>
          {data.distribuicao.map(d => (
            <div key={d.motivo} className="flex items-center gap-3">
              <span className="text-[11px] text-text w-44 flex-shrink-0 truncate">{d.motivo}</span>
              <div className="flex-1 h-1.5 bg-surface/40 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                     style={{ width: `${d.pct}%`, background: motivoColor(d.motivo) }} />
              </div>
              <span className="font-mono font-bold text-[13px] w-6 text-right"
                    style={{ color: motivoColor(d.motivo) }}>{d.count}</span>
              <span className="text-[10px] text-muted w-9 text-right">{d.pct}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
