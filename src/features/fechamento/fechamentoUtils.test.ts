import { describe, expect, it } from 'vitest'
import type { OSRow } from '../../lib/types'
import { calcStats } from './fechamentoUtils'

function row(situation: string, team = 'INST F01'): OSRow {
  return {
    numos: String(Math.random()),
    descsituacao: situation,
    nomedaequipe: team,
    nomedacidade: 'TAUBATÉ',
    tiposervico: 'INSTALACAO',
  } as OSRow
}

describe('calcStats', () => {
  it('mantém Sem Execução no total operacional, mas não atribui à produtividade técnica', () => {
    const stats = calcStats([
      row('Concluída'),
      row('Concluída/Sem Execução'),
      row('Pendente'),
    ], 'global')

    expect(stats.semExec).toBe(1)
    expect(Object.values(stats.byEquipe)).toEqual([
      { exec: 1, semExec: 0, pend: 1, slaVenc: 0 },
    ])
  })

  it('não cria equipe técnica quando ela possui somente baixa Sem Execução', () => {
    const stats = calcStats([row('Concluída/Sem Execução', 'INST F99')], 'global')

    expect(stats.semExec).toBe(1)
    expect(stats.byEquipe['INST F99']).toBeUndefined()
  })
})
