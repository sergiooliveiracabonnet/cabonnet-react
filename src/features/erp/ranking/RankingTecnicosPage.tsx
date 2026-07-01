import { useMemo, useState } from 'react'
import { Award, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { isCOPE, isReagend, isExecucaoReal } from '../../../lib/transform'
import { shortEquipe } from '../../../lib/osFormat'
import { Badge } from '../../../components/ui/Badge'
import { KPICard } from '../../../components/ui/KPICard'

// "Equipe" neste sistema é, na prática, 1 técnico (código de frente, ex: F04) —
// não uma equipe multi-pessoa. Essa granularidade já existia espalhada em 3
// builders diferentes (produtividade em ProdutividadePage, SLA em buildSla,
// retrabalho em buildRevisitas) sem nunca terem sido cruzadas numa visão só.
// Esta página só junta o que já era calculado — nenhum score novo, nenhum peso
// inventado: volume, SLA e retrabalho lado a lado, o gestor decide a prioridade.

type SortKey = 'volume' | 'sla' | 'taxaRevisita' | 'criticas'

interface RankRow {
  nome:         string
  volume:       number
  sla:          number | null
  criticas:     number
  taxaRevisita: number | null
}

function slaColor(sla: number | null): string {
  if (sla == null) return '#94a3b8'
  if (sla >= 90) return '#4ade80'
  if (sla >= 75) return '#facc15'
  return '#f87171'
}

function revisitaColor(taxa: number | null): string {
  if (taxa == null) return '#94a3b8'
  if (taxa <= 5)  return '#4ade80'
  if (taxa <= 15) return '#facc15'
  return '#f87171'
}

export default function RankingTecnicosPage() {
  const { rows, isLoading, derived } = useOSDerived()
  const [sortKey, setSortKey] = useState<SortKey>('volume')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const ranking = useMemo<RankRow[]>(() => {
    const base = rows.filter(r => !isCOPE(r) && !isReagend(r))

    const volMap = new Map<string, number>()
    for (const r of base) {
      if (!isExecucaoReal(r.descsituacao)) continue
      const nome = (r.nomedaequipe || '').trim() || 'Sem equipe'
      volMap.set(nome, (volMap.get(nome) ?? 0) + 1)
    }

    const slaMap = new Map(derived.sla.semaforo.map(e => [e.nome, e]))
    const revMap = new Map(derived.revisitas.porEquipe.map(e => [e.equipe, e]))

    const nomes = new Set<string>([...volMap.keys(), ...slaMap.keys(), ...revMap.keys()])
    nomes.delete('Sem equipe')

    return [...nomes].map(nome => ({
      nome,
      volume:       volMap.get(nome) ?? 0,
      sla:          slaMap.get(nome)?.sla ?? null,
      criticas:     slaMap.get(nome)?.criticas ?? 0,
      taxaRevisita: revMap.get(nome)?.taxa ?? null,
    }))
  }, [rows, derived.sla.semaforo, derived.revisitas.porEquipe])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...ranking].sort((a, b) => {
      const va = a[sortKey] ?? -1
      const vb = b[sortKey] ?? -1
      return (va - vb) * dir
    })
  }, [ranking, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return }
    setSortKey(key); setSortDir('desc')
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={11} className="text-muted/40" />
    return sortDir === 'desc' ? <ArrowDown size={11} className="text-primary" /> : <ArrowUp size={11} className="text-primary" />
  }

  const kpis = useMemo(() => {
    const comSla = ranking.filter(r => r.sla != null)
    const slaMedio = comSla.length ? Math.round(comSla.reduce((s, r) => s + (r.sla ?? 0), 0) / comSla.length) : null
    const comRev = ranking.filter(r => r.taxaRevisita != null)
    const revMedia = comRev.length ? Math.round(comRev.reduce((s, r) => s + (r.taxaRevisita ?? 0), 0) / comRev.length) : null
    return {
      total:    ranking.length,
      slaMedio,
      revMedia,
      criticos: ranking.filter(r => r.criticas > 0).length,
    }
  }, [ranking])

  if (isLoading) {
    return <div className="p-6 text-muted text-[12px]">Carregando ranking…</div>
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-bold text-text flex items-center gap-2">
          <Award size={18} className="text-primary" /> Ranking de Técnicos
        </h1>
        <p className="text-[12px] text-muted mt-0.5">
          Volume, SLA e taxa de retrabalho por técnico, lado a lado — sem score composto, sem peso inventado
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Técnicos ativos" value={kpis.total} accent="primary" />
        <KPICard title="SLA médio" value={kpis.slaMedio != null ? `${kpis.slaMedio}%` : '—'} accent="teal" />
        <KPICard title="Retrabalho médio" value={kpis.revMedia != null ? `${kpis.revMedia}%` : '—'} accent="orange" />
        <KPICard title="Com OS crítica" value={kpis.criticos} accent="red" />
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.05] bg-surface/10">
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted">Técnico</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.05em] text-muted cursor-pointer select-none"
                    onClick={() => toggleSort('volume')}>
                  <span className="inline-flex items-center gap-1">Volume concluído <SortIcon col="volume" /></span>
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.05em] text-muted cursor-pointer select-none"
                    onClick={() => toggleSort('sla')}>
                  <span className="inline-flex items-center gap-1">SLA <SortIcon col="sla" /></span>
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.05em] text-muted cursor-pointer select-none"
                    onClick={() => toggleSort('criticas')}>
                  <span className="inline-flex items-center gap-1">Críticas <SortIcon col="criticas" /></span>
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.05em] text-muted cursor-pointer select-none"
                    onClick={() => toggleSort('taxaRevisita')}>
                  <span className="inline-flex items-center gap-1">Retrabalho <SortIcon col="taxaRevisita" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.nome} className="border-b border-white/[0.03] hover:bg-surface/10 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-text">{shortEquipe(r.nome)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text">{r.volume}</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.sla != null
                      ? <span className="font-mono font-bold tabular-nums" style={{ color: slaColor(r.sla) }}>{r.sla}%</span>
                      : <span className="text-muted/40">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.criticas > 0 ? <Badge variant="red" dot={false}>{r.criticas}</Badge> : <span className="text-muted/40">0</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.taxaRevisita != null
                      ? <span className="font-mono font-bold tabular-nums" style={{ color: revisitaColor(r.taxaRevisita) }}>{r.taxaRevisita}%</span>
                      : <span className="text-muted/40">—</span>}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted text-[12px]">
                    Nenhum técnico com OS no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
