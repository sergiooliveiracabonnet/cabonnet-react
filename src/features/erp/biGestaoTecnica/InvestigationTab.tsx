import { useMemo, useState } from 'react'
import { MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'
import { StatCard } from '../../../components/ui/StatCard'
import { useRevisitJourneys, type RevisitJourney } from '../../../hooks/useRevisitJourneys'
import { RevisitInvestigationDrawer } from './RevisitInvestigationDrawer'
import { RevisitaMotivosSection } from '../qualidade/RevisitaMotivosSection'

export function InvestigationTab({ inicio, fim }: { inicio: string; fim: string }) {
  const { data, isLoading, isError } = useRevisitJourneys(inicio, fim)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<RevisitJourney | null>(null)
  const rows = useMemo(() => {
    const term = search.trim().toLocaleUpperCase('pt-BR')
    if (!term) return data?.journeys ?? []
    return (data?.journeys ?? []).filter(j => [j.revisit_os, j.origin_os, j.revisit.nomecliente, j.revisit.nomedacidade, j.revisit.equipeexecutou].some(v => String(v ?? '').toLocaleUpperCase('pt-BR').includes(term)))
  }, [data, search])

  if (isLoading) return <div className="py-20 text-center text-sm text-muted">Construindo jornadas das revisitas…</div>
  if (isError || !data) return <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-300">Não foi possível carregar as jornadas.</div>
  const sameTeam = data.journeys.filter(j => j.same_team === true).length
  const changedTeam = data.journeys.filter(j => j.same_team === false).length

  return <div className="space-y-4">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard title="Revisitas investigáveis" value={data.n.toLocaleString('pt-BR')} />
      <StatCard title="Origem localizada" value={`${data.n ? Math.round(data.linked / data.n * 100) : 0}%`} sub={`${data.linked} vinculadas`} tone="ok" />
      <StatCard title="Mesma equipe" value={sameTeam.toLocaleString('pt-BR')} sub="origem e retorno" />
      <StatCard title="Equipe alterada" value={changedTeam.toLocaleString('pt-BR')} sub={`${data.unlinked} sem origem`} tone={data.unlinked ? 'warning' : undefined} />
    </div>
    <section className="rounded-xl border border-white/[0.08] bg-card p-4">
      <h2 className="mb-3 text-sm font-bold text-text">Causas confirmadas pelo time</h2>
      <RevisitaMotivosSection />
    </section>
    <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
      <div className="p-3 border-b border-white/[0.08]">
        <label className="relative block max-w-md">
          <span className="sr-only">Buscar revisita</span>
          <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="OS, cliente, cidade ou equipe"
            className="w-full min-h-11 rounded-lg border border-white/[0.1] bg-surface pl-9 pr-3 text-sm text-text outline-none focus:ring-2 focus:ring-primary/50" />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-xs">
          <thead className="bg-surface/60 text-muted"><tr><th className="px-4 py-3">Jornada</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Cidade</th><th className="px-4 py-3">Equipes</th><th className="px-4 py-3">Intervalo</th><th className="px-4 py-3">Vínculo</th><th className="px-4 py-3"><span className="sr-only">Ação</span></th></tr></thead>
          <tbody className="divide-y divide-white/[0.05]">{rows.map(j => <tr key={j.revisit_os} className="hover:bg-white/[0.025]">
            <td className="px-4 py-3 font-mono text-text">{j.origin_os || '—'} → <span className="text-primary">{j.revisit_os}</span><div className="text-[10px] text-muted mt-1">recorrência {j.recurrence}</div></td>
            <td className="px-4 py-3 text-text max-w-48 truncate">{j.revisit.nomecliente || '—'}</td>
            <td className="px-4 py-3 text-muted">{j.revisit.nomedacidade}</td>
            <td className="px-4 py-3 text-muted">{j.origin?.equipeexecutou || '—'} → {j.revisit.equipeexecutou || '—'}</td>
            <td className="px-4 py-3 text-text">{j.days_between == null ? '—' : `${j.days_between}d`}</td>
            <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${j.link_confidence === 'high' ? 'bg-emerald-500/10 text-emerald-300' : j.link_confidence === 'unlinked' ? 'bg-amber-500/10 text-amber-300' : 'bg-cyan-500/10 text-cyan-300'}`}>{j.link_confidence}</span></td>
            <td className="px-4 py-3 text-right"><button onClick={() => setSelected(j)} className="min-h-11 cursor-pointer rounded-lg border border-white/[0.1] px-3 text-xs font-semibold text-text hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-primary/50">Investigar</button></td>
          </tr>)}</tbody>
        </table>
        {!rows.length && <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted"><WarningCircle size={18}/>Nenhuma jornada encontrada.</div>}
      </div>
    </div>
    <RevisitInvestigationDrawer journey={selected} onClose={() => setSelected(null)} />
  </div>
}
