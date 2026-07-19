import { useState } from 'react'
import { PageHeader } from '../../../components/ui/PageHeader'
import { PlannerModeToggle, type PlannerModo } from './PlannerModeToggle'
import PlannerExecutadoView from './PlannerExecutadoView'
import PlannerPlanejadoView from './PlannerPlanejadoView'

export default function PlannerPage() {
  const [modo, setModo] = useState<PlannerModo>('executado')

  return (
    <div className="space-y-4 max-w-[1600px]">
      <PageHeader
        title="Planner de Equipes"
        description={modo === 'executado'
          ? 'Histórico de execuções por equipe'
          : 'Agenda futura por equipe — clique numa célula para ver as OS'}
        actions={<PlannerModeToggle modo={modo} onChange={setModo} />}
      />

      {modo === 'executado' ? <PlannerExecutadoView /> : <PlannerPlanejadoView />}
    </div>
  )
}
