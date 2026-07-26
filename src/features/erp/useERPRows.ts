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

  const rows = useMemo(
    () => applyDispatchAssignments(result.rows, dispatchedAssignments),
    [result.rows, dispatchedAssignments],
  )
  const allRows = useMemo(
    () => applyDispatchAssignments(result.allRows, dispatchedAssignments),
    [result.allRows, dispatchedAssignments],
  )

  return { ...result, rows, allRows }
}

export function applyDispatchAssignments(rows: OSRow[], dispatchedAssignments: Record<string, string>): OSRow[] {
  if (!Object.keys(dispatchedAssignments).length) return rows
  return rows.map((row: OSRow) => {
    const teamCode = dispatchedAssignments[row.numos as string]
    if (!teamCode) return row
    const team = TEAMS.find(t => t.code === teamCode)
    if (!team) return row
    return { ...row, nomedaequipe: `${team.code} - ${team.leader}` }
  })
}
