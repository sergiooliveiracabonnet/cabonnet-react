import { useMemo, useState } from 'react'
import { Image } from '@phosphor-icons/react'
import { PageHeader } from '../../../components/ui/PageHeader'
import { getWeekDays } from '../planner/PlannerComponents'
import { useEscalaSemana, useEscalaActions } from '../../../hooks/useEscala'
import { EscalaGrid } from './EscalaGrid'
import { EscalaSummaryPanel } from './EscalaSummaryPanel'
import { EscalaModeToggle, type EscalaModo } from './EscalaModeToggle'
import { EscalaTimelineView } from './EscalaTimelineView'
import { EscalaMindMapModal } from './EscalaMindMapModal'
import PlannerExecutadoView from '../planner/PlannerExecutadoView'

const DESCRICAO: Record<EscalaModo, string> = {
  grade:    'Planejamento semanal de equipes — selecione a cidade ou atividade de cada equipe em cada dia',
  timeline: 'Carga por hora das equipes — cada OS ocupa 1h na janela de 08h às 18h',
  planner:  'Histórico de execuções por equipe',
}

export default function EscalaPage() {
  const [modo, setModo] = useState<EscalaModo>('grade')
  const [weekOffset, setWeekOffset] = useState(0)
  const [mindMapOpen, setMindMapOpen] = useState(false)
  const days = useMemo(() => getWeekDays(weekOffset), [weekOffset])
  const dias = useMemo(() => days.map(d => d.key), [days])

  const { data: items = [], isLoading } = useEscalaSemana(dias)
  const { setStatus } = useEscalaActions(dias)

  return (
    <div className="space-y-4 max-w-[1600px]">
      <PageHeader
        title="Escala"
        description={DESCRICAO[modo]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setMindMapOpen(true)}
              className="flex items-center gap-1.5 text-caption font-semibold text-secondary hover:text-text
                         border border-subtle rounded-lg px-3 py-1.5 transition-colors"
            >
              <Image size={12} /> Exportar imagem
            </button>
            <EscalaModeToggle modo={modo} onChange={setModo} />
          </div>
        }
      />
      {modo === 'grade' && (
        <>
          <EscalaGrid
            days={days}
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
            items={items}
            isLoading={isLoading}
            onChangeStatus={setStatus}
          />
          <EscalaSummaryPanel days={days} items={items} />
        </>
      )}
      {modo === 'timeline' && <EscalaTimelineView />}
      {modo === 'planner'  && <PlannerExecutadoView />}

      {mindMapOpen && <EscalaMindMapModal onClose={() => setMindMapOpen(false)} />}
    </div>
  )
}
