import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle, Clock, Calendar, ExternalLink, MapPin, Users, Wrench,
  AlertTriangle, Hash, Check, Filter, FileText, Copy, ClipboardList,
} from 'lucide-react'
import type { OSRow, Fornecedor } from '../../lib/types'

interface StepItem {
  icon:     React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>
  color:    string
  label:    string
  date?:    string | null
  equipe?:  string
  done?:    boolean
  obs?:     string | null
  details?: Record<string, unknown>
}
import { Drawer }        from '../../components/ui/Drawer'
import { Badge }         from '../../components/ui/Badge'
import { fmtDate, situacaoVariant, FORN_LABEL, shortEquipe, calcDuracao, buildOSWhatsApp } from '../../lib/osFormat'
import { TimelineStep }  from './TimelineStep'
import { OSDetailModal } from './OSDetailModal'
import { useOSDetails }  from '../../hooks/useOSDetails'
import { useAgendamentoHistorico } from '../../hooks/useAgendamentoHistorico'
import { ClassificarEncerramento } from './ClassificarEncerramento'

export default function OSDrawer({ os: osMaybe, onClose }: { os: OSRow | null; onClose: () => void }) {
  const [showModal, setShowModal] = useState(false)
  const [copied,    setCopied]    = useState<string | null>(null)
  const navigate = useNavigate()
  const { details: osDetails, isLoading: loadingDetails } = useOSDetails(osMaybe?.numos)
  const { historico: agendamentoHistorico } = useAgendamentoHistorico(osMaybe?.numos)

  if (!osMaybe) return null
  // Alias não-nulo — TypeScript não estreita em closures, então criamos uma const local
  const os = osMaybe

  function copyWith(key: string, text: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  function openMaps() {
    const addr = [os.logradouro || os.enderecoconexao, os.numero, os.bairro, os.nomedacidade].filter(Boolean).join(', ')
    if (!addr) return
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, '_blank')
  }

  function handleVerEquipe() {
    if (!os.nomedaequipe) return
    onClose()
    navigate('/ordens', { state: { filterEquipe: os.nomedaequipe } })
  }

  const sit           = os._situacaoEfetiva ?? os.descsituacao
  const isConcluida   = sit === 'Concluída'
  const isAtendimento = sit === 'Atendimento'
  const hasAgend      = !!os.dataagendamento?.trim()
  const obsGeral = os.observacoes || os.obs || os.observacao || os.nota
               || os.descricaoobs || os.descricao_obs || os.historico
               || os.informacoes || os.detalhes || os.descricao || null
  const obsCrit = os.observacaocritica || os.obscritica || null
  const fornLabel     = FORN_LABEL[os._fornecedor as Fornecedor] ?? os._fornecedor ?? null
  const hasAtend      = !!(os.dataatendimento as string | undefined)?.trim()
  const hasIni        = !!(os.datainicio as string | undefined)?.trim()
  const hasExec       = !!os.dataexecucao?.trim()
  const hasBaixa      = !!os.databaixa?.trim()

  const agingVal  = os._aging ?? 0
  const agingCls  = agingVal >= 6 ? 'text-red' : agingVal >= 3 ? 'text-yellow' : 'text-cyan'

  // Status accent color para barra lateral
  const statusAccent = isConcluida ? 'bg-green/70' : isAtendimento ? 'bg-cyan/70' : 'bg-yellow/70'

  const duracao = calcDuracao(os.datainicio as string | undefined, os.dataexecucao)

  // Dados do técnico (mobile) vindos do /detalhes
  const d = osDetails  // atalho

  const obsTecnico       = loadingDetails ? '⏳ Carregando…' : (d?.obsTecnico || obsGeral || null)
  const nomeTecnico      = d?.nomeTecnico || null
  const historico        = d?.historico   || []
  const materiais        = d?.materiais   || []
  const matRetirados     = d?.materiaisRetirados || []
  const dataContratacao  = d?.datacontratacao || null
  const dataInstalacao   = d?.datainstalacao  || null
  const situacaoContrato = d?.situacaocontrato ?? null
  const valorContrato    = d?.valorcontrato    ?? null

  const SITUACAO_CONTRATO: Record<number, string> = {
    1: 'Prospecto', 2: 'Ativo', 3: 'Suspenso', 4: 'Bloqueado', 5: 'Cancelado', 6: 'Desistência',
  }
  const situacaoContratoLabel = situacaoContrato != null
    ? (SITUACAO_CONTRATO[situacaoContrato] ?? `Código ${situacaoContrato}`)
    : null

  // Equipes por papel — vindas do /detalhes (mais precisas) ou fallback do CSV
  const eqAgendada = shortEquipe((d?.equipeAgendada || os.nomedaequipe) as string)
  const eqExecutou = shortEquipe((d?.equipeExecutou || (os as Record<string,unknown>).equipeexecutou || os.nomedaequipe) as string)
  // Equipes diferentes = outra equipe assumiu a OS
  const eqsDiferem = d && eqAgendada && eqExecutou && eqAgendada !== eqExecutou

  // Histórico real de equipe/data por agendamento (cache.py grava 1 linha a cada
  // troca detectada). Sem isso, o Grafana só devolve o estado atual da OS e
  // reagendamentos anteriores para outras equipes ficam invisíveis na timeline.
  const agendamentoSteps: StepItem[] = !hasAgend ? [] : agendamentoHistorico.length > 1
    ? agendamentoHistorico.map((h, idx) => {
        const isLast = idx === agendamentoHistorico.length - 1
        return {
          icon: Calendar,
          color: isLast ? (isConcluida || isAtendimento ? 'green' : 'yellow') : 'cyan',
          label: idx === 0 ? 'Agendamento' : `Reagendamento ${idx}`,
          date: fmtDate(h.dataagendamento),
          equipe: shortEquipe(h.nomedaequipe) || undefined,
          done: !isLast || isConcluida || isAtendimento,
          details: isLast ? {
            hora:          os.horaatendimento || null,
            periodo:       os.periodo         || null,
            servico:       os.servico         || null,
            equipeReagend: d?.equipeReagend   || null,
            reagendada:    d?.reagendada      ?? null,
            historico:     loadingDetails ? null : historico,
          } : undefined,
        }
      })
    : [{
        icon: Calendar, color: isConcluida || isAtendimento ? 'green' : 'yellow',
        label: 'Agendamento', date: fmtDate(os.dataagendamento),
        equipe: eqAgendada, done: isConcluida || isAtendimento,
        details: {
          hora:          os.horaatendimento || null,
          periodo:       os.periodo         || null,
          servico:       os.servico         || null,
          equipeReagend: d?.equipeReagend   || null,
          reagendada:    d?.reagendada      ?? null,
          historico:     loadingDetails ? null : historico,
        },
      }]

  const steps = [
    {
      icon: Clock, color: 'primary', label: 'Abertura da OS',
      date: fmtDate(os.datacadastro), equipe: eqAgendada, done: true,
      details: {
        contrato: os.codigocontrato || os.numcontrato || null,
        servico:  os.servico || os.tiposervico || null,
      },
    },
    ...agendamentoSteps,
    hasAtend && {
      icon: Calendar, color: 'cyan', label: '1º Agendamento',
      date: fmtDate(os.dataatendimento as string), equipe: eqAgendada,
      done: isConcluida || isAtendimento,
      details: {
        hora:      os.horaatendimento || null,
        periodo:   os.periodo         || null,
        historico: loadingDetails ? null : historico,
      },
    },
    hasIni && {
      icon: Wrench, color: 'cyan', label: 'Início da Execução',
      // Mostra quem executou — pode ser diferente de quem foi agendado
      date: fmtDate(os.datainicio as string), equipe: eqExecutou, done: true,
      details: {
        nomeTecnico,
        equipeAgendada: eqsDiferem ? eqAgendada : null, // destaca troca de equipe
        obs: obsTecnico || obsGeral,
      },
    },
    hasExec && {
      icon: CheckCircle, color: 'green', label: 'Fim da Execução',
      date: fmtDate(os.dataexecucao), equipe: eqExecutou, done: true,
      details: {
        nomeTecnico,
        equipeAgendada: eqsDiferem ? eqAgendada : null,
        duracao,
        obs:       obsTecnico || obsGeral,
        materiais,
        matRetirados,
      },
    },
    hasBaixa && !hasExec && {
      icon: CheckCircle, color: 'green', label: 'Baixa / Fechamento',
      date: fmtDate(os.databaixa), done: true,
      details: {
        obs: obsTecnico || obsGeral,
        materiais,
      },
    },
    {
      icon: isConcluida ? CheckCircle : isAtendimento ? Wrench : AlertTriangle,
      color: isConcluida ? 'green' : isAtendimento ? 'cyan' : 'yellow',
      label: sit ?? 'Status atual', done: isConcluida,
    },
  ].filter(Boolean) as StepItem[]

  return (
    <>
      <Drawer
        open={!!os}
        onClose={onClose}
        title={`OS ${os.numos}`}
        subtitle={os.nomecliente}
        width="580px"
        actions={
          <div className="flex items-center gap-1">
            <ActionBtn title="Copiar só a OS (resumo)" active={copied === 'wha'} onClick={() => copyWith('wha', buildOSWhatsApp(os))}>
              {copied === 'wha' ? <Check size={13} /> : <Copy size={13} />}
            </ActionBtn>
            <ActionBtn title="Copiar OS + histórico" active={copied === 'wha-full'} onClick={() => copyWith('wha-full', buildOSWhatsApp(os, osDetails?.historico))}>
              {copied === 'wha-full' ? <Check size={13} /> : <ClipboardList size={13} />}
            </ActionBtn>
            <ActionBtn title="Copiar nº da OS" active={copied === 'num'} onClick={() => copyWith('num', String(os.numos))}>
              {copied === 'num' ? <Check size={13} /> : <Hash size={13} />}
            </ActionBtn>
            <ActionBtn title="Abrir no Google Maps" onClick={openMaps}>
              <MapPin size={13} />
            </ActionBtn>
            {os.nomedaequipe && (
              <ActionBtn title={`Filtrar OS da equipe`} onClick={handleVerEquipe}>
                <Filter size={13} />
              </ActionBtn>
            )}
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-xl border border-primary/30 bg-primary/10
                         text-label font-semibold text-primary hover:bg-primary/20 transition-all duration-fast ml-1"
            >
              <ExternalLink size={12} /> Detalhes
            </button>
          </div>
        }
      >
        {/* Barra de status lateral */}
        <div className="relative">
          <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${statusAccent}`} />

          <div className="px-5 py-4 space-y-4">

            {/* ── 1. Hero Status ───────────────────────────────────────── */}
            <div className="bg-surface/30 border border-white/[0.08] rounded-xl overflow-hidden">
              <div className="flex items-stretch divide-x divide-white/[0.06]">

                {/* Situação */}
                <div className="flex-1 px-4 py-3 flex flex-col gap-1.5">
                  <span className="text-caption font-bold uppercase tracking-[0.05em] text-muted">Situação</span>
                  <Badge variant={situacaoVariant(sit)} className="w-fit">{sit ?? '—'}</Badge>
                </div>

                {/* Aging */}
                {os._aging != null && (
                  <div className="px-4 py-3 flex flex-col gap-1 items-center justify-center min-w-[72px]">
                    <span className="text-caption font-bold uppercase tracking-[0.05em] text-muted">Aging</span>
                    <span className={`font-mono font-black text-[22px] leading-none ${agingCls}`}>
                      {os._aging}<span className="text-label font-semibold ml-0.5 opacity-60">d</span>
                    </span>
                  </div>
                )}

                {/* SLA */}
                <div className="px-4 py-3 flex flex-col gap-1.5 items-center justify-center min-w-[80px]">
                  <span className="text-caption font-bold uppercase tracking-[0.05em] text-muted">SLA</span>
                  {os._slaCritico
                    ? <Badge variant="red">Crítico</Badge>
                    : os._slaExcedido
                    ? <Badge variant="orange">Excedido</Badge>
                    : <Badge variant="green">OK</Badge>
                  }
                </div>

                {/* Fornecedor */}
                {fornLabel && (
                  <div className="px-4 py-3 flex flex-col gap-1.5 items-center justify-center min-w-[72px]">
                    <span className="text-caption font-bold uppercase tracking-[0.05em] text-muted">Frente</span>
                    <span className="text-caption font-semibold text-secondary">{fornLabel}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── 2. Observações ───────────────────────────────────────── */}
            <Section label="Observações">
              {obsCrit && (
                <div className="bg-red/[0.08] border border-red/20 rounded-xl p-4">
                  <p className="text-caption font-bold uppercase tracking-[0.05em] text-red mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={11} /> Observação Crítica
                  </p>
                  <p className="text-label text-red/85 leading-relaxed whitespace-pre-wrap">{obsCrit as string}</p>
                </div>
              )}
              {obsGeral ? (
                <div className="bg-surface/30 border border-white/[0.08] rounded-xl p-4">
                  <p className="text-label text-secondary leading-relaxed whitespace-pre-wrap">{obsGeral as string}</p>
                </div>
              ) : !obsCrit && (
                <p className="text-label text-muted/60 italic px-1">Nenhuma observação registrada.</p>
              )}
              {isConcluida && (
                <ClassificarEncerramento
                  numos={os.numos}
                  nomedaequipe={os.nomedaequipe as string | undefined}
                  nomedacidade={os.nomedacidade as string | undefined}
                />
              )}
            </Section>

            {/* ── 3. Localização ───────────────────────────────────────── */}
            <Section label="Localização & Serviço">
              {/* Endereço */}
              <button
                onClick={openMaps}
                className="w-full bg-surface/30 border border-white/[0.08] rounded-xl px-4 py-3
                           flex items-start gap-3 text-left hover:bg-surface/40 hover:border-white/[0.08]
                           transition-all duration-fast group"
              >
                <MapPin size={14} className="text-muted flex-shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                <div className="min-w-0 flex-1">
                  <p className="text-caption text-muted font-medium mb-0.5">
                    {[os.nomedacidade, os.bairro].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {(os.logradouro || os.enderecoconexao) ? (
                    <p className="text-body font-semibold text-text leading-snug">
                      {[os.logradouro || os.enderecoconexao, os.numero, os.complemento].filter(Boolean).join(', ')}
                    </p>
                  ) : (
                    <p className="text-label text-muted italic">Endereço não cadastrado</p>
                  )}
                </div>
                <ExternalLink size={11} className="text-muted/40 group-hover:text-primary/60 flex-shrink-0 mt-1 transition-colors" />
              </button>

              {/* Equipe (destaque) + Tipo */}
              <div className="grid grid-cols-2 gap-2">
                <InfoCard
                  icon={Users}
                  label="Equipe responsável"
                  value={shortEquipe(os.nomedaequipe) || 'Sem equipe'}
                  prominent
                  action={os.nomedaequipe ? { label: 'Ver OS', onClick: handleVerEquipe } : null}
                />
                <InfoCard
                  icon={Wrench}
                  label="Tipo de serviço"
                  value={os.tiposervico || '—'}
                />
              </div>

              {/* Linha de metadados: contrato · serviço */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                {!!os.codigocontrato && (
                  <MetaItem label="Contrato" value={os.codigocontrato as string} mono />
                )}
                {os.servico && (
                  <MetaItem label="Serviço" value={os.servico} />
                )}
              </div>
            </Section>

            {/* ── 3. SLA & Aging detalhado ─────────────────────────────── */}
            {(os._agingAbertura != null || os._slaLimite != null || os._diasAteAgendamento != null) && (
              <Section label="SLA & Prazo">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    os._agingAbertura     != null && { label: 'Aging desde abertura', value: `${os._agingAbertura}d`,     color: agingCls },
                    os._slaLimite         != null && { label: 'Limite do SLA',         value: `${os._slaLimite}d`,         color: 'text-primary' },
                    os._diasAteAgendamento!= null && { label: 'Dias até agend.',        value: `${os._diasAteAgendamento}d`, color: 'text-secondary' },
                  ].filter(Boolean).map((item) => { const { label, value, color } = item as { label: string; value: string; color: string }; return (
                    <div key={label} className="bg-surface/30 border border-white/[0.08] rounded-xl p-3 text-center">
                      <p className="text-caption font-bold uppercase tracking-[0.05em] text-muted mb-2 leading-tight">{label}</p>
                      <p className={`font-mono text-[20px] font-black leading-none ${color}`}>{value}</p>
                    </div>
                  )})}
                </div>
              </Section>
            )}

            {/* ── 4. Contrato do Cliente ───────────────────────────────── */}
            {(loadingDetails || dataContratacao || dataInstalacao || situacaoContratoLabel) && (
              <Section label="Contrato do cliente">
                {loadingDetails ? (
                  <p className="text-label text-muted/60 italic px-1">Carregando dados do contrato…</p>
                ) : (
                  <div className="bg-surface/30 border border-white/[0.08] rounded-xl overflow-hidden">
                    <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
                      {dataContratacao && (
                        <div className="px-4 py-3 flex flex-col gap-1">
                          <span className="text-caption font-bold uppercase tracking-[0.05em] text-muted flex items-center gap-1.5">
                            <FileText size={10} /> Contratação
                          </span>
                          <span className="text-body font-semibold text-text font-mono tabular-nums">
                            {dataContratacao}
                          </span>
                        </div>
                      )}
                      {dataInstalacao && (
                        <div className="px-4 py-3 flex flex-col gap-1">
                          <span className="text-caption font-bold uppercase tracking-[0.05em] text-muted flex items-center gap-1.5">
                            <Wrench size={10} /> Instalação
                          </span>
                          <span className="text-body font-semibold text-text font-mono tabular-nums">
                            {dataInstalacao}
                          </span>
                        </div>
                      )}
                    </div>
                    {(situacaoContratoLabel || (valorContrato != null && valorContrato > 0)) && (
                      <div className="border-t border-white/[0.06] grid grid-cols-2 divide-x divide-white/[0.06]">
                        {situacaoContratoLabel && (
                          <div className="px-4 py-3 flex flex-col gap-1">
                            <span className="text-caption font-bold uppercase tracking-[0.05em] text-muted">Situação</span>
                            <span className={`text-label font-semibold ${
                              situacaoContrato === 2 ? 'text-green' :
                              situacaoContrato === 5 ? 'text-red' :
                              situacaoContrato === 3 || situacaoContrato === 4 ? 'text-yellow' : 'text-secondary'
                            }`}>
                              {situacaoContratoLabel}
                            </span>
                          </div>
                        )}
                        {valorContrato != null && valorContrato > 0 && (
                          <div className="px-4 py-3 flex flex-col gap-1">
                            <span className="text-caption font-bold uppercase tracking-[0.05em] text-muted">Valor mensal</span>
                            <span className="text-body font-semibold text-text tabular-nums">
                              {valorContrato.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Section>
            )}

            {/* ── 5. Linha do Tempo ────────────────────────────────────── */}
            <Section label="Linha do tempo">
              <div className="pl-0.5">
                {steps.map((s, i) => (
                  <TimelineStep
                    key={i}
                    icon={s.icon}
                    color={s.color}
                    label={s.label}
                    date={s.date}
                    equipe={s.equipe}
                    obs={s.obs}
                    details={s.details}
                    done={s.done}
                    isLast={i === steps.length - 1}
                  />
                ))}
              </div>
            </Section>


          </div>
        </div>
      </Drawer>

      <OSDetailModal os={os} open={showModal} onClose={() => setShowModal(false)} />
    </>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <p className="text-caption font-bold uppercase tracking-[0.05em] text-muted whitespace-nowrap">{label}</p>
        <div className="flex-1 h-px bg-surface" />
      </div>
      {children}
    </div>
  )
}

function InfoCard({ icon: Icon, label, value, prominent = false, action = null }: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string; value: string | ReactNode
  prominent?: boolean; action?: { label: string; onClick: () => void } | null
}) {
  return (
    <div className={`rounded-xl border p-3.5 flex flex-col gap-2 min-w-0
                     ${prominent
                       ? 'bg-primary/[0.06] border-primary/20'
                       : 'bg-surface/30 border-white/[0.08]'}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={prominent ? 'text-primary/60' : 'text-muted'} />
        <p className={`text-caption font-bold uppercase tracking-[0.05em] leading-none
                       ${prominent ? 'text-primary/70' : 'text-muted'}`}>
          {label}
        </p>
      </div>
      <p className={`text-label font-semibold leading-snug break-words
                     ${prominent ? 'text-text' : 'text-secondary'}`}>
        {value}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="text-caption font-semibold text-primary/70 hover:text-primary text-left
                     transition-colors leading-none"
        >
          {action.label} →
        </button>
      )}
    </div>
  )
}

function MetaItem({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-caption text-muted">{label}:</span>
      <span className={`text-caption text-secondary ${mono ? 'font-mono' : 'font-medium'}`}>{value}</span>
    </div>
  )
}

function ActionBtn({ title, onClick, active = false, children }: {
  title: string; onClick: () => void; active?: boolean; children: ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all duration-fast
                  ${active
                    ? 'border-green/40 bg-green/15 text-green'
                    : 'border-white/[0.08] text-muted hover:text-text hover:bg-surface'}`}
    >
      {children}
    </button>
  )
}
