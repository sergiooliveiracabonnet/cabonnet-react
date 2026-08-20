import { describe, expect, it } from 'vitest'
import type { ClienteReincidente } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'
import { buildIntervalDistribution, buildReincidenciaPairs, buildTeamRecurrenceRanking, filterReincidentes, getOSObservation, mergeOSObservations } from './reincidenciasReport'

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

  it('atribui a reincidência à equipe da OS anterior e calcula a taxa sobre sua base', () => {
    const cases = [
      cliente([row('1', 'INST F08', 'WES', '01/08/2026'), row('2', 'INST F11', 'WES', '05/08/2026')]),
      { ...cliente([row('3', 'INST F08', 'WES', '02/08/2026'), row('4', 'INST F12', 'THM', '08/08/2026')]), chave: '2' },
    ]
    const base = [
      ...cases.flatMap(c => c.rows),
      { ...row('5', 'INST F08', 'WES', '03/08/2026'), codigocliente: 'sem-retorno', _tipo: 'MANUTENCAO', descsituacao: 'Concluída' },
    ] as OSRow[]
    cases.flatMap(c => c.rows).forEach((r, i) => Object.assign(r, { codigocliente: i < 2 ? '1' : '2', _tipo: 'MANUTENCAO', descsituacao: 'Concluída' }))

    expect(buildTeamRecurrenceRanking(cases, base, new Date(2026, 7, 20))[0]).toMatchObject({
      equipe: 'INST F08', reincidentes: 2, revisitas: 2, base: 3, taxa: 67,
    })
  })

  it('distribui o intervalo entre visitas em faixas operacionais', () => {
    expect(buildIntervalDistribution([
      { dias_entre: 2 }, { dias_entre: 7 }, { dias_entre: 12 }, { dias_entre: 25 }, { dias_entre: 45 },
    ] as ReturnType<typeof buildReincidenciaPairs>)).toEqual([
      { faixa: '0–3d', total: 1 }, { faixa: '4–7d', total: 1 }, { faixa: '8–15d', total: 1 },
      { faixa: '16–30d', total: 1 }, { faixa: '31–60d', total: 1 },
    ])
  })

  it('usa todos os campos conhecidos de observação com fallback objetivo', () => {
    expect(getOSObservation({ observacoes: 'texto principal', obs: 'legado' } as unknown as OSRow)).toBe('texto principal')
    expect(getOSObservation({ observacaocritica: 'texto crítico' } as unknown as OSRow)).toBe('texto crítico')
    expect(getOSObservation({ obs: '' } as unknown as OSRow)).toBe('Sem observação registrada')
  })

  it('reduz a observação estruturada ao motivo da abertura e ao que foi feito', () => {
    const structured = `entra em contato informando que está sem sinal

( ) CNC

Luzes e como estão (piscando, fixa ou apagada):LOS/REG piscando vermelho

Procedimentos:
(X) Verificado os cabos
(X) Equipamentos reiniciados, MAC Limpo

Melhor número para contato:12) 98197-4638
Protocolo: 99580196-71

Informações da Execução:
Obs:TROCA DE ONU
Cliente\\Responsável: WELLINGTON
RG: .
Nome Executante: T-MAYKON RODRIGO

LOCALIZAÇÃO
Latitude Inicio: -22.9589369`

    expect(getOSObservation({ observacoes: structured } as unknown as OSRow)).toBe(
      'Motivo da abertura: entra em contato informando que está sem sinal\nO que foi feito: TROCA DE ONU',
    )
  })

  it('mantém observações livres que não seguem o formulário estruturado', () => {
    expect(getOSObservation({ observacoes: 'Cliente ausente; retorno agendado.' } as unknown as OSRow))
      .toBe('Cliente ausente; retorno agendado.')
  })

  it('incorpora as observações pesadas retornadas pelo endpoint em lote', () => {
    const original = cliente([row('1', 'INST F08', 'WES', '01/08/2026')])
    const [merged] = mergeOSObservations([original], { '1': { observacoes: 'Executado em campo', observacaocritica: 'Atenção' } })
    expect(getOSObservation(merged.rows[0])).toBe('Executado em campo')
    expect(original.rows[0].observacoes).toBeUndefined()
  })
})
