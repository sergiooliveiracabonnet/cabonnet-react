import { describe, expect, it } from 'vitest'
import type { ClienteReincidente } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'
import { buildReincidenciaPairs, filterReincidentes, getOSObservation } from './reincidenciasReport'

const row = (numos: string, equipe: string, fornecedor: OSRow['_fornecedor'], data: string, obs = '') => ({
  numos, nomedaequipe: equipe, _fornecedor: fornecedor, dataexecucao: data, databaixa: '', obs,
  nomecliente: 'Cliente A', nomedacidade: 'Taubaté', servico: 'Manutenção', tiposervico: 'Manutenção',
} as OSRow)

const cliente = (rows: OSRow[]): ClienteReincidente => ({
  chave: '1', cliente: 'Cliente A', cidade: 'Taubaté', bairro: 'Centro', visitas: rows.length,
  intervaloMedio: 5, diasDesdeUltima: 1, rows,
})

describe('relatório de reincidências', () => {
  it('filtra terceira e equipe sem perder o histórico completo do cliente selecionado', () => {
    const a = cliente([row('1', 'INST F08', 'WES', '01/08/2026'), row('2', 'INST F11', 'WES', '05/08/2026')])
    const b = { ...cliente([row('3', 'INST F12', 'THM', '02/08/2026'), row('4', 'INST F12', 'THM', '06/08/2026')]), chave: '2' }
    expect(filterReincidentes([a, b], { fornecedor: 'WES', equipe: '' })).toEqual([a])
    expect(filterReincidentes([a, b], { fornecedor: '', equipe: 'INST F12' })).toEqual([b])
  })

  it('monta pares consecutivos em ordem cronológica para a IA', () => {
    const pairs = buildReincidenciaPairs([cliente([
      row('3', 'INST F11', 'WES', '10/08/2026', 'terceira visita'),
      row('1', 'INST F08', 'WES', '01/08/2026', 'primeira visita'),
      row('2', 'INST F08', 'WES', '06/08/2026', 'segunda visita'),
    ])])
    expect(pairs.map(p => [p.numos_orig, p.numos_rev, p.dias_entre])).toEqual([
      ['1', '2', 5], ['2', '3', 4],
    ])
  })

  it('usa todos os campos conhecidos de observação com fallback objetivo', () => {
    expect(getOSObservation({ observacoes: 'texto principal', obs: 'legado' } as unknown as OSRow)).toBe('texto principal')
    expect(getOSObservation({ obs: '' } as unknown as OSRow)).toBe('Sem observação registrada')
  })
})
