import type { ReactNode } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { fmtDate, situacaoVariant, FORN_LABEL, shortEquipe } from '../../lib/osFormat'
import type { OSRow } from '../../lib/types'

interface FieldProps { label: string; value?: string | number | null; mono?: boolean; full?: boolean; highlight?: boolean }
function Field({ label, value, mono = false, full = false, highlight = false }: FieldProps) {
  return (
    <div className={`rounded-xl p-4 border
                     ${highlight ? 'bg-primary/5 border-primary/20' : 'bg-white/[0.03] border-white/[0.07]'}
                     ${full ? 'col-span-2' : ''}`}>
      <p className="font-headline text-[10px] font-bold uppercase tracking-[1.4px] text-muted mb-1.5">
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
    <p className="font-headline text-[10px] font-bold uppercase tracking-[1.6px] text-muted/70 mb-3 flex items-center gap-3">
      <span className="flex-1 h-px bg-white/[0.06]" />
      {children}
      <span className="flex-1 h-px bg-white/[0.06]" />
    </p>
  )
}

interface OSDetailModalProps { os?: OSRow | null; open: boolean; onClose: () => void }
export function OSDetailModal({ os: osRow, open, onClose }: OSDetailModalProps) {
  if (!osRow) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const os: any = osRow
  const fornLabel = (FORN_LABEL as Record<string, string>)[os._fornecedor] ?? os._fornecedor ?? '—'

  return (
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
                  <p className="font-headline text-[10px] font-bold uppercase tracking-[1px] text-red mb-1.5">
                    ⚠ Observação Crítica
                  </p>
                  <p className="text-[13px] text-red/90 leading-relaxed font-sans whitespace-pre-wrap">
                    {os.observacaocritica}
                  </p>
                </div>
              )}
              {(os.observacoes || os.obs || os.observacao) && (
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
                  <p className="text-[13px] text-secondary leading-relaxed font-sans whitespace-pre-wrap">
                    {os.observacoes || os.obs || os.observacao}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </Modal>
  )
}
