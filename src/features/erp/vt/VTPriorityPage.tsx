import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Flame, Clock, CheckCircle2, Send, Check, Gauge, Truck, MapPin, Wrench, Activity, Megaphone, Copy, ClipboardList } from 'lucide-react'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { useAuditStore } from '../../../store/auditStore'
import { useVTStore } from '../../../store/vtStore'
import { KPICard } from '../../../components/ui/KPICard'
import { FilterSelect } from '../../../components/ui/FilterSelect'
import { SearchBox } from '../../../components/ui/SearchBox'
import { DataTable } from '../../../components/ui/DataTable'
import { Badge } from '../../../components/ui/Badge'
import { shortEquipe, fmtHorasMin, buildOSWhatsApp } from '../../../lib/osFormat'
import { parseOSDetails, osDetailsQuery } from '../../../hooks/useOSDetails'
import { tgVTUrgente, chatKeyForFornecedor } from '../../../lib/tgTemplates'
import { telegram } from '../../../lib/api'
import OSDrawer from '../../ordens/OSDrawer'
import type { OSRow } from '../../../lib/types'

type ColRender = (value: unknown, row: OSRow) => React.ReactNode

const tipoVTOptions = [
  { value: '8',  label: 'VT 08h' },
  { value: '24', label: 'VT 24h' },
  { value: '48', label: 'VT 48h' },
]

const fornecedorOptions = [
  { value: 'WES',        label: 'WES' },
  { value: 'Instacable', label: 'Instacable' },
  { value: 'THM',        label: 'THM' },
  { value: 'REDE',       label: 'Rede' },
  { value: 'MANUTENCAO', label: 'Manutenção' },
]

function tempoRestanteVariant(restante: number): 'red' | 'orange' | 'yellow' | 'green' {
  if (restante <= 0) return 'red'
  if (restante <= 2) return 'orange'
  if (restante <= 6) return 'yellow'
  return 'green'
}

