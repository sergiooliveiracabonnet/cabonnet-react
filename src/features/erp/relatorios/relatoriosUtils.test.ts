import { describe, expect, it } from 'vitest'
import { csvCell } from './relatoriosUtils'

describe('csvCell', () => {
  it('escapa aspas, separadores e fórmulas', () => {
    expect(csvCell('A; "B"')).toBe('"A; ""B"""')
    expect(csvCell('=1+1')).toBe('"\'=1+1"')
  })
})
