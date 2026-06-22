import { useMemo, useState } from 'react'
import { AlertTriangle, Flame, Clock, CheckCircle2, Send, Check } from 'lucide-react'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { useAuditStore } from '../../../store/auditStore'
import { KPICard } from '../../../components/ui/KPICard'
import { FilterSelect } from '../../../components/ui/FilterSelect'
import { SearchBox } from '../../../components/ui/SearchBox'
import { DataTable } from '../../../components/ui/DataTable'
import { Badge } from '../../../components/ui/Badge'
import { shortEquipe, fmtHorasMin } from '../../../lib/osFormat'
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

export default function VTPriorityPage() {
  const { rows, isLoading } = useOSDerived()
  const logAudit = useAuditStore(s => s.log)

  const [tipoVT, setTipoVT]         = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [search, setSearch]         = useState('')
  const [drawerOS, setDrawerOS]     = useState<OSRow | null>(null)
  const [notified, setNotified]     = useState<Record<string, 'ok' | 'error' | undefined>>({})

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
    return [...fila].sort((a, b) => (a._vtHorasRestantes ?? 0) - (b._vtHorasRestantes ?? 0))
  }, [rows, tipoVT, fornecedor, search])

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

  const columns: { key?: string; label: string; render?: ColRender }[] = [
    { key: 'numos', label: 'Nº OS' },
    { key: 'nomecliente', label: 'Cliente' },
    { key: 'nomedacidade', label: 'Cidade' },
    { key: 'bairro', label: 'Bairro' },
    { key: 'nomedaequipe', label: 'Equipe', render: (v) => shortEquipe(v as string) },
    { key: '_vtPrazoHoras', label: 'Tipo VT', render: (v) => <Badge variant="cyan">VT {v as number}h</Badge> },
    {
      key: '_vtHorasRestantes', label: 'Tempo Restante',
      render: (v) => {
        const restante = v as number
        return <Badge variant={tempoRestanteVariant(restante)}>{tempoRestanteLabel(restante)}</Badge>
      },
    },
    {
      label: 'Ação',
      render: (_v, row) => {
        const st = notified[row.numos]
        return (
          <button
            onClick={(e) => handleNotificar(row, e)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium
                       text-muted hover:text-primary hover:bg-primary/10 transition-colors"
          >
            {st === 'ok' ? <Check size={12} className="text-green" /> : <Send size={12} />}
            {st === 'ok' ? 'Enviado' : 'Notificar'}
          </button>
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
        <p className="text-[12px] text-muted mt-0.5">OS de Visita Técnica (08h/24h/48h) ordenadas por tempo restante até o vencimento do prazo</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KPICard title="Violadas" value={kpis.violadas} accent="red" icon={AlertTriangle} />
        <KPICard title="Crítico < 2h" value={kpis.critico} accent="orange" icon={Flame} />
        <KPICard title="Atenção < 6h" value={kpis.atencao} accent="yellow" icon={Clock} />
        <KPICard title="No prazo" value={kpis.noPrazo} accent="green" icon={CheckCircle2} />
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterSelect value={tipoVT} onChange={setTipoVT} options={tipoVTOptions} placeholder="Todos os tipos" className="w-40" />
        <FilterSelect value={fornecedor} onChange={setFornecedor} options={fornecedorOptions} placeholder="Todos os fornecedores" className="w-48" />
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por cliente ou nº OS…" className="w-64" />
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