function tempoRestanteLabel(restante: number): string {
  return restante <= 0
    ? `Violado há ${fmtHorasMin(restante)}`
    : `${fmtHorasMin(restante)} restantes`
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

interface TendenciaItem { dia: string; label: string; total: number; violadas: number }

function TendenciaPanel({ items }: { items: TendenciaItem[] }) {
  const max = Math.max(1, ...items.map(d => d.violadas))
  const totalViol = items.reduce((s, d) => s + d.violadas, 0)
  return (
    <div className="rounded-xl bg-card border border-white/[0.08] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-muted" />
          <h3 className="text-[12px] font-semibold text-text">Violações VT · 7 dias</h3>
        </div>
        <span className="text-[11px] text-muted tabular-nums">{totalViol} no total</span>
      </div>
      <div className="flex items-end gap-1.5">
        {items.map(d => (
          <div key={d.dia} className="flex-1 flex flex-col items-center gap-1"
               title={`${d.label}: ${d.violadas} violações de ${d.total} VT executadas`}>
            <div className="w-full h-14 flex items-end">
              <div className="w-full rounded-t bg-red/60"
                   style={{ height: `${(d.violadas / max) * 100}%`, minHeight: d.violadas > 0 ? 3 : 0 }} />
            </div>
            <span className="text-[9px] text-muted tabular-nums">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface CargaItem { nome: string; total: number; violadas: number; criticas: number }

function CargaPanel({ title, icon: Icon, items }: { title: string; icon: typeof Truck; items: CargaItem[] }) {
  return (
    <div className="rounded-xl bg-card border border-white/[0.08] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-muted" />
        <h3 className="text-[12px] font-semibold text-text">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-muted py-2">Sem VT em aberto</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 6).map(c => (
            <div key={c.nome} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-secondary truncate">{c.nome}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0 tabular-nums">
                {c.violadas > 0 && <Badge variant="red" dot={false}>{c.violadas} viol.</Badge>}
                {c.criticas > 0 && <Badge variant="orange" dot={false}>{c.criticas} crít.</Badge>}
                <span className="text-muted w-8 text-right">{c.total}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function VTPriorityPage() {
  const { rows, isLoading, derived } = useOSDerived()
  const { cumprimento, cargaFornecedor, cargaCidade, tendencia } = derived.vt
  const logAudit = useAuditStore(s => s.log)
  const emTratativa     = useVTStore(s => s.emTratativa)
  const toggleTratativa = useVTStore(s => s.toggleTratativa)

  const [tipoVT, setTipoVT]         = useState('')
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

  const filaVT = useMemo(() => {
    let fila = rows.filter(r => r._vtPrazoHoras != null && r._vtHorasRestantes != null)
    if (tipoVT)      fila = fila.filter(r => String(r._vtPrazoHoras) === tipoVT)
    if (fornecedor)  fila = fila.filter(r => r._fornecedor === fornecedor)
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      fila = fila.filter(r =>
        r.numos?.toLowerCase().includes(term) ||
        r.nomecliente?.toLowerCase().includes(term)
      )
    }
    // Ordena por prioridade ponderada (tipo × urgência × situação); em tratativa vai pro fim
    return [...fila].sort((a, b) => {
      const ta = emTratativa[a.numos] ? 1 : 0
      const tb = emTratativa[b.numos] ? 1 : 0
      if (ta !== tb) return ta - tb
      return (b._vtPriorityScore ?? 0) - (a._vtPriorityScore ?? 0)
    })
  }, [rows, tipoVT, fornecedor, search, emTratativa])

  // VT críticas (violadas ou ≤ 2h) ainda não em tratativa — alvo da notificação em lote
  const criticas = useMemo(
    () => filaVT.filter(r => !emTratativa[r.numos] && (r._vtViolado || (r._vtHorasRestantes ?? 99) <= 2)),
    [filaVT, emTratativa],
  )

  const kpis = useMemo(() => {
    const violadas = filaVT.filter(r => r._vtViolado).length
    const critico   = filaVT.filter(r => !r._vtViolado && (r._vtHorasRestantes ?? 99) <= 2).length
    const atencao    = filaVT.filter(r => !r._vtViolado && (r._vtHorasRestantes ?? 99) > 2 && (r._vtHorasRestantes ?? 99) <= 6).length
    const noPrazo    = filaVT.filter(r => !r._vtViolado && (r._vtHorasRestantes ?? 99) > 6).length
    return { violadas, critico, atencao, noPrazo }
  }, [filaVT])

  async function handleNotificar(row: OSRow, e: React.MouseEvent) {
    e.stopPropagation()
    const chat = chatKeyForFornecedor(row)
    try {
      await telegram.send(tgVTUrgente(row), chat)
      logAudit('Telegram enviado (VT urgente)', `OS ${row.numos} · ${chat}`, 'telegram')
      setNotified(prev => ({ ...prev, [row.numos]: 'ok' }))
    } catch {
      setNotified(prev => ({ ...prev, [row.numos]: 'error' }))
    } finally {
      setTimeout(() => setNotified(prev => ({ ...prev, [row.numos]: undefined })), 2000)
    }
  }

  async function handleNotificarCriticas() {
    if (criticas.length === 0 || enviandoLote) return
    if (!window.confirm(`Enviar alerta de Telegram para ${criticas.length} OS críticas/violadas?`)) return
    setEnviandoLote(true)
    const results = await Promise.allSettled(
      criticas.map(row => telegram.send(tgVTUrgente(row), chatKeyForFornecedor(row))),
    )
    const ok = results.filter(r => r.status === 'fulfilled').length
    const falhas = results.length - ok
    logAudit('Telegram em lote (VT críticas)', `${ok} enviadas, ${falhas} falhas`, 'telegram')
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
    { key: 'nomedaequipe', label: 'Equipe', render: (v) => shortEquipe(v as string) },
    {
      key: '_situacaoEfetiva', label: 'Situação',
      render: (v) => {
        const s = (v as string) ?? '—'
        return <Badge variant={situacaoVariant(s)}>{s}</Badge>
      },
    },
    { key: '_vtPrazoHoras', label: 'Tipo VT', render: (v) => <Badge variant="cyan">VT {v as number}h</Badge> },
    {
      key: '_vtHorasRestantes', label: 'Tempo Restante',
      render: (v) => {
        const restante = v as number
        return <Badge variant={tempoRestanteVariant(restante)}>{tempoRestanteLabel(restante)}</Badge>
      },
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
    return <div className="p-6 text-muted text-[12px]">Carregando fila VT…</div>
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-[20px] font-bold text-text">Fila de Prioridade VT</h1>
        <p className="text-[12px] text-muted mt-0.5">OS de Visita Técnica (08h/24h/48h) ordenadas por prioridade — tipo do contrato, estouro do prazo e tratativa</p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <KPICard title="Violadas" value={kpis.violadas} accent="red" icon={AlertTriangle} />
        <KPICard title="Crítico < 2h" value={kpis.critico} accent="orange" icon={Flame} />
        <KPICard title="Atenção < 6h" value={kpis.atencao} accent="yellow" icon={Clock} />
        <KPICard title="No prazo" value={kpis.noPrazo} accent="green" icon={CheckCircle2} />
        <KPICard
          title="Cumprimento SLA VT"
          value={cumprimento.pct != null ? `${cumprimento.pct}%` : '—'}
          sub={cumprimento.total > 0 ? `${cumprimento.noPrazo}/${cumprimento.total} no prazo` : 'Sem execuções no período'}
          accent="teal"
          icon={Gauge}
          trend={cumprimento.deltaPp != null ? { delta: cumprimento.deltaPp, higherIsBetter: true } : undefined}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CargaPanel title="Carga por Fornecedor" icon={Truck} items={cargaFornecedor} />
        <CargaPanel title="Carga por Cidade" icon={MapPin} items={cargaCidade} />
        <TendenciaPanel items={tendencia} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect value={tipoVT} onChange={setTipoVT} options={tipoVTOptions} placeholder="Todos os tipos" className="w-40" />
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

      {filaVT.length === 0 ? (
        <div className="rounded-xl bg-card border border-white/[0.08] p-12 text-center">
          <p className="text-[14px] text-secondary">Nenhuma OS de VT em aberto 🎉</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={filaVT} onRowClick={setDrawerOS} />
      )}

      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />
    </div>
  )
}
