import { useState, type ReactNode } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { fmtDate, situacaoVariant, FORN_LABEL, shortEquipe } from '../../lib/osFormat'
import type { OSRow } from '../../lib/types'
import { CheckSquare, Square, XCircle } from 'lucide-react'
import { useOSDetails } from '../../hooks/useOSDetails'
import { osFotoUrl } from '../../lib/api'

interface FieldProps { label: string; value?: string | number | null; mono?: boolean; full?: boolean; highlight?: boolean }
function Field({ label, value, mono = false, full = false, highlight = false }: FieldProps) {
  return (
    <div className={`rounded-xl p-4 border
                     ${highlight ? 'bg-primary/5 border-primary/20' : 'bg-surface/30 border-white/[0.08]'}
                     ${full ? 'col-span-2' : ''}`}>
      <p className="font-headline text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">
        {label}
      </p>
      <p className={`text-[13px] font-semibold text-text break-words leading-snug
                     ${mono ? 'font-mono' : 'font-headline'}`}>
        {value ?? '—'}
      </p>
    </div>
  )
}

function SectionDivider({ children }: { children: ReactNode }) {
  return (
    <p className="font-headline text-[10px] font-bold uppercase tracking-[0.07em] text-muted/70 mb-3 flex items-center gap-3">
      <span className="flex-1 h-px bg-surface" />
      {children}
      <span className="flex-1 h-px bg-surface" />
    </p>
  )
}

function FotoLightbox({ numos, foto, onClose }: {
  numos: string | number
  foto:  { codfoto: number; nomearquivo: string; descricao: string | null } | null
  onClose: () => void
}) {
  if (!foto) return null
  return (
    <Modal open={!!foto} onClose={onClose} title={foto.descricao || foto.nomearquivo} maxWidth="900px">
      <div className="p-4 flex items-center justify-center bg-black/40">
        <img
          src={osFotoUrl(numos, foto.codfoto)}
          alt={foto.descricao || foto.nomearquivo}
          className="max-h-[70vh] max-w-full object-contain rounded-lg"
        />
      </div>
    </Modal>
  )
}

