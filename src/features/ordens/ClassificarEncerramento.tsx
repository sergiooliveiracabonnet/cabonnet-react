import { Wrench, Package, User, HelpCircle, Check } from 'lucide-react'
import { useMotivoEncerramento } from '../../hooks/useMotivoEncerramento'

// Classificação manual de "por que essa OS encerrou assim" — mesmas 4 categorias
// que o Telegram já usa para revisitas (bot.py), mas disponível para QUALQUER OS
// concluída, não só as que o bot detectou automaticamente como retorno de cliente.
// Alimenta a mesma causa raiz real em Qualidade (/erp/qualidade).

const MOTIVOS = [
  { value: 'Material', label: 'Material',  icon: Package     },
  { value: 'Técnico',   label: 'Técnico',   icon: Wrench      },
  { value: 'Cliente',   label: 'Cliente',   icon: User        },
  { value: 'Outro',     label: 'Outro',     icon: HelpCircle  },
]

export function ClassificarEncerramento({ numos, nomedaequipe, nomedacidade }: {
  numos: string; nomedaequipe?: string; nomedacidade?: string
}) {
  const { data: existente, isLoading, classificar } = useMotivoEncerramento(numos)

  if (isLoading) return null

  return (
    <div className="bg-surface/30 border border-white/[0.08] rounded-xl p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption font-semibold text-secondary">
          {existente ? 'Motivo do encerramento' : 'Classificar motivo do encerramento'}
        </p>
        {existente && (
          <span className="flex items-center gap-1 text-caption font-semibold text-green">
            <Check size={11} /> {existente.motivo}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MOTIVOS.map(m => {
          const ativo = existente?.motivo === m.value
          return (
            <button
              key={m.value}
              onClick={() => classificar(m.value, { nomedaequipe, nomedacidade })}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-caption font-medium
                          transition-colors ${
                            ativo
                              ? 'border-green/40 bg-green/10 text-green'
                              : 'border-white/[0.08] text-muted hover:text-text hover:border-muted/30'
                          }`}
            >
              <m.icon size={11} /> {m.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
