import { useMemo } from 'react'
import { useOSDerived } from '../../contexts/OSDataContext'
import { useERPStore } from '../../store/erpStore'
import { TEAMS } from './erpConstants'
import type { OSRow } from '../../lib/types'

/**
 * Drop-in replacement for useOSDerived() inside ERP pages.
 * Merges dispatchedAssignments into nomedaequipe so all views
 * (Kanban, Agenda, Fila, Equipes) reflect dispatches immediately.
 */
export function useERPRows() {
  const result = useOSDerived()
  const { dispatchedAssignments } = useERPStore()

  const rows = useMemo(() => {
    const keys = Object.keys(dispatchedAssignments)
    if (!keys.length) return result.rows
    return result.rows.map((row: OSRow) => {
      const teamCode = dispatchedAssignments[row.numos as string]
      if (!teamCode) return row
      const team = TEAMS.find(t => t.code === teamCode)
      if (!team) return row
      return { ...row, nomedaequipe: `${team.code} - ${team.leader}` }
    })
  }, [result.rows, dispatchedAssignments])

  return { ...result, rows }
}
