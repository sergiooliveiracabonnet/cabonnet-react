// @ts-nocheck
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle, Clock, Calendar, ExternalLink, MapPin, Users, Wrench,
  AlertTriangle, Circle, MessageSquare, Hash, Check, Filter, Phone,
} from 'lucide-react'
import { Drawer }        from '../../components/ui/Drawer'
import { Badge }         from '../../components/ui/Badge'
import { fmtDate, situacaoVariant, FORN_LABEL, shortEquipe, calcDuracao } from '../../lib/osFormat'
import { TimelineStep }  from './TimelineStep'
import { OSDetailModal } from './OSDetailModal'
import { useOSDetails }  from '../../hooks/useOSDetails'

export default function OSDrawer({ os, onClose }) {
  const [showModal, setShowModal] = useState(false)
  const [copied,    setCopied]    = useState(null)
  const navigate = useNavigate()
  const { details: osDetails, isLoading: loadingDetails } = useOSDetails(os?.numos)

  if (!os) return null

  function copyWith(key, text) {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  function buildWhaText() {
    const equipe = shortEquipe(os.nomedaequipe) || '—'
    const aging  = os._aging != null ? `${os._aging}d` : '—'
    const agend  = os.dataagendamento ? os.dataagendamento.slice(0, 10) : 'Não agendado'
    const loc    = [os.nomedacidade, os.bairro].filter(Boolean).join(' · ') || '—'
    const end    = [os.logradouro || os.enderecoconexao, os.numero, os.complemento].filter(Boolean).join(', ') || '—'
    return [
      `📋 *OS ${os.numos}* — ${sit}`,
      `👤 ${os.nomecliente || '—'}`,
      `📍 ${loc}`,
      `🏠 ${end}`,
      `🔧 ${os.tiposervico || '—'} · ${os.servico || '—'}`,
      `👷 ${equipe}`,
      `⏱ Aging: ${aging}`,
      `📅 Agend: ${agend}`,
    ].join('\n')
  }

  function openMaps() {
    const addr = [os.logradouro || os.enderecoconexao, os.bairro, os.nomedacidade].filter(Boolean).join(', ')
    if (!addr) return
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, '_blank')
  }

  function handleVerEquipe() {
    if (!os.nomedaequipe) return
    sessionStorage.setItem('pendingEquipe', os.nomedaequipe)
    onClose()
    navigate('/ordens')
  }

  const sit           = os._situacaoEfetiva ?? os.descsituacao
  const isConcluida   = sit === 'Concluída'
  const isAtendimento = sit === 'Atendimento'
  const hasAgend      = !!os.dataagendamento?.trim()
  const obs     = os.observacoes || os.obs || os.observacao || os.nota
               || os.descricaoobs || os.descricao_obs || os.historico
               || os.informacoes || os.detalhes || os.descricao || null
  const obsCrit = os.observacaocritica || os.obscritica || null
  const fornLabel     = FORN_LABEL[os._fornecedor] ?? os._fornecedor ?? null
  const hasAtend      = !!os.dataatendimento?.trim()
  const hasIni        = !!os.datainicio?.trim()
  const hasExec       = !!os.dataexecucao?.trim()
  const hasBaixa      = !!os.databaixa?.trim()

  const agingVal  = os._aging ?? 0
  const agingCls  = agingVal >= 6 ? 'text-red' : agingVal >= 3 ? 'text-yellow' : 'text-cyan'
  const _agingVar = agingVal >= 6 ? 'red'      : agingVal >= 3 ? 'yellow'      : 'cyan'

  // Status accent color para barra lateral
  const statusAccent = isConcluida ? 'bg-green/70' : isAtendimento ? 'bg-cyan/70' : 'bg-yellow/70'

  const duracao = calcDuracao(os.datainicio, os.dataexecucao)

  // Dados do técnico (mobile) vindos do /detalhes
  const d = osDetails  // atalho

  const obsTecnico  = loadingDetails ? '⏳ Carregando…' : (d?.obsTecnico || obs || null)
  const nomeTecnico = d?.nomeTecnico || null
  const historico   = d?.historico   || []
  const materiais   = d?.materiais   || []
  const matRetirados= d?.materiaisRetirados || []

  // Equipes por papel — vindas do /detalhes (mais precisas) ou fallback do CSV
  const eqAgendada = shortEquipe(d?.equipeAgendada  || os.nomedaequipe)
  const eqExecutou = shortEquipe(d?.equipeExecutou  || os.equipeexecutou || os.nomedaequipe)
  // Equipes diferentes = outra equipe assumiu a OS
  const eqsDiferem = d && eqAgendada && eqExecutou && eqAgendada !== eqExecutou

  const steps = [
    {
      icon: Clock, color: 'primary', label: 'Abertura da OS',
      date: fmtDate(os.datacadastro), equipe: eqAgendada, done: true,
      details: {
        contrato: os.codigocontrato || os.numcontrato || null,
        servico:  os.servico || os.tiposervico || null,
      },
    },
    hasAgend && {
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
    },
    hasAtend && {
      icon: Calendar, color: 'cyan', label: '1º Agendamento',
      date: fmtDate(os.dataatendimento), equipe: eqAgendada,
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
      date: fmtDate(os.datainicio), equipe: eqExecutou, done: true,
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
  ].filter(Boolean)

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
            <ActionBtn title="Copiar resumo para WhatsApp" active={copied === 'wha'} onClick={() => copyWith('wha', buildWhaText())}>
              {copied === 'wha' ? <Check size={13} /> : <MessageSquare size={13} />}
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
                         text-[12px] font-semibold text-primary hover:bg-primary/20 transition-all duration-fast ml-1"
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
            <div className="bg-surface/30 border border-border rounded-xl overflow-hidden">
              <div className="flex items-stretch divide-x divide-border">

                {/* Situação */}
                <div className="flex-1 px-4 py-3 flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">Situação</span>
                  <Badge variant={situacaoVariant(sit)} className="w-fit">{sit ?? '—'}</Badge>
                </div>

                {/* Aging */}
                {os._aging != null && (
                  <div className="px-4 py-3 flex flex-col gap-1 items-center justify-center min-w-[72px]">
                    <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">Aging</span>
                    <span className={`font-mono font-black text-[22px] leading-none ${agingCls}`}>
                      {os._aging}<span className="text-[12px] font-semibold ml-0.5 opacity-60">d</span>
                    </span>
                  </div>
                )}

                {/* SLA */}
                <div className="px-4 py-3 flex flex-col gap-1.5 items-center justify-center min-w-[80px]">
                  <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">SLA</span>
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
                    <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">Frente</span>
                    <span className="text-[11px] font-semibold text-secondary">{fornLabel}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── 2. Observações ───────────────────────────────────────── */}
            <Section label="Observações">
              {obsCrit && (
                <div className="bg-red/[0.08] border border-red/20 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-red mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={11} /> Observação Crítica
                  </p>
                  <p className="text-[12px] text-red/85 leading-relaxed whitespace-pre-wrap">{obsCrit}</p>
                </div>
              )}
              {obs ? (
                <div className="bg-surface/30 border border-border rounded-xl p-4">
                  <p className="text-[12px] text-secondary leading-relaxed whitespace-pre-wrap">{obs}</p>
                </div>
              ) : !obsCrit && (
                <p className="text-[12px] text-muted/60 italic px-1">Nenhuma observação registrada.</p>
              )}
            </Section>

            {/* ── 3. Localização ───────────────────────────────────────── */}
            <Section label="Localização & Serviço">
              {/* Endereço */}
              <button
                onClick={openMaps}
                className="w-full bg-surface/30 border border-border rounded-xl px-4 py-3
                           flex items-start gap-3 text-left hover:bg-surface/40 hover:border-border
                           transition-all duration-fast group"
              >
                <MapPin size={14} className="text-muted flex-shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted font-medium mb-0.5">
                    {[os.nomedacidade, os.bairro].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {(os.logradouro || os.enderecoconexao) ? (
                    <p className="text-[13px] font-semibold text-text leading-snug">
                      {[os.logradouro || os.enderecoconexao, os.numero, os.complemento].filter(Boolean).join(', ')}
                    </p>
                  ) : (
                    <p className="text-[12px] text-muted italic">Endereço não cadastrado</p>
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
                {os.codigocontrato && (
                  <MetaItem label="Contrato" value={os.codigocontrato} mono />
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
                  ].filter(Boolean).map(({ label, value, color }) => (
                    <div key={label} className="bg-surface/30 border border-border rounded-xl p-3 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 leading-tight">{label}</p>
                      <p className={`font-mono text-[20px] font-black leading-none ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── 4. Linha do Tempo ────────────────────────────────────── */}
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

function Section({ label, children }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted whitespace-nowrap">{label}</p>
        <div className="flex-1 h-px bg-surface" />
      </div>
      {children}
    </div>
  )
}

function InfoCard({ icon: Icon, label, value, prominent, action }) {
  return (
    <div className={`rounded-xl border p-3.5 flex flex-col gap-2 min-w-0
                     ${prominent
                       ? 'bg-primary/[0.06] border-primary/20'
                       : 'bg-surface/30 border-border'}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={prominent ? 'text-primary/60' : 'text-muted'} />
        <p className={`text-[11px] font-bold uppercase tracking-[0.05em] leading-none
                       ${prominent ? 'text-primary/70' : 'text-muted'}`}>
          {label}
        </p>
      </div>
      <p className={`text-[12px] font-semibold leading-snug break-words
                     ${prominent ? 'text-text' : 'text-secondary'}`}>
        {value}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="text-[10px] font-semibold text-primary/70 hover:text-primary text-left
                     transition-colors leading-none"
        >
          {action.label} →
        </button>
      )}
    </div>
  )
}

function MetaItem({ label, value, mono }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted">{label}:</span>
      <span className={`text-[11px] text-secondary ${mono ? 'font-mono' : 'font-medium'}`}>{value}</span>
    </div>
  )
}

function ActionBtn({ title, onClick, active, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all duration-fast
                  ${active
                    ? 'border-green/40 bg-green/15 text-green'
                    : 'border-border text-muted hover:text-text hover:bg-surface'}`}
    >
      {children}
    </button>
  )
}
