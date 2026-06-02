import { useState, useMemo } from 'react'
import { MapPin, Wrench, Clock, CheckCircle, Calendar, CalendarClock, List } from 'lucide-react'
import { useOSDerived } from '../../contexts/OSDataContext'
import { KPIGridSkeleton } from '../../components/ui/Skeleton'
import OSDrawer from '../ordens/OSDrawer'
import { isCOPE, isReagend } from '../../lib/transform'
import type { OSRow } from '../../lib/types'
import {
  PainelCidade, tipoBreakdown, datePart,
  hojeLocal, amanhaLocal,
  PANEL_FROM, PANEL_HOVER,
  type PanelId,
} from './CidadesComponents'

export default function CidadesPage() {
  const { allRows, rows, isLoading } = useOSDerived()
  const [drawerOS,    setDrawerOS]   = useState<OSRow | null>(null)
  const [openPanels,  setOpenPanels] = useState<Record<PanelId, boolean>>({ atend: true, pend: true, concl: true, futuro: true, fila: true, amanha: true })
  const hoje  = useMemo(() => hojeLocal(), [])
  const amanha = useMemo(() => amanhaLocal(), [])

  const atendRows = useMemo(() =>
    rows.filter(r => r.descsituacao === 'Atendimento' && !isReagend(r) && !isCOPE(r))
  , [rows])

  const pendRows = useMemo(() =>
    rows.filter(r => r.descsituacao === 'Pendente' && !isCOPE(r) && !isReagend(r))
  , [rows])

  const pendSemEquipe = useMemo(() =>
    pendRows.filter(r => !r.nomedaequipe?.trim()).length
  , [pendRows])

  const conclRows = useMemo(() => allRows.filter(r => r._executadaHoje), [allRows])

  const futuroRows = useMemo(() => {
    const amanhaISO = `${amanha.slice(6)}-${amanha.slice(3,5)}-${amanha.slice(0,2)}`
    return allRows.filter(r => {
      if (r.descsituacao !== 'Atendimento' || isReagend(r) || isCOPE(r)) return false
      const agend = datePart(r.dataagendamento)
      if (!agend) return false
      const agendISO = `${agend.slice(6)}-${agend.slice(3,5)}-${agend.slice(0,2)}`
      return agendISO >= amanhaISO
    })
  }, [allRows, amanha])

  const futuroAmanhaRows   = useMemo(() => futuroRows.filter(r => datePart(r.dataagendamento) === amanha), [futuroRows, amanha])
  const futuroRestanteRows = useMemo(() => futuroRows.filter(r => datePart(r.dataagendamento) !== amanha), [futuroRows, amanha])

  const filaRows = useMemo(() => {
    const fim   = new Date(); fim.setHours(23, 59, 59, 999)
    const inicio = new Date(); inicio.setDate(inicio.getDate() - 30); inicio.setHours(0, 0, 0, 0)
    return allRows.filter(r => {
      if (isReagend(r) || isCOPE(r)) return false
      if (!['Pendente', 'Atendimento'].includes(r.descsituacao)) return false
      const raw = (r.datacadastro || '').split(' ')[0]
      if (!raw) return true
      const [dd, mm, yy] = raw.split('/')
      const dCad = new Date(+yy, +mm - 1, +dd)
      return dCad >= inicio && dCad <= fim
    })
  }, [allRows])

  const panels = [
    { id: 'atend',  title: 'Em Atendimento',                  icon: Wrench,      color: 'cyan',    rows: atendRows,        defaultOpen: true, breakdown: tipoBreakdown(atendRows) },
    { id: 'pend',   title: 'Pendentes',                       icon: Clock,       color: 'yellow',  rows: pendRows,         defaultOpen: true, semEquipe: pendSemEquipe, breakdown: tipoBreakdown(pendRows) },
    { id: 'concl',  title: `Executadas hoje (${hoje.slice(0, 5)})`, icon: CheckCircle, color: 'green', rows: conclRows, defaultOpen: true, breakdown: tipoBreakdown(conclRows) },
    {
      id: 'amanha', title: `Agendado Amanhã · ${amanha.slice(0, 5)}`, icon: CalendarClock, color: 'orange', rows: futuroAmanhaRows, defaultOpen: true,
      subtitle: `OS com agendamento confirmado para ${amanha}`,
      breakdown: tipoBreakdown(futuroAmanhaRows),
    },
    {
      id: 'fila', title: 'Fila de Execução (30 dias)', icon: List, color: 'red', rows: filaRows, defaultOpen: true,
      subtitle: 'OS em Atendimento/Pendente com cadastro nos últimos 30 dias',
      breakdown: tipoBreakdown(filaRows),
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

  return (
    <>
      <div className="space-y-4 animate-fade-in">

        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-primary" />
          <h2 className="font-headline text-xl font-semibold text-text">Ordens de Serviço por Cidade</h2>
          <span className="text-[11px] text-muted">— clique em uma cidade para ver as OS</span>
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
                            hover:shadow-md hover:-translate-y-0.5`}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-1">{p.title}</p>
                <p className={`font-mono font-bold text-3xl text-${p.color}`}>{p.rows.length}</p>
                <p className="text-[11px] text-muted mt-0.5">ordens</p>
                {(p.semEquipe ?? 0) > 0 && (
                  <p className="text-[11px] text-orange font-semibold mt-1">{p.semEquipe} sem equipe</p>
                )}
                {(p.breakdown.inst > 0 || p.breakdown.manut > 0 || p.breakdown.serv > 0) && (
                  <div className="mt-2 pt-2 border-t border-white/[0.08] space-y-0.5">
                    {p.breakdown.inst  > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[10px] text-muted">Instalação</span>
                        <span className="text-[10px] font-mono font-bold text-cyan tabular-nums">{p.breakdown.inst}</span>
                      </div>
                    )}
                    {p.breakdown.manut > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[10px] text-muted">Manutenção</span>
                        <span className="text-[10px] font-mono font-bold text-orange tabular-nums">{p.breakdown.manut}</span>
                      </div>
                    )}
                    {p.breakdown.serv  > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[10px] text-muted">Serviço</span>
                        <span className="text-[10px] font-mono font-bold text-muted tabular-nums">{p.breakdown.serv}</span>
                      </div>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
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
