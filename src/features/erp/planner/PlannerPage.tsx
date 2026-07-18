import { useState } from 'react'
import { PlannerModeToggle, type PlannerModo } from './PlannerModeToggle'
import PlannerExecutadoView from './PlannerExecutadoView'
import PlannerPlanejadoView from './PlannerPlanejadoView'

export default function PlannerPage() {
  const [modo, setModo] = useState<PlannerModo>('executado')

  return (
    <div className="space-y-4 max-w-[1600px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-headline font-bold text-text mb-0.5">Planner de Equipes</h1>
          <p className="text-label text-muted">
            {modo === 'executado'
              ? 'Histórico de execuções por equipe'
              : 'Agenda futura por equipe — clique numa célula para ver as OS'}
          </p>
        </div>
        <PlannerModeToggle modo={modo} onChange={setModo} />
      </div>

      {modo === 'executado' ? <PlannerExecutadoView /> : <PlannerPlanejadoView />}
    </div>
  )
}
