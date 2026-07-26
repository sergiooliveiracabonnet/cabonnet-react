import { describe, expect, it } from 'vitest'
import type { OSRow } from '../../lib/types'
import { filterRowsByEquipe, filterRowsByFornecedor } from './DashboardDrilldowns'

const rows = [
  {
    numos: '0000001',
    nomedaequipe: 'INSTALACAO F01 FELIPE',
    _fornecedor: 'WES',
  },
  {
    numos: '0000002',
    nomedaequipe: 'INSTALACAO F08 ELCIO',
    _fornecedor: 'THM',
  },
] as OSRow[]

describe('drill-downs do dashboard', () => {
  it('usa o mesmo nome curto do builder para filtrar a equipe', () => {
    expect(filterRowsByEquipe(rows, 'INST F01 - FELIPE').map(row => row.numos)).toEqual(['0000001'])
  })

  it('traduz o código interno antes de filtrar o fornecedor', () => {
    expect(filterRowsByFornecedor(rows, 'WES').map(row => row.numos)).toEqual(['0000001'])
  })
})
