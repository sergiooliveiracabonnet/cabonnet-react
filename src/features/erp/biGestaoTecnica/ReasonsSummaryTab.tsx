import { useMemo, useState } from 'react'
import { ChartBar, CheckCircle, ClipboardText, MagnifyingGlass, WarningCircle, MapPin } from '@phosphor-icons/react'
import { StatCard } from '../../../components/ui/StatCard'
import OSDrawer from '../../ordens/OSDrawer'
import { useRevisitJourneys } from '../../../hooks/useRevisitJourneys'
import { useRevisitaMotivos } from '../../../hooks/useRevisitaMotivos'
import { buildRevisitReasonsSummary, summarizeReasonItems } from '../../../lib/builders/revisitReasonsSummary'
import { backlogRowToOSRow } from '../../../lib/builders/backlogToOSRow'
import type { OSRow } from '../../../lib/types'

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
  const [activeCity, setActiveCity] = useState<string | null>(null)
  const summary = useMemo(() => buildRevisitReasonsSummary(journeys.data?.journeys ?? [], motives.data?.itens ?? []), [journeys.data, motives.data])

  // Escolher uma cidade reescopa a aba inteira — KPIs, distribuição e
  // ocorrências passam a falar só dela, com percentual relativo a ela.
  const scopedItems = useMemo(
    () => activeCity ? summary.items.filter(item => item.city === activeCity) : summary.items,
    [summary.items, activeCity],
  )
  const scope = useMemo(
    () => activeCity ? summarizeReasonItems(scopedItems) : summary,
    [activeCity, scopedItems, summary],
  )
  const selectedItems = activeCategory ? scopedItems.filter(item => item.category === activeCategory) : scopedItems

  // Trocar de cidade com uma categoria presa mostraria tabela vazia sempre que
  // o motivo não existir na nova cidade.
  function selecionarCidade(city: string) {
    setActiveCity(current => (current === city ? null : city))
    setActiveCategory(null)
  }

  // A linha da tabela guarda só o numos; a jornada é quem tem a OS inteira.
  const [drawerOS, setDrawerOS] = useState<OSRow | null>(null)
  const journeyByOs = useMemo(
    () => new Map((journeys.data?.journeys ?? []).map(journey => [journey.revisit_os, journey])),
    [journeys.data],
  )
  function abrirOS(revisitOs: string) {
    const journey = journeyByOs.get(revisitOs)
    if (journey) setDrawerOS(backlogRowToOSRow(journey.revisit))
  }

  if (journeys.isLoading || motives.isLoading) return <div className="py-20 text-center text-sm text-muted">Consolidando motivos e ocorrências…</div>
  if (journeys.isError || !journeys.data) return <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-300">Não foi possível montar o resumo dos motivos.</div>

  return <div className="space-y-4">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard title="Revisitas oficiais" value={scope.total.toLocaleString('pt-BR')} sub={activeCity ?? 'base do iManager'} />
      <StatCard title="Motivo confirmado" value={scope.confirmed.toLocaleString('pt-BR')} sub="registrado pelo time" tone="ok" />
      <StatCard title="Causa provável" value={scope.probable.toLocaleString('pt-BR')} sub="pelas ocorrências" tone="warning" />
      <StatCard title="Cobertura da explicação" value={`${scope.coveragePct}%`} sub={`${scope.undetermined} sem evidência`} tone={scope.undetermined ? 'warning' : 'ok'} />
    </div>

    <section className="rounded-xl border border-white/[0.08] bg-card p-4" aria-labelledby="reason-cities-title">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <MapPin size={17} className="text-cyan-400" />
          <h2 id="reason-cities-title" className="text-sm font-bold text-text">Motivos por cidade</h2>
          <span className="text-caption text-muted">clique para ver só ela</span>
        </div>
        {activeCity && <button onClick={() => { setActiveCity(null); setActiveCategory(null) }}
          className="min-h-11 cursor-pointer rounded-lg border border-white/[0.1] px-3 text-xs text-text hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-primary/50">
          Ver todas as cidades
        </button>}
      </div>
      {summary.byCity.length === 0 && <p className="py-8 text-center text-sm text-muted">Sem revisitas no período.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {summary.byCity.map(city => <button key={city.city} onClick={() => selecionarCidade(city.city)}
          aria-pressed={activeCity === city.city}
          className={`cursor-pointer rounded-lg border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50
                      ${activeCity === city.city ? 'border-primary/50 bg-primary/5' : 'border-white/[0.07] hover:bg-white/[0.03]'}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-bold text-text">{city.city}</span>
            <span className="font-mono text-sm font-bold text-text">{city.total.toLocaleString('pt-BR')}</span>
          </div>
          {city.topCategory && <p className="mt-1 text-caption text-muted">
            <span className="font-semibold" style={{ color: colorFor(city.topCategory) }}>{city.topCategory}</span>
            {' '}lidera · {city.topCount} de {city.total} ({city.topPct}%)
          </p>}
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-surface">
            {city.categories.map(category => <div key={category.category} style={{ width: `${category.pct}%`, backgroundColor: colorFor(category.category) }}
              title={`${category.category}: ${category.count} (${category.pct}%)`} />)}
          </div>
          <p className="mt-1.5 text-caption text-muted">{city.coveragePct}% com motivo explicado</p>
        </button>)}
      </div>
    </section>

    <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_.9fr] gap-4">
      <section className="rounded-xl border border-white/[0.08] bg-card p-4" aria-labelledby="reason-distribution-title">
        <div className="flex items-center gap-2 mb-4"><ChartBar size={17} className="text-primary"/><h2 id="reason-distribution-title" className="text-sm font-bold text-text">Distribuição dos motivos{activeCity ? ` · ${activeCity}` : ''}</h2></div>
        <div className="space-y-2.5">
          {scope.categories.map(category => <button key={category.category} onClick={() => setActiveCategory(current => current === category.category ? null : category.category)}
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
          {scope.categories.filter(c => c.occurrences.length).map(category => <div key={category.category} className="rounded-lg border border-white/[0.07] p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-text">{category.category}</span><span className="text-caption text-muted">{category.count} OS</span></div>
            <ul className="mt-2 space-y-2">{category.occurrences.map((occurrence, index) => <li key={index} className="border-l-2 pl-2 text-caption leading-relaxed text-muted" style={{ borderColor: colorFor(category.category) }}>{occurrence}</li>)}</ul>
          </div>)}
          {!scope.categories.some(c => c.occurrences.length) && <div className="py-12 text-center text-sm text-muted"><WarningCircle size={20} className="mx-auto mb-2"/>Nenhuma ocorrência textual disponível.</div>}
        </div>
      </section>
    </div>

    <section className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] p-3">
        <div><h2 className="text-sm font-bold text-text">OS que formam o resumo</h2><p className="text-caption text-muted">{[activeCity, activeCategory].filter(Boolean).join(' · ') || 'Todas as revisitas do período'} · clique numa linha para abrir a OS</p></div>
        {(activeCategory || activeCity) && <button onClick={() => { setActiveCategory(null); setActiveCity(null) }} className="min-h-11 cursor-pointer rounded-lg border border-white/[0.1] px-3 text-xs text-text hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-primary/50">Limpar filtro</button>}
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full min-w-[760px] text-left text-xs"><thead className="sticky top-0 bg-surface text-muted"><tr><th className="px-4 py-3">OS</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3">Qualidade</th><th className="px-4 py-3">Equipe</th><th className="px-4 py-3">Cidade</th><th className="px-4 py-3">Ocorrência principal</th></tr></thead>
          <tbody className="divide-y divide-white/[0.05]">{selectedItems.map(item => <tr key={item.revisitOs}
            onClick={() => abrirOS(item.revisitOs)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrirOS(item.revisitOs) } }}
            tabIndex={0} role="button" aria-label={`Abrir OS ${item.revisitOs}`}
            className="cursor-pointer transition-colors hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/50"><td className="px-4 py-3 font-mono text-primary underline decoration-primary/30 underline-offset-2">{item.revisitOs}</td><td className="px-4 py-3 font-semibold text-text">{item.category}</td><td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-caption text-muted">{item.level === 'confirmed' ? <CheckCircle size={13} className="text-emerald-400"/> : item.level === 'probable' ? <MagnifyingGlass size={13} className="text-amber-400"/> : <WarningCircle size={13}/>} {item.level === 'confirmed' ? 'Confirmada' : item.level === 'probable' ? 'Provável' : 'Sem evidência'}</span></td><td className="px-4 py-3 text-muted">{item.team}</td><td className="px-4 py-3 text-muted">{item.city}</td><td className="max-w-sm truncate px-4 py-3 text-muted" title={item.occurrence}>{item.occurrence || '—'}</td></tr>)}</tbody>
        </table>
      </div>
    </section>

    <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />
  </div>
}
