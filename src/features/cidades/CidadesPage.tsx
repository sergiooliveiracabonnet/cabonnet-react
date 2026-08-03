import { useState, useMemo } from 'react'
import { MapPin, Wrench, Clock, CheckCircle, Calendar, CalendarCheck, List, Sparkle, Warning, Users, TrendUp, X } from '@phosphor-icons/react'
import { useOSDerived } from '../../contexts/OSDataContext'
import { KPIGridSkeleton } from '../../components/ui/Skeleton'
import OSDrawer from '../ordens/OSDrawer'
import { isCOPE, isReagend } from '../../lib/transform'
import { useAICidades } from '../../hooks/useAICidades'
import type { OSRow } from '../../lib/types'
import { buildCidades } from '../../lib/builders/cidades'
import { buildCidadesExecutiveSummary, filterCidadesRows, type CidadeTipoFilter } from '../../lib/builders/cidadesView'
import {
  PainelCidade, SaudeCidadeTable, tipoBreakdown, datePart,
  hojeLocal, amanhaLocal,
  PANEL_FROM, PANEL_HOVER,
  type PanelId,
} from './CidadesComponents'

export default function CidadesPage() {
  const { allRows, rows, isLoading, derived: { revisitas } } = useOSDerived()
  const [drawerOS,    setDrawerOS]   = useState<OSRow | null>(null)
  const [openPanels,  setOpenPanels] = useState<Record<PanelId, boolean>>({ atend: false, pend: false, concl: false, futuro: false, fila: false, amanha: false })
  const [cidadeFilter, setCidadeFilter] = useState('')
  const [tipoFilter, setTipoFilter] = useState<CidadeTipoFilter>('TODOS')
  const [aiEnabled, setAiEnabled]   = useState(false)
  const hoje  = useMemo(() => hojeLocal(), [])
  const amanha = useMemo(() => amanhaLocal(), [])

  const cidadesOptions = useMemo(() => [...new Set(allRows
    .filter(r => r._tipo !== 'REDE')
    .map(r => (r.nomedacidade || '').trim()).filter(Boolean))].sort(), [allRows])
  const rowsView = useMemo(() => filterCidadesRows(rows, cidadeFilter, tipoFilter), [rows, cidadeFilter, tipoFilter])
  const allRowsView = useMemo(() => filterCidadesRows(allRows, cidadeFilter, tipoFilter), [allRows, cidadeFilter, tipoFilter])
  const cidades = useMemo(() => buildCidades(allRowsView), [allRowsView])
  const executive = useMemo(() => buildCidadesExecutiveSummary(cidades.saude), [cidades.saude])

  const atendRows = useMemo(() =>
    rowsView.filter(r => r.descsituacao === 'Atendimento' && !isReagend(r) && !isCOPE(r))
  , [rowsView])

  const pendRows = useMemo(() =>
    rowsView.filter(r => r.descsituacao === 'Pendente' && !isCOPE(r) && !isReagend(r))
  , [rowsView])

  const pendSemEquipe = useMemo(() =>
    pendRows.filter(r => !r.nomedaequipe?.trim()).length
  , [pendRows])

  const cidadesPendPayload = useMemo(() =>
    pendRows.map(r => ({
      numos:  r.numos,
      cidade: (r.nomedacidade ?? '') as string,
      bairro: (r.bairro ?? '') as string,
      tipo:   (r._tipo ?? '') as string,
      aging:  r._aging ?? r._agingAbertura ?? 0,
    }))
  , [pendRows])

  const { data: aiClusters } = useAICidades({ pendRows: cidadesPendPayload, enabled: aiEnabled })

  const conclRows = useMemo(() => allRowsView.filter(r => r._executadaHoje), [allRowsView])

  const futuroRows = useMemo(() => {
    const amanhaISO = `${amanha.slice(6)}-${amanha.slice(3,5)}-${amanha.slice(0,2)}`
    return allRowsView.filter(r => {
      // Pendente agendada também é agenda: só Atendimento subcontava o dia seguinte
      if (!['Pendente', 'Atendimento'].includes(r.descsituacao) || isReagend(r) || isCOPE(r)) return false
      const agend = datePart(r.dataagendamento)
      if (!agend) return false
      const agendISO = `${agend.slice(6)}-${agend.slice(3,5)}-${agend.slice(0,2)}`
      return agendISO >= amanhaISO
    })
  }, [allRowsView, amanha])

  const futuroAmanhaRows   = useMemo(() => futuroRows.filter(r => datePart(r.dataagendamento) === amanha), [futuroRows, amanha])
  const futuroRestanteRows = useMemo(() => futuroRows.filter(r => datePart(r.dataagendamento) !== amanha), [futuroRows, amanha])

  // Fila COMPLETA — a versão anterior cortava em 30 dias, escondendo justamente
  // as OS mais antigas (o passivo mais grave) do painel mais alarmante da página.
  const { filaRows, filaAntiga, filaRecente } = useMemo(() => {
    const corte = new Date(); corte.setDate(corte.getDate() - 30); corte.setHours(0, 0, 0, 0)
    const fila = allRowsView.filter(r =>
      !isReagend(r) && !isCOPE(r) && ['Pendente', 'Atendimento'].includes(r.descsituacao))
    const antiga: OSRow[] = [], recente: OSRow[] = []
    for (const r of fila) {
      const raw = (r.datacadastro || '').split(' ')[0]
      const [dd, mm, yy] = raw.split('/')
      const dCad = raw ? new Date(+yy, +mm - 1, +dd) : null
      // Sem data de cadastro = idade desconhecida → tratada como antiga (conservador)
      if (!dCad || isNaN(dCad.getTime()) || dCad < corte) antiga.push(r)
      else recente.push(r)
    }
    return { filaRows: fila, filaAntiga: antiga, filaRecente: recente }
  }, [allRowsView])

  const panels = [
    { id: 'atend',  title: 'Em Atendimento',                  icon: Wrench,      color: 'cyan',    rows: atendRows,        defaultOpen: true, breakdown: tipoBreakdown(atendRows) },
    { id: 'pend',   title: 'Pendentes',                       icon: Clock,       color: 'yellow',  rows: pendRows,         defaultOpen: true, semEquipe: pendSemEquipe, breakdown: tipoBreakdown(pendRows) },
    { id: 'concl',  title: `Executadas hoje (${hoje.slice(0, 5)})`, icon: CheckCircle, color: 'green', rows: conclRows, defaultOpen: true, breakdown: tipoBreakdown(conclRows) },
    {
      id: 'amanha', title: `Agendado Amanhã · ${amanha.slice(0, 5)}`, icon: CalendarCheck, color: 'orange', rows: futuroAmanhaRows, defaultOpen: true,
      subtitle: `OS agendadas para ${amanha} (pendentes e em atendimento)`,
      breakdown: tipoBreakdown(futuroAmanhaRows),
    },
    {
      id: 'fila', title: 'Fila de Execução', icon: List, color: 'red', rows: filaRows, defaultOpen: true,
      subtitle: 'Toda a fila ativa · OS com mais de 30 dias em destaque',
      breakdown: tipoBreakdown(filaRows),
      groups: [
        { label: 'Mais de 30 dias na fila', rows: filaAntiga,  highlight: true, tone: 'red' as const },
        { label: 'Últimos 30 dias',          rows: filaRecente, highlight: false },
      ],
    },
    {
      id: 'futuro', title: 'Agendamento Futuro', icon: Calendar, color: 'purple', rows: futuroRows, defaultOpen: true,
      breakdown: tipoBreakdown(futuroRows),
      groups: [
        { label: `Amanhã · ${amanha.slice(0, 5)}`, rows: futuroAmanhaRows,   highlight: true },
        { label: 'Próximos dias',                   rows: futuroRestanteRows, highlight: false },
      ],
    },
  ]

  const executiveCards = [
    {
      label: 'Cidade prioritária', value: executive.prioritaria?.cidade ?? 'Sem alerta',
      sub: executive.prioritaria?.backlogDias == null
        ? (executive.prioritaria ? 'sem capacidade recente' : 'nenhuma cidade com fila')
        : `${executive.prioritaria.backlogDias} dias de backlog`,
      icon: MapPin, color: executive.prioritaria ? 'text-red' : 'text-green',
      onClick: () => executive.prioritaria && setCidadeFilter(executive.prioritaria.cidade),
    },
    { label: 'Acumulando fila', value: executive.acumulando, sub: 'demanda acima da execução', icon: TrendUp, color: executive.acumulando ? 'text-orange' : 'text-green', onClick: () => document.getElementById('city-health')?.scrollIntoView({ behavior: 'smooth' }) },
    { label: 'OS críticas', value: executive.criticas, sub: 'mais de 2× o SLA', icon: Warning, color: executive.criticas ? 'text-red' : 'text-green', onClick: () => { setOpenPanels(prev => ({ ...prev, fila: true })); setTimeout(() => document.getElementById('panel-fila')?.scrollIntoView({ behavior: 'smooth' }), 50) } },
    { label: 'Sem equipe', value: executive.semEquipe, sub: 'exigem designação', icon: Users, color: executive.semEquipe ? 'text-orange' : 'text-green', onClick: () => { setOpenPanels(prev => ({ ...prev, pend: true })); setTimeout(() => document.getElementById('panel-pend')?.scrollIntoView({ behavior: 'smooth' }), 50) } },
  ]

  return (
    <>
      <div className="space-y-4 animate-fade-in">

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-primary" />
              <h2 className="font-headline text-xl font-semibold text-text">Centro Operacional por Cidade</h2>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-caption text-muted">
              <span className="rounded-full border border-white/[0.08] bg-surface/40 px-2 py-1">Fila ao vivo</span>
              <span className="rounded-full border border-white/[0.08] bg-surface/40 px-2 py-1">Capacidade: últimos 14 dias úteis</span>
              <span className="rounded-full border border-white/[0.08] bg-surface/40 px-2 py-1">Executadas: hoje</span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Filtros da visão por cidade">
            <label className="text-caption font-semibold text-muted">
              Cidade
              <select value={cidadeFilter} onChange={e => setCidadeFilter(e.target.value)}
                      className="mt-1 min-h-11 w-full rounded-lg border border-white/[0.10] bg-card px-3 text-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-9">
                <option value="">Todas as cidades</option>
                {cidadesOptions.map(cidade => <option key={cidade} value={cidade}>{cidade}</option>)}
              </select>
            </label>
            <label className="text-caption font-semibold text-muted">
              Categoria
              <select value={tipoFilter} onChange={e => setTipoFilter(e.target.value as CidadeTipoFilter)}
                      className="mt-1 min-h-11 w-full rounded-lg border border-white/[0.10] bg-card px-3 text-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-9">
                <option value="TODOS">Todas</option>
                <option value="INSTALACAO">Instalação</option>
                <option value="MANUTENCAO">Manutenção</option>
                <option value="OUTRO">Serviço</option>
              </select>
            </label>
          </div>
        </div>

        {cidadeFilter && (
          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/[0.05] px-3 py-2">
            <p className="text-label text-secondary">Detalhando <strong className="text-text">{cidadeFilter}</strong></p>
            <button onClick={() => setCidadeFilter('')} aria-label="Remover filtro de cidade"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-caption font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-8">
              <X size={12} /> Ver todas
            </button>
          </div>
        )}

        {isLoading ? <KPIGridSkeleton count={4} /> : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {executiveCards.map(card => {
              const Icon = card.icon
              return (
                <button key={card.label} onClick={card.onClick}
                        disabled={!card.onClick || (card.label === 'Cidade prioritária' && !executive.prioritaria)}
                        className="min-h-28 rounded-xl border border-white/[0.08] bg-card p-4 text-left transition-colors hover:border-primary/25 hover:bg-surface/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-default disabled:hover:border-white/[0.08]">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className={card.color} />
                    <span className="text-caption font-bold uppercase tracking-[0.05em] text-muted">{card.label}</span>
                  </div>
                  <p className={`mt-2 truncate font-mono text-2xl font-bold tabular-nums ${card.color}`}>{card.value}</p>
                  <p className="mt-1 text-caption text-muted">{card.sub}</p>
                </button>
              )
            })}
          </div>
        )}

        {/* ── AI Clusters Panel ── */}
        {!aiEnabled ? (
          <div className="rounded-xl border border-white/[0.06] bg-surface/10 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkle size={12} className="text-primary/40" />
              <span className="text-caption font-bold text-muted uppercase tracking-wide">Clusters de Pendências · IA</span>
            </div>
            <button
              onClick={() => setAiEnabled(true)}
              className="flex items-center gap-1.5 text-caption font-semibold text-primary/70 hover:text-primary
                         px-3 py-1.5 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/[0.08]
                         transition-all duration-fast"
            >
              <Sparkle size={11} /> Analisar com IA
            </button>
          </div>
        ) : aiClusters && aiClusters.clusters.length > 0 && (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkle size={13} className="text-primary" />
              <span className="text-caption font-bold text-primary/80 uppercase tracking-wide">
                Clusters de pendencias detectados
              </span>
            </div>
            {aiClusters.narrativa && (
              <p className="text-label text-secondary leading-relaxed">{aiClusters.narrativa}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {aiClusters.clusters.map((cl, i) => (
                <div key={i}
                     className="flex-1 min-w-[200px] bg-card border border-white/[0.08] rounded-lg px-3 py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-label font-semibold text-text truncate">{cl.bairro}</p>
                    <span className="font-mono text-body font-bold text-primary tabular-nums flex-shrink-0">{cl.count}</span>
                  </div>
                  <p className="text-caption text-muted">{cl.cidade}</p>
                  {cl.tipos.length > 0 && (
                    <p className="text-caption text-secondary">{cl.tipos.join(', ')}</p>
                  )}
                  {cl.sugestao && (
                    <p className="text-caption text-muted italic leading-snug">{cl.sugestao}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <h3 className="text-label font-bold uppercase tracking-[0.06em] text-secondary">Atalhos operacionais</h3>
          <span className="text-caption text-muted">Abra somente o detalhe necessário</span>
        </div>
        {isLoading ? <KPIGridSkeleton count={5} /> : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {panels.slice(0, 5).map(p => (
              <button
                key={p.id}
                onClick={() => {
                  setOpenPanels(prev => ({ ...prev, [p.id]: true }))
                  setTimeout(() => {
                    document.getElementById(`panel-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }, 50)
                }}
                className={`bg-card bg-gradient-to-br ${PANEL_FROM[p.color]} to-transparent
                            border border-white/[0.08] ${PANEL_HOVER[p.color]}
                            rounded-xl p-4 text-left cursor-pointer transition-all duration-normal
                            hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none
                            focus-visible:ring-2 focus-visible:ring-primary/50`}
              >
                <p className="text-caption font-bold uppercase tracking-[0.06em] text-muted mb-1">{p.title}</p>
                <p className={`font-mono font-bold text-3xl text-${p.color}`}>{p.rows.length}</p>
                <p className="text-caption text-muted mt-0.5">ordens</p>
                {(p.semEquipe ?? 0) > 0 && (
                  <p className="text-caption text-orange font-semibold mt-1">{p.semEquipe} sem equipe</p>
                )}
                {(p.breakdown.inst > 0 || p.breakdown.manut > 0 || p.breakdown.serv > 0) && (
                  <div className="mt-2 pt-2 border-t border-white/[0.08] space-y-0.5">
                    {p.breakdown.inst  > 0 && (
                      <div className="flex justify-between">
                        <span className="text-caption text-muted">Instalação</span>
                        <span className="text-caption font-mono font-bold text-cyan tabular-nums">{p.breakdown.inst}</span>
                      </div>
                    )}
                    {p.breakdown.manut > 0 && (
                      <div className="flex justify-between">
                        <span className="text-caption text-muted">Manutenção</span>
                        <span className="text-caption font-mono font-bold text-orange tabular-nums">{p.breakdown.manut}</span>
                      </div>
                    )}
                    {p.breakdown.serv  > 0 && (
                      <div className="flex justify-between">
                        <span className="text-caption text-muted">Serviço</span>
                        <span className="text-caption font-mono font-bold text-muted tabular-nums">{p.breakdown.serv}</span>
                      </div>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── Saúde por Cidade — capacidade e acúmulo (ao vivo) ── */}
        {!isLoading && (
          <SaudeCidadeTable
            saude={cidades.saude}
            revisitasPorCidade={revisitas.porCidade as { cidade: string; taxa: number }[]}
            selectedCity={cidadeFilter}
            onSelectCity={setCidadeFilter}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {panels.slice(0, 2).map(p => (
            <PainelCidade key={p.id} {...p} isLoading={isLoading} onOS={(os: OSRow) => setDrawerOS(os)}
              open={openPanels[p.id as PanelId]}
              onToggle={() => setOpenPanels(prev => ({ ...prev, [p.id]: !prev[p.id as PanelId] }))}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {panels.slice(2, 4).map(p => (
            <PainelCidade key={p.id} {...p} isLoading={isLoading} onOS={(os: OSRow) => setDrawerOS(os)}
              open={openPanels[p.id as PanelId]}
              onToggle={() => setOpenPanels(prev => ({ ...prev, [p.id]: !prev[p.id as PanelId] }))}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PainelCidade {...panels[5]} isLoading={isLoading} onOS={(os: OSRow) => setDrawerOS(os)}
            open={openPanels[panels[5].id as PanelId]}
            onToggle={() => setOpenPanels(prev => ({ ...prev, [panels[5].id]: !prev[panels[5].id as PanelId] }))}
          />
          <PainelCidade {...panels[4]} isLoading={isLoading} onOS={(os: OSRow) => setDrawerOS(os)}
            open={openPanels[panels[4].id as PanelId]}
            onToggle={() => setOpenPanels(prev => ({ ...prev, [panels[4].id]: !prev[panels[4].id as PanelId] }))}
          />
        </div>

      </div>

      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />
    </>
  )
}
