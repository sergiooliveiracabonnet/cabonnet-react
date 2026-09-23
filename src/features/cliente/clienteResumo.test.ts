import { describe, it, expect } from 'vitest'
import { buildClienteResumo, fidelidadeDoContrato, isReincidencia } from './clienteResumo'
import type { ClienteContrato, ClientePlano } from '../../lib/api'

const HOJE = new Date(2026, 8, 23)

function os(numos: string, extra: Record<string, string>): Record<string, string> {
  return {
    numos, servico: 'ASSISTENCIA - VT 24H', tiposervico: 'MANUTENCAO', descsituacao: 'Concluída',
    nomedaequipe: '03- VAL - MANUTENCAO F12', equipeexecutou: '03- VAL - MANUTENCAO F12',
    nomedacidade: 'Taubaté', datacadastro: '', dataexecucao: '', databaixa: '', dataagendamento: '',
    ...extra,
  }
}

const contrato = (situacao: number, extra: Partial<ClienteContrato> = {}): ClienteContrato => ({
  contrato: '1', situacao, situacaoanterior: null, datasituacaoanterior: null, valor: 99,
  datavenda: null, datainstalacao: null, empresa: '', apelido: '',
  pontoreferencia: '', iniciopromocao: null, plano: null, observacao: '',
  endereco: { logradouro: '', numero: '', complemento: '', bairro: '', cep: '' },
  ...extra,
})

const plano = (fidelidade_meses: number | null): ClientePlano => ({
  descricao: '600 MB 99,90', velocidade_mb: 600, valor: 99.9, promocional: false, fidelidade_meses,
})

