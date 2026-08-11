import { describe, expect, it } from 'vitest'
import { signalOccurrenceKey, syncSignalOccurrences } from './signalOccurrenceModel'
import type { SignalRow } from './nivelSinal'

const row = (overrides: Partial<SignalRow> = {}): SignalRow => ({
  cidade: 'Taubaté', bairro: 'Centro', olt: 'OLT TBT', tipo: 'Huawei', slot: '1', pon: '1/2', onu: '7',
  cliente: 'Cliente Teste', codigo: '12345', situacao: 'Conectado', pppoe: 'cliente.teste', serial: 'ABC123',
  modelo: 'HG8145', status: 'Online', classificacao: 'Crítico', rx: -29.5, tx: null, oltRx: null, distancia: null, causa: '—',
  ...overrides,
})

describe('syncSignalOccurrences', () => {
  it('cria uma única ocorrência para o mesmo equipamento em importações repetidas', () => {
    const first = syncSignalOccurrences([], [row()], '2026-08-11')
    const second = syncSignalOccurrences(first, [row({ rx: -30 })], '2026-08-12')

    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({ status: 'Aberto', before: -29.5, current: -30 })
  })

  it('conclui automaticamente quando a potência volta ao normal', () => {
    const open = syncSignalOccurrences([], [row()], '2026-08-11')
    const resolved = syncSignalOccurrences(open, [row({ classificacao: 'Normal', rx: -22 })], '2026-08-12')

    expect(resolved[0]).toMatchObject({ status: 'Concluído', after: -22, resolution: 'Correção detectada no CSV' })
  })

  it('mantém aberta ocorrência que não aparece na nova fotografia', () => {
    const open = syncSignalOccurrences([], [row()], '2026-08-11')
    const resolved = syncSignalOccurrences(open, [], '2026-08-12')

    expect(resolved[0]).toMatchObject({ status: 'Aberto', missedSnapshots: 1 })
  })

  it('cria novo episódio quando o alerta reaparece após uma conclusão manual', () => {
    const open = syncSignalOccurrences([], [row()], '2026-08-11')
    const closed = [{ ...open[0], status: 'Concluído' as const, resolution: 'Tratativa manual' }]
    const recurrence = syncSignalOccurrences(closed, [row()], '2026-08-12')
    expect(recurrence).toHaveLength(2)
    expect(recurrence.filter(item => item.status === 'Aberto')).toHaveLength(1)
  })

  it('ignora identificadores placeholder para não colidir equipamentos', () => {
    const first = signalOccurrenceKey(row({ serial: '—', codigo: '1001' }))
    const second = signalOccurrenceKey(row({ serial: '—', codigo: '1002' }))
    expect(first).toBe('codigo:1001')
    expect(second).toBe('codigo:1002')
  })
})