interface OSDetailModalProps { os?: OSRow | null; open: boolean; onClose: () => void }
export function OSDetailModal({ os: osRow, open, onClose }: OSDetailModalProps) {
  const [lightboxFoto, setLightboxFoto] = useState<{ codfoto: number; nomearquivo: string; descricao: string | null } | null>(null)
  const { details } = useOSDetails(osRow?.numos)

  if (!osRow) return null

  const os: any = osRow
  const fornLabel = (FORN_LABEL as Record<string, string>)[os._fornecedor] ?? os._fornecedor ?? '—'
  const fotos              = details?.fotos              ?? []
  const checklist           = details?.checklist           ?? []
  const motivoInconclusivo  = details?.motivoInconclusivo  ?? null

  return (
    <>
    <Modal open={open} onClose={onClose}
      title={`OS #${os.numos} — Detalhes Completos`}
      subtitle={os.nomecliente}
      maxWidth="860px"
    >
      <div className="p-6 space-y-6 overflow-auto max-h-[70vh] pb-8">

        {/* Badges de status */}
        <div className="flex flex-wrap gap-2">
          <Badge variant={situacaoVariant(os.descsituacao)}>{os.descsituacao ?? '—'}</Badge>
          {os._aging != null && (
            <Badge variant={os._aging >= 6 ? 'red' : os._aging >= 3 ? 'yellow' : 'cyan'}>
              Aging {os._aging}d
            </Badge>
          )}
          {os._slaCritico  && <Badge variant="red">SLA Crítico</Badge>}
          {os._slaExcedido && !os._slaCritico && <Badge variant="orange">SLA Excedido</Badge>}
          {os._slaSemAgend && <Badge variant="yellow">Sem Agendamento</Badge>}
          {os._fornecedor && os._fornecedor !== 'OUTRO' && (
            <Badge variant="purple">{fornLabel}</Badge>
          )}
        </div>

        {/* Identificação */}
        <div>
          <SectionDivider>Identificação</SectionDivider>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Número OS"   value={os.numos}       mono highlight />
            <Field label="Contrato"    value={os.codigocontrato || os.numcontrato} mono />
            <Field label="Empresa"     value={os.empresa || os['empresa(carteira)']} />
            <Field label="Tipo Equipe" value={os._tipo} />
          </div>
        </div>

        {/* Cliente */}
        <div>
          <SectionDivider>Cliente</SectionDivider>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome"      value={os.nomecliente}  full />
            <Field label="Cidade"    value={os.nomedacidade} />
            <Field label="Bairro"    value={os.bairro} />
            <Field label="Endereço"  value={os.logradouro}   full />
            {os.cep && <Field label="CEP" value={os.cep} mono />}
          </div>
        </div>

        {/* Serviço & Equipe */}
        <div>
          <SectionDivider>Serviço & Equipe</SectionDivider>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo de Serviço" value={os.tiposervico} />
            <Field label="Equipe"          value={shortEquipe(os.nomedaequipe)} />
            <Field label="Fornecedor"      value={fornLabel} />
            <Field label="SLA Tipo"        value={os._slaTipoLabel} />
            <Field label="Descrição"       value={os.servico} full />
          </div>
        </div>

        {/* SLA & Aging */}
        <div>
          <SectionDivider>SLA & Aging</SectionDivider>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Aging desde Abertura"    value={os._agingAbertura    != null ? `${os._agingAbertura} dias`    : '—'} mono />
            <Field label="Aging desde Agendamento" value={os._agingAgendamento != null ? `${os._agingAgendamento} dias` : '—'} mono />
            <Field label="Limite SLA"              value={os._slaLimite        != null ? `${os._slaLimite} dias`        : '—'} mono />
            <Field label="Dias até Agendamento"    value={os._diasAteAgendamento != null ? `${os._diasAteAgendamento} dias` : '—'} mono />
          </div>
        </div>

        {/* Datas */}
        <div>
          <SectionDivider>Datas</SectionDivider>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Abertura / Cadastro"  value={fmtDate(os.datacadastro)}    mono />
            <Field label="Agendamento"           value={fmtDate(os.dataagendamento)} mono />
            {(os.periodo || os.horaatendimento) && (
              <Field
                label="Período"
                value={[os.periodo, os.horaatendimento ? `${os.horaatendimento}h` : ''].filter(Boolean).join(' · ')}
                mono
              />
            )}
            {os.dataatendimento && (
              <Field label="1º Agendamento"      value={fmtDate(os.dataatendimento)} mono />
            )}
            {os.datainicio && (
              <Field label="Início da Execução"  value={fmtDate(os.datainicio)}      mono />
            )}
            {os.dataexecucao && (
              <Field label="Fim da Execução"     value={fmtDate(os.dataexecucao)}    mono />
            )}
            {os.databaixa && (
              <Field label="Baixa / Fechamento"  value={fmtDate(os.databaixa)}       mono />
            )}
          </div>
        </div>

        {/* Observações */}
        {(os.observacaocritica || os.observacoes || os.obs || os.observacao) && (
          <div>
            <SectionDivider>Observações</SectionDivider>
            <div className="space-y-3">
              {os.observacaocritica && (
                <div className="bg-red/[0.07] border border-red/25 rounded-xl p-4">
                  <p className="font-headline text-[10px] font-bold uppercase tracking-[0.05em] text-red mb-1.5">
                    ⚠ Observação Crítica
                  </p>
                  <p className="text-[13px] text-red/90 leading-relaxed font-sans whitespace-pre-wrap">
                    {os.observacaocritica}
                  </p>
                </div>
              )}
              {(os.observacoes || os.obs || os.observacao) && (
                <div className="bg-surface/30 border border-white/[0.08] rounded-xl p-4">
                  <p className="text-[13px] text-secondary leading-relaxed font-sans whitespace-pre-wrap">
                    {os.observacoes || os.obs || os.observacao}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Motivo de Inconclusão */}
        {motivoInconclusivo && (
          <div>
            <SectionDivider>Motivo de Inconclusão</SectionDivider>
            <div className="bg-yellow/[0.07] border border-yellow/25 rounded-xl p-4 flex items-start gap-2.5">
              <XCircle size={15} className="text-yellow flex-shrink-0 mt-0.5" />
              <p className="text-[13px] text-yellow/90 leading-relaxed">{motivoInconclusivo}</p>
            </div>
          </div>
        )}

        {/* Checklist de Execução */}
        {checklist.length > 0 && (
          <div>
            <SectionDivider>Checklist de Execução</SectionDivider>
            <div className="space-y-1.5">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 bg-surface/30 border border-white/[0.08] rounded-lg px-3 py-2">
                  {item.checked
                    ? <CheckSquare size={13} className="text-green flex-shrink-0" />
                    : <Square size={13} className="text-muted/50 flex-shrink-0" />}
                  <span className="text-[12px] text-secondary flex-1">{item.descricao}</span>
                  <span className="text-[10px] text-muted">{item.servico}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fotos da Execução */}
        {fotos.length > 0 && (
          <div>
            <SectionDivider>Fotos da Execução</SectionDivider>
            <div className="grid grid-cols-4 gap-2">
              {fotos.map(foto => (
                <button
                  key={foto.codfoto}
                  onClick={() => setLightboxFoto(foto)}
                  className="aspect-square rounded-lg border border-white/[0.08] overflow-hidden bg-surface/30
                             hover:border-primary/40 transition-colors"
                >
                  <img
                    src={osFotoUrl(os.numos, foto.codfoto)}
                    alt={foto.descricao || foto.nomearquivo}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15' }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </Modal>
    <FotoLightbox numos={os.numos} foto={lightboxFoto} onClose={() => setLightboxFoto(null)} />
    </>
  )
}
