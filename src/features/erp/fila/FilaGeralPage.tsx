import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Flame, CheckCircle2, Send, Check, Gauge, Truck, MapPin, Wrench, Megaphone, Copy, ClipboardList, UserX } from 'lucide-react'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { useAuditStore } from '../../../store/auditStore'
import { useFilaGeralStore } from '../../../store/filaGeralStore'
import { KPICard } from '../../../components/ui/KPICard'
import { FilterSelect } from '../../../components/ui/FilterSelect'
import { SearchBox } from '../../../components/ui/SearchBox'
import { DataTable } from '../../../components/ui/DataTable'
import { Badge } from '../../../components/ui/Badge'
import { shortEquipe, buildOSWhatsApp } from '../../../lib/osFormat'
import { parseOSDetails, osDetailsQuery } from '../../../hooks/useOSDetails'
import { tgVTUrgente, chatKeyForFornecedor } from '../../../lib/tgTemplates'
import { telegram } from '../../../lib/api'
import OSDrawer from '../../ordens/OSDrawer'
import type { OSRow } from '../../../lib/types'

// Fila de prioridade para OS que não são VT/Manutenção — instalação, serviço e rede.
// Mesmo padrão visual e operacional do VTPriorityPage (fila.vt), mas usando o
// SLA em dias (_slaLimite/_slaCritico/_slaExcedido) e o _riskScore genérico
// já calculados para toda OS em enrichRows, em vez do prazo VT em horas.

type ColRender = (value: unknown, row: OSRow) => React.ReactNode

const tipoOptions = [
  { value: 'INSTALACAO', label: 'Instalação' },
  { value: 'SERVICO',     label: 'Serviço'    },
  { value: 'REDE',        label: 'Rede'       },
]

const fornecedorOptions = [
  { value: 'WES',        label: 'WES' },
  { value: 'Instacable', label: 'Instacable' },
  { value: 'THM',        label: 'THM' },
  { value: 'REDE',       label: 'Rede' },
  { value: 'MANUTENCAO', label: 'Manutenção' },
]

function slaVariant(row: OSRow): 'red' | 'orange' | 'green' {
  if (row._slaCritico) return 'red'
  if (row._slaExcedido || row._slaSemAgend) return 'orange'
  return 'green'
}

function slaLabel(row: OSRow): string {
  const aging = row._agingAbertura ?? 0
  const limite = row._slaLimite ?? 0
  if (row._slaCritico) return `Crítico — ${aging}d / lim. ${limite}d`
  if (row._slaExcedido || row._slaSemAgend) return `Excedido — ${aging}d / lim. ${limite}d`
  return `No prazo — ${aging}d / lim. ${limite}d`
}

function situacaoVariant(situacao: string): 'yellow' | 'cyan' | 'purple' | 'green' | 'red' | 'teal' {
  switch (situacao) {
    case 'Pendente':       return 'yellow'
    case 'Atendimento':    return 'cyan'
    case 'Reagendamento':  return 'purple'
    case 'Concluída':      return 'green'
    case 'Cancelada':      return 'red'
    default:               return 'teal'
  }
}

interface CargaItem { nome: string; total: number; criticas: number; excedidas: number }