describe('buildClienteResumo', () => {
  it('separa OS administrativas das técnicas', () => {
    const r = buildClienteResumo([
      os('1000001', { datacadastro: '01/09/2026 10:00', dataexecucao: '02/09/2026 10:00' }),
      os('1000002', { servico: 'INADIMPLENCIA - REDUCAO DE VELOCIDADE', datacadastro: '05/09/2026 10:00' }),
    ], [contrato(2)], HOJE)
    expect(r.tecnicas.map(o => o.numos)).toEqual(['1000001'])
    expect(r.administrativas.map(o => o.numos)).toEqual(['1000002'])
    expect(r.inadimplencia12m).toBe(1)
  })

  it('reincidência é a marca oficial do ERP, não recalculada', () => {
    const r = buildClienteResumo([
      os('1000001', { datacadastro: '01/03/2026', dataexecucao: '01/03/2026 09:00' }),
      // 19 dias depois, mas o ERP não marcou: não conta
      os('1000002', { datacadastro: '20/03/2026', dataexecucao: '20/03/2026 09:00', recorrencia: '0' }),
      os('1000003', { datacadastro: '10/06/2026', dataexecucao: '10/06/2026 09:00', recorrencia: '1' }),
      os('1000004', { datacadastro: '10/06/2025', recorrencia: '1' }),   // fora dos 12 meses
    ], [contrato(2)], HOJE)
    expect(r.reincidencias12m).toBe(1)
    expect(r.visitas12m).toBe(3)
    expect(r.intervaloMedianoDias).toBe(51)
    expect(r.alertas.some(a => a.texto === '1 reincidência no último ano')).toBe(true)
  })

  it('transferência de endereço e troca de cabeamento não contam como reincidência, mesmo marcadas pelo ERP', () => {
    const r = buildClienteResumo([
      os('1000001', { datacadastro: '01/09/2026', recorrencia: '1', servico: 'TROCAR CABEAMENTO' }),
      os('1000002', { datacadastro: '02/09/2026', recorrencia: '1', servico: 'TRANSF. DE ENDERECO SINGLE ' }),
      os('1000003', { datacadastro: '03/09/2026', recorrencia: '1' }),
    ], [], HOJE)
    expect(r.reincidencias12m).toBe(1)
    expect(r.tecnicas.filter(isReincidencia).map(o => o.numos)).toEqual(['1000003'])
  })

  it('soma reagendamentos da auditoria e distingue "sem auditoria" de zero', () => {
    const ordens = [
      os('1000001', { datacadastro: '01/09/2026', reagendamentos: '2' }),
      os('1000002', { datacadastro: '01/08/2026', reagendamentos: '1' }),
      os('1000003', { datacadastro: '01/08/2025', reagendamentos: '5' }),  // fora dos 12 meses
    ]
    expect(buildClienteResumo(ordens, [], HOJE, true).reagendamentos12m).toBe(3)
    expect(buildClienteResumo(ordens, [], HOJE, false).reagendamentos12m).toBeNull()
  })

  it('OS aberta há dias ou muito reagendada vira alerta', () => {
    const r = buildClienteResumo([
      os('1000001', { descsituacao: 'Pendente', datacadastro: '15/09/2026 08:00', reagendamentos: '2' }),
      os('1000002', { descsituacao: 'Pendente', datacadastro: '22/09/2026 08:00', reagendamentos: '0' }),
    ], [contrato(4)], HOJE)
    expect(r.abertas).toHaveLength(2)
    expect(r.alertas.map(a => a.texto)).toEqual(expect.arrayContaining([
      'OS 1000001 aberta há 8 dias, reagendada 2 vezes', 'Contrato 1 bloqueado',
    ]))
    expect(r.alertas.some(a => a.texto.includes('1000002'))).toBe(false)
  })

  it('usa a coordenada da execução mais recente válida', () => {
    const r = buildClienteResumo([
      os('1000001', { datacadastro: '01/08/2026', dataexecucao: '01/08/2026 10:00', latitude: '-23.02', longitude: '-45.55' }),
      os('1000002', { datacadastro: '01/09/2026', dataexecucao: '01/09/2026 10:00', latitude: '0', longitude: '0' }),
    ], [], HOJE)
    expect(r.localizacao).toMatchObject({ lat: -23.02, lng: -45.55, numos: '1000001' })
  })

  it('distribui OS técnicas nos 12 meses até hoje', () => {
    const r = buildClienteResumo([
      os('1000001', { datacadastro: '10/09/2026' }),
      os('1000002', { datacadastro: '11/09/2026' }),
      os('1000003', { datacadastro: '01/10/2025' }),
      os('1000004', { datacadastro: '01/09/2025' }),   // fora dos 12 meses
    ], [], HOJE)
    expect(r.porMes).toHaveLength(12)
    expect(r.porMes[0]).toEqual({ mes: 'out/25', n: 1 })
    expect(r.porMes[11]).toEqual({ mes: 'set/26', n: 2 })
    expect(r.os12m).toBe(3)
  })

  it('ranqueia serviços e equipes; última visita mostra o técnico', () => {
    const r = buildClienteResumo([
      os('1000001', { datacadastro: '01/09/2026', dataexecucao: '01/09/2026 10:00', nomeexecutante: 'JOAO' }),
      os('1000002', { datacadastro: '05/08/2026', dataexecucao: '05/08/2026 10:00' }),
      os('1000003', { servico: 'TROCAR CABEAMENTO', datacadastro: '01/07/2026', dataexecucao: '01/07/2026 10:00' }),
    ], [], HOJE)
    expect(r.servicosFrequentes[0]).toEqual({ servico: 'ASSISTENCIA - VT 24H', n: 2 })
    expect(r.equipes[0].n).toBe(3)
    expect(r.ultimaVisita?.tecnico).toBe('JOAO')
  })
})

describe('fidelidade', () => {
  it('conta a partir da instalação e avisa quando está acabando', () => {
    const c = contrato(2, { datainstalacao: '15/10/2025', plano: plano(12) })
    const f = fidelidadeDoContrato(c, HOJE)
    expect(f?.fim).toEqual(new Date(2026, 9, 15))
    expect(f?.vigente).toBe(true)
    const r = buildClienteResumo([], [c], HOJE)
    expect(r.alertas.map(a => a.texto)).toContain('Fidelidade do contrato 1 termina em 15/10/2026')
  })

  it('sem prazo, sem data ou contrato inativo não calcula', () => {
    expect(fidelidadeDoContrato(contrato(2, { datainstalacao: '15/10/2025', plano: plano(null) }), HOJE)).toBeNull()
    expect(fidelidadeDoContrato(contrato(2, { plano: plano(12) }), HOJE)).toBeNull()
    expect(fidelidadeDoContrato(contrato(5, { datainstalacao: '15/10/2025', plano: plano(12) }), HOJE)).toBeNull()
  })

  it('fidelidade encerrada não gera alerta', () => {
    const c = contrato(2, { datainstalacao: '01/01/2024', plano: plano(12) })
    expect(fidelidadeDoContrato(c, HOJE)?.vigente).toBe(false)
    expect(buildClienteResumo([], [c], HOJE).alertas.some(a => a.texto.includes('Fidelidade'))).toBe(false)
  })
})
