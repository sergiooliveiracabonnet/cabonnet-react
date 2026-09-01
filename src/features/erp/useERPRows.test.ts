import { describe, expect, it } from 'vitest'
import type { OSRow } from '../../lib/types'
import { applyDispatchAssignments } from './useERPRows'

describe('applyDispatchAssignments', () => {
  it('aplica a equipe despachada também à coleção operacional completa', () => {
    const rows = [{ numos: '1234567', nomedaequipe: '' }] as OSRow[]
    const result = applyDispatchAssignments(rows, { '1234567': 'INST F08' })

    expect(result[0].nomedaequipe).toContain('F08')
    expect(rows[0].nomedaequipe).toBe('')
  })
})