function CargaPanel({ title, icon: Icon, items }: { title: string; icon: typeof Truck; items: CargaItem[] }) {
  return (
    <div className="rounded-xl bg-card border border-white/[0.08] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-muted" />
        <h3 className="text-[12px] font-semibold text-text">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-muted py-2">Sem OS em aberto</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 6).map(c => (
            <div key={c.nome} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-secondary truncate">{c.nome}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0 tabular-nums">
                {c.criticas > 0 && <Badge variant="red" dot={false}>{c.criticas} crít.</Badge>}
                {c.excedidas > 0 && <Badge variant="orange" dot={false}>{c.excedidas} exc.</Badge>}
                <span className="text-muted w-8 text-right">{c.total}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FilaGeralPage() {
  const { rows, isLoading, derived } = useOSDerived()
  const { cumprimento, cargaFornecedor, cargaCidade } = derived.filaGeral
  const logAudit = useAuditStore(s => s.log)
  const emTratativa     = useFilaGeralStore(s => s.emTratativa)
  const toggleTratativa = useFilaGeralStore(s => s.toggleTratativa)

  const [tipo, setTipo]             = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [search, setSearch]         = useState('')
  const [drawerOS, setDrawerOS]     = useState<OSRow | null>(null)
  const [notified, setNotified]     = useState<Record<string, 'ok' | 'error' | undefined>>({})
  const [enviandoLote, setEnviandoLote] = useState(false)
  const [copied, setCopied]         = useState<string | null>(null)
  const queryClient = useQueryClient()

  function flashCopied(key: string) { setCopied(key); setTimeout(() => setCopied(null), 1800) }

  function copyResumo(row: OSRow, e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(buildOSWhatsApp(row)).catch(() => {}); flashCopied(`${row.numos}:os`)
  }

  async function copyCompleto(row: OSRow, e: React.MouseEvent) {
    e.stopPropagation()
    flashCopied(`${row.numos}:full`)
    let historico
    try {
      const data = await queryClient.fetchQuery(osDetailsQuery(row.numos))
      historico = parseOSDetails(data)?.historico
    } catch { /* sem detalhes: copia só o resumo */ }
    navigator.clipboard.writeText(buildOSWhatsApp(row, historico)).catch(() => {})
  }

  const fila = useMemo(() => {
    let f = rows.filter(r =>
      r._categoria !== 'VT_MANUTENCAO' &&
      (r.descsituacao === 'Pendente' || r.descsituacao === 'Atendimento'),
    )
    if (tipo)        f = f.filter(r => r._categoria === tipo)
    if (fornecedor)  f = f.filter(r => r._fornecedor === fornecedor)
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      f = f.filter(r =>
        r.numos?.toLowerCase().includes(term) ||
        r.nomecliente?.toLowerCase().includes(term)
      )
    }
    // Ordena por _riskScore (SLA + aging + sem equipe); em tratativa vai pro fim
    return [...f].sort((a, b) => {
      const ta = emTratativa[a.numos] ? 1 : 0
      const tb = emTratativa[b.numos] ? 1 : 0
      if (ta !== tb) return ta - tb
      return (b._riskScore ?? 0) - (a._riskScore ?? 0)
    })
  }, [rows, tipo, fornecedor, search, emTratativa])

  // Críticas ainda não em tratativa — alvo da notificação em lote
  const criticas = useMemo(
    () => fila.filter(r => !emTratativa[r.numos] && r._slaCritico),
    [fila, emTratativa],
  )

  const kpis = useMemo(() => {
    const critico   = fila.filter(r => r._slaCritico).length
    const excedido  = fila.filter(r => !r._slaCritico && (r._slaExcedido || r._slaSemAgend)).length
    const semEquipe = fila.filter(r => !r.nomedaequipe?.trim()).length
    const noPrazo   = fila.filter(r => !r._slaCritico && !r._slaExcedido && !r._slaSemAgend).length
    return { critico, excedido, semEquipe, noPrazo }
  }, [fila])

  async function handleNotificar(row: OSRow, e: React.MouseEvent) {
    e.stopPropagation()
    const chat = chatKeyForFornecedor(row)
    try {
      await telegram.send(tgVTUrgente(row), chat)
      logAudit('Telegram enviado (fila geral urgente)', `OS ${row.numos} · ${chat}`, 'telegram')
      setNotified(prev => ({ ...prev, [row.numos]: 'ok' }))
    } catch {
      setNotified(prev => ({ ...prev, [row.numos]: 'error' }))
    } finally {
      setTimeout(() => setNotified(prev => ({ ...prev, [row.numos]: undefined })), 2000)
    }
  }

  async function handleNotificarCriticas() {
    if (criticas.length === 0 || enviandoLote) return
    if (!window.confirm(`Enviar alerta de Telegram para ${criticas.length} OS críticas?`)) return
    setEnviandoLote(true)
    const results = await Promise.allSettled(
      criticas.map(row => telegram.send(tgVTUrgente(row), chatKeyForFornecedor(row))),
    )
    const ok = results.filter(r => r.status === 'fulfilled').length
    const falhas = results.length - ok
    logAudit('Telegram em lote (fila geral críticas)', `${ok} enviadas, ${falhas} falhas`, 'telegram')
    setNotified(prev => {
      const next = { ...prev }
      criticas.forEach((row, i) => { next[row.numos] = results[i].status === 'fulfilled' ? 'ok' : 'error' })
      return next
    })
    setEnviandoLote(false)
    setTimeout(() => setNotified({}), 2500)
  }

  const columns: { key?: string; label: string; render?: ColRender }[] = [
    { key: 'numos', label: 'Nº OS' },
    { key: 'nomecliente', label: 'Cliente' },
    { key: 'nomedacidade', label: 'Cidade' },
    { key: 'bairro', label: 'Bairro' },
    { key: 'nomedaequipe', label: 'Equipe', render: (v) => shortEquipe(v as string) || <Badge variant="orange">Sem equipe</Badge> },
    {
      key: '_situacaoEfetiva', label: 'Situação',
      render: (v) => {
        const s = (v as string) ?? '—'
        return <Badge variant={situacaoVariant(s)}>{s}</Badge>
      },
    },
    { key: '_slaTipoLabel', label: 'Tipo', render: (v) => <Badge variant="cyan">{v as string}</Badge> },
    {
      label: 'SLA',
      render: (_v, row) => <Badge variant={slaVariant(row)}>{slaLabel(row)}</Badge>,
    },
    {
      label: 'Ações',
      render: (_v, row) => {
        const st = notified[row.numos]
        const tratando = !!emTratativa[row.numos]
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => handleNotificar(row, e)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium
                         text-muted hover:text-primary hover:bg-primary/10 transition-colors"
            >
              {st === 'ok' ? <Check size={12} className="text-green" /> : <Send size={12} />}
              {st === 'ok' ? 'Enviado' : 'Notificar'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); toggleTratativa(row.numos) }}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors
                         ${tratando ? 'text-teal bg-teal/10' : 'text-muted hover:text-teal hover:bg-teal/10'}`}
            >
              <Wrench size={12} />
              {tratando ? 'Tratando' : 'Tratar'}
            </button>
            <button
              onClick={(e) => copyResumo(row, e)}
              title="Copiar só a OS (resumo)"
              className="p-1 rounded-md text-muted hover:text-primary hover:bg-primary/10 transition-colors"
            >
              {copied === `${row.numos}:os` ? <Check size={12} className="text-green" /> : <Copy size={12} />}
            </button>
            <button
              onClick={(e) => copyCompleto(row, e)}
              title="Copiar OS + histórico"
              className="p-1 rounded-md text-muted hover:text-primary hover:bg-primary/10 transition-colors"
            >
              {copied === `${row.numos}:full` ? <Check size={12} className="text-green" /> : <ClipboardList size={12} />}
            </button>
          </div>
        )
      },
    },
  ]

  if (isLoading) {
    return <div className="p-6 text-muted text-[12px]">Carregando fila…</div>
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-[20px] font-bold text-text">Fila de Prioridade — Instalação, Serviço e Rede</h1>
        <p className="text-[12px] text-muted mt-0.5">OS ativas fora de VT/Manutenção, ordenadas por gravidade real (SLA em dias + aging + sem equipe)</p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <KPICard title="SLA Crítico" value={kpis.critico} accent="red" icon={AlertTriangle} />
        <KPICard title="SLA Excedido" value={kpis.excedido} accent="orange" icon={Flame} />
        <KPICard title="Sem Equipe" value={kpis.semEquipe} accent="yellow" icon={UserX} />
        <KPICard title="No prazo" value={kpis.noPrazo} accent="green" icon={CheckCircle2} />
        <KPICard
          title="Cumprimento SLA"
          value={cumprimento.pct != null ? `${cumprimento.pct}%` : '—'}
          sub={cumprimento.total > 0 ? `${cumprimento.noPrazo}/${cumprimento.total} fechadas no prazo` : 'Sem execuções no período'}
          accent="teal"
          icon={Gauge}
          trend={cumprimento.deltaPp != null ? { delta: cumprimento.deltaPp, higherIsBetter: true } : undefined}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CargaPanel title="Carga por Fornecedor" icon={Truck} items={cargaFornecedor} />
        <CargaPanel title="Carga por Cidade" icon={MapPin} items={cargaCidade} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect value={tipo} onChange={setTipo} options={tipoOptions} placeholder="Todos os tipos" className="w-40" />
        <FilterSelect value={fornecedor} onChange={setFornecedor} options={fornecedorOptions} placeholder="Todos os fornecedores" className="w-48" />
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por cliente ou nº OS…" className="w-64" />
        <button
          onClick={handleNotificarCriticas}
          disabled={criticas.length === 0 || enviandoLote}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold
                     text-red bg-red/10 hover:bg-red/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Megaphone size={14} />
          {enviandoLote ? 'Enviando…' : `Notificar críticas (${criticas.length})`}
        </button>
      </div>

      {fila.length === 0 ? (
        <div className="rounded-xl bg-card border border-white/[0.08] p-12 text-center">
          <p className="text-[14px] text-secondary">Nenhuma OS de instalação/serviço/rede em aberto 🎉</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={fila} onRowClick={setDrawerOS} />
      )}

      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />
    </div>
  )
}
