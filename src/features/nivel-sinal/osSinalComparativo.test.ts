import { describe, expect, it } from 'vitest'
import type { OSRow } from '../../lib/types'
import type { SignalRow } from './nivelSinal'
import { buildBairroComparativo } from './osSinalComparativo'

const os = (overrides: Partial<OSRow> = {}): OSRow => ({
  numos: '1234567', nomedaequipe: 'MANUT F01', nomedacidade: 'Taubaté', bairro: 'Centro',
  _tipo: 'MANUTENCAO', _slaCritico: false,
  ...overrides,
} as OSRow)

const signal = (overrides: Partial<SignalRow> = {}): SignalRow => ({
  cidade: 'Taubaté', bairro: 'Centro', olt: 'OLT TBT', tipo: 'Huawei', slot: '1', pon: '1/1',
  onu: '1', cliente: 'Cliente', codigo: '1', situacao: 'Conectado', pppoe: '', serial: '',
  modelo: '—', status: 'Online', classificacao: 'Crítico', rx: -29, tx: null, oltRx: null,
  distancia: null, temperatura: null, causa: '—', cidadeCliente: '—', alertaRx: true,
  ...overrides,
} as SignalRow)

describe('buildBairroComparativo', () => {
  it('cruza OS de manutenção e alerta de sinal pelo mesmo bairro', () => {
    const rows = buildBairroComparativo(
      [os(), os({ numos: '2' })],
      [signal(), signal({ onu: '2', classificacao: 'Atenção' })],
    )
    expect(rows).toEqual([expect.objectContaining({
      bairro: 'Centro', cidade: 'Taubaté', osCount: 2, sinalTotal: 2, sinalCriticos: 1, sinalAtencao: 1,
    })])
  })

  it('ignora instalação — não é reclamação do cliente', () => {
    const rows = buildBairroComparativo([os({ _tipo: 'INSTALACAO' })], [])
    expect(rows).toEqual([])
  })

  it('ignora COPE e reagendamento na contagem de OS', () => {
    const rows = buildBairroComparativo(
      [os({ nomedaequipe: 'COPE VALE' }), os({ nomedaequipe: 'REAGENDAMENTO F01' })],
      [],
    )
    expect(rows).toEqual([])
  })

  it('mantém o bairro do lado sinal mesmo sem nenhuma OS de manutenção nele', () => {
    const rows = buildBairroComparativo([], [signal({ bairro: 'Jardim das Nações' })])
    expect(rows).toEqual([expect.objectContaining({ bairro: 'Jardim das Nações', osCount: 0, sinalTotal: 1 })])
  })

  it('ordena pelo maior número de OS de manutenção primeiro', () => {
    const rows = buildBairroComparativo(
      [os({ bairro: 'Pouco OS' }), os({ bairro: 'Muito OS' }), os({ numos: '2', bairro: 'Muito OS' }), os({ numos: '3', bairro: 'Muito OS' })],
      [],
    )
    expect(rows.map(r => r.bairro)).toEqual(['Muito OS', 'Pouco OS'])
  })

  it('calcula o RX médio só com leituras válidas e marca SLA crítico da OS', () => {
    const rows = buildBairroComparativo(
      [os({ _slaCritico: true })],
      [signal({ rx: -30 }), signal({ onu: '2', rx: -20 }), signal({ onu: '3', rx: null })],
    )
    expect(rows[0]).toMatchObject({ osCriticas: 1, rxMedio: -25 })
  })

  it('não junta bairros de cidades diferentes com o mesmo nome', () => {
    const rows = buildBairroComparativo(
      [os({ nomedacidade: 'Taubaté', bairro: 'Centro' })],
      [signal({ cidade: 'Pindamonhangaba', bairro: 'Centro' })],
    )
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.cidade === 'Taubaté')?.sinalTotal).toBe(0)
    expect(rows.find(r => r.cidade === 'Pindamonhangaba')?.osCount).toBe(0)
  })
})
