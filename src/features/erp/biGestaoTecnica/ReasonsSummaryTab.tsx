import { useMemo, useState } from 'react'
import { ChartBar, CheckCircle, ClipboardText, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'
import { StatCard } from '../../../components/ui/StatCard'
import { useRevisitJourneys } from '../../../hooks/useRevisitJourneys'
import { useRevisitaMotivos } from '../../../hooks/useRevisitaMotivos'
import { buildRevisitReasonsSummary } from '../../../lib/builders/revisitReasonsSummary'

const CATEGORY_COLORS: Record<string, string> = {
  'Conectorização/Sinal': 'rgb(var(--c-red))', Equipamento: 'rgb(var(--c-orange))', Configuração: 'rgb(var(--c-yellow))',
  'Rede/Infraestrutura': 'rgb(var(--c-purple))', 'Execução incompleta': 'rgb(var(--c-red))', 'Cliente/Uso': 'rgb(var(--c-cyan))',
  Reagendamento: 'rgb(var(--c-primary))', 'Sem informação': 'rgb(var(--c-muted))',
}

function colorFor(category: string): string { return CATEGORY_COLORS[category] ?? 'rgb(var(--c-green))' }
function daysSince(iso: string): number {
  const start = new Date(`${iso}T00:00:00`).getTime()
  return Math.max(30, Math.ceil((Date.now() - start) / 86_400_000) + 7)
}

export function ReasonsSummaryTab({ inicio, fim }: { inicio: string; fim: string }) {
  const journeys = useRevisitJourneys(inicio, fim)
  const motives = useRevisitaMotivos(daysSince(inicio))
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const summary = useMemo(() => buildRevisitReasonsSummary(journeys.data?.journeys ?? [], motives.data?.itens ?? []), [journeys.data, motives.data])
  const selectedItems = activeCategory ? summary.items.filter(item => item.category === activeCategory) : summary.items

  if (journeys.isLoading || motives.isLoading) return <div className="py-20 text-center text-sm text-muted">Consolidando motivos e ocorrências…</div>
  if (journeys.isError || !journeys.data) return <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-300">Não foi possível montar o resumo dos motivos.</div>

  return <div className="space-y-4">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard title="Revisitas oficiais" value={summary.total.toLocaleString('pt-BR')} sub="base do iManager" />
      <StatCard title="Motivo confirmado" value={summary.confirmed.toLocaleString('pt-BR')} sub="registrado pelo time" tone="ok" />
      <StatCard title="Causa provável" value={summary.probable.toLocaleString('pt-BR')} sub="pelas ocorrências" tone="warning" />
      <StatCard title="Cobertura da explicação" value={`${summary.coveragePct}%`} sub={`${summary.undetermined} sem evidência`} tone={summary.undetermined ? 'warning' : 'ok'} />
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_.9fr] gap-4">
      <section className="rounded-xl border border-white/[0.08] bg-card p-4" aria-labelledby="reason-distribution-title">
        <div className="flex items-center gap-2 mb-4"><ChartBar size={17} className="text-primary"/><h2 id="reason-distribution-title" className="text-sm font-bold text-text">Distribuição dos motivos</h2></div>
        <div className="space-y-2.5">
          {summary.categories.map(category => <button key={category.category} onClick={() => setActiveCategory(current => current === category.category ? null : category.category)}
            aria-pressed={activeCategory === category.category}
            className={`w-full min-h-11 cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${activeCategory === category.category ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-white/[0.03]'}`}>
            <div className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-xs font-semibold text-text">{category.category}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full" style={{ width: `${category.pct}%`, backgroundColor: colorFor(category.category) }}/></div>
              <span className="w-14 text-right font-mono text-xs font-bold text-text">{category.count}</span>
              <span className="w-10 text-right text-caption text-muted">{category.pct}%</span>
            </div>
            <p className="mt-1 text-caption text-muted">{category.confirmed} confirmadas · {category.probable} prováveis</p>
          </button>)}
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.08] bg-card p-4" aria-labelledby="evidence-title">
        <div className="flex items-center gap-2 mb-4"><ClipboardText size={17} className="text-cyan-400"/><h2 id="evidence-title" className="text-sm font-bold text-text">Ocorrências que explicam</h2></div>
        <div className="max-h-[430px] overflow-y-auto space-y-3">
          {summary.categories.filter(c => c.occurrences.length).map(category => <div key={category.category} className="rounded-lg border border-white/[0.07] p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-text">{category.category}</span><span className="text-caption text-muted">{category.count} OS</span></div>
            <ul className="mt-2 space-y-2">{category.occurrences.map((occurrence, index) => <li key={index} className="border-l-2 pl-2 text-caption leading-relaxed text-muted" style={{ borderColor: colorFor(category.category) }}>{occurrence}</li>)}</ul>
          </div>)}
          {!summary.categories.some(c => c.occurrences.length) && <div className="py-12 text-center text-sm text-muted"><WarningCircle size={20} className="mx-auto mb-2"/>Nenhuma ocorrência textual disponível.</div>}
        </div>
      </section>
    </div>

    <section className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] p-3">
        <div><h2 className="text-sm font-bold text-text">OS que formam o resumo</h2><p className="text-caption text-muted">{activeCategory ? `Filtro: ${activeCategory}` : 'Todas as revisitas do período'}</p></div>
        {activeCategory && <button onClick={() => setActiveCategory(null)} className="min-h-11 cursor-pointer rounded-lg border border-white/[0.1] px-3 text-xs text-text hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-primary/50">Limpar filtro</button>}
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full min-w-[760px] text-left text-xs"><thead className="sticky top-0 bg-surface text-muted"><tr><th className="px-4 py-3">OS</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3">Qualidade</th><th className="px-4 py-3">Equipe</th><th className="px-4 py-3">Cidade</th><th className="px-4 py-3">Ocorrência principal</th></tr></thead>
          <tbody className="divide-y divide-white/[0.05]">{selectedItems.map(item => <tr key={item.revisitOs}><td className="px-4 py-3 font-mono text-primary">{item.revisitOs}</td><td className="px-4 py-3 font-semibold text-text">{item.category}</td><td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-caption text-muted">{item.level === 'confirmed' ? <CheckCircle size={13} className="text-emerald-400"/> : item.level === 'probable' ? <MagnifyingGlass size={13} className="text-amber-400"/> : <WarningCircle size={13}/>} {item.level === 'confirmed' ? 'Confirmada' : item.level === 'probable' ? 'Provável' : 'Sem evidência'}</span></td><td className="px-4 py-3 text-muted">{item.team}</td><td className="px-4 py-3 text-muted">{item.city}</td><td className="max-w-sm truncate px-4 py-3 text-muted" title={item.occurrence}>{item.occurrence || '—'}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  </div>
}
