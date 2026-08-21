import { describe, expect, it } from 'vitest'
import { aiPairKey, buildSintesePayload, mergeAIReincidenciaBatches, type AIReincidenciaBatch } from './useAIReincidencias'
import type { ReincidenciaPair } from '../features/reincidencias/reincidenciasReport'

const par = (n: number): ReincidenciaPair => ({
  tipo: 'manutencao', nomecliente: `Cliente ${n}`, nomedacidade: 'SJC', chave_cliente: `c${n}`,
  equipe_orig: `F0${n}`, equipe_rev: `F0${n}`,
  numos_orig: `100000${n}`, servico_orig: 'MANUTENCAO', obs_orig: 'obs',
  numos_rev: `200000${n}`, servico_rev: 'MANUTENCAO', obs_rev: 'obs', dias_entre: n,
})

const batch = (analises: AIReincidenciaBatch['analises'], narrativa = ''): AIReincidenciaBatch =>
  ({ cached: false, narrativa, analises, causas_distribuicao: [] })

describe('mergeAIReincidenciaBatches', () => {
  it('reancora cada diagnóstico no par real usando o offset do lote', () => {
    const pares = [par(1), par(2), par(3)]
    const result = mergeAIReincidenciaBatches([
      batch([{ par: 1, causa: 'Equipamento', feito_primeira: 'trocou ONU', o_que_faltou: 'ONU voltou a cair' }]),
      batch([{ par: 1, causa: 'Configuração', feito_primeira: 'ajustou PPPoE', o_que_faltou: 'perfil errado' }]),
      batch([{ par: 1, causa: 'Equipamento', feito_primeira: 'reset', o_que_faltou: 'defeito persistiu' }]),
    ], pares, 1)

    expect(result.paresAnalisados).toBe(3)
    expect(result.porPar[aiPairKey('1000002', '2000002')]).toMatchObject({
      cliente: 'Cliente 2', causa: 'Configuração', equipe: 'F02', diasEntre: 2,
    })
  })

  it('ignora os números de OS ecoados pelo modelo quando divergem do par enviado', () => {
    const pares = [par(1)]
    const result = mergeAIReincidenciaBatches(
      [batch([{ par: 1, numos_orig: '9999999', numos_rev: '8888888', causa: 'Rede/Infraestrutura' }])],
      pares,
    )
    expect(Object.keys(result.porPar)).toEqual([aiPairKey('1000001', '2000001')])
    expect(result.porPar[aiPairKey('1000001', '2000001')].numosOrig).toBe('1000001')
  })

  it('recalcula a distribuição a partir dos rótulos por par e ordena por volume', () => {
    const pares = [par(1), par(2), par(3), par(4)]
    const result = mergeAIReincidenciaBatches([
      batch([
        { par: 1, causa: 'Equipamento' }, { par: 2, causa: 'Equipamento' },
        { par: 3, causa: 'Equipamento' }, { par: 4, causa: 'Configuração' },
      ]),
    ], pares)

    expect(result.causas.map(c => [c.causa, c.count, c.pct])).toEqual([
      ['Equipamento', 3, 75], ['Configuração', 1, 25],
    ])
    expect(result.causas[0].pares).toHaveLength(3)
    expect(result.resumo).toContain('4 pares de revisita classificados')
    expect(result.resumo).toContain('Equipamento — 3 pares (75%)')
  })

  it('classifica como Sem Informação quando o modelo devolve causa vazia', () => {
    const result = mergeAIReincidenciaBatches([batch([{ par: 1, causa: '' }])], [par(1)])
    expect(result.causas[0].causa).toBe('Sem Informação')
  })

  it('mantém uma nota por lote em vez de concatenar as narrativas', () => {
    const result = mergeAIReincidenciaBatches([
      batch([{ par: 1, causa: 'Equipamento' }], 'Lote um.'),
      batch([{ par: 1, causa: 'Equipamento' }], 'Lote dois.'),
    ], [par(1), par(2)], 1)
    expect(result.notas).toEqual(['Lote um.', 'Lote dois.'])
  })

  it('cai para a distribuição declarada pelo modelo quando nenhum par é aproveitável', () => {
    const result = mergeAIReincidenciaBatches(
      [{ cached: true, analises: [], causas_distribuicao: [{ causa: 'Rede/Infraestrutura', count: 4 }] }],
      [],
    )
    expect(result.causas).toEqual([{ causa: 'Rede/Infraestrutura', count: 4, pct: 100, pares: [] }])
    expect(result.paresAnalisados).toBe(4)
    expect(result.cached).toBe(true)
  })
})

describe('buildSintesePayload', () => {
  const pares = [par(1), par(2), par(3), par(4)]
  const analysis = mergeAIReincidenciaBatches([
    batch([
      { par: 1, causa: 'Equipamento', feito_primeira: 'trocou ONU', o_que_faltou: 'voltou a cair' },
      { par: 2, causa: 'Equipamento', feito_primeira: 'reset', o_que_faltou: 'defeito persistiu' },
      { par: 3, causa: 'Equipamento' },
      { par: 4, causa: 'Configuração' },
    ], 'Lote um.'),
  ], pares)

  it('manda o conjunto inteiro, e não um lote, com o contexto do recorte', () => {
    const payload = buildSintesePayload(analysis, { janelaDias: 60, filtros: 'Todas as terceiras' })
    expect(payload.total_pares).toBe(4)
    expect(payload.total_clientes).toBe(4)
    expect(payload.janela_dias).toBe(60)
    expect(payload.filtros).toBe('Todas as terceiras')
    expect(payload.notas).toEqual(['Lote um.'])
  })

  it('calcula intervalo médio e revisitas rápidas para a IA interpretar', () => {
    const payload = buildSintesePayload(analysis, { janelaDias: 60, filtros: '' })
    // dias_entre dos pares 1..4 = 1, 2, 3 e 4 dias
    expect(payload.intervalo_medio).toBe(2.5)
    expect(payload.revisitas_rapidas).toBe(4)
  })

  it('resume cada causa com equipes concentradas e até três exemplos', () => {
    const payload = buildSintesePayload(analysis, { janelaDias: 60, filtros: '' })
    const equipamento = payload.causas[0]
    expect(equipamento.causa).toBe('Equipamento')
    expect(equipamento.count).toBe(3)
    expect(equipamento.equipes).toEqual([
      { equipe: 'F01', count: 1 }, { equipe: 'F02', count: 1 }, { equipe: 'F03', count: 1 },
    ])
    expect(equipamento.exemplos).toHaveLength(3)
    expect(equipamento.exemplos[0]).toContain('Cliente 1 (SJC, F01, 1d)')
    expect(equipamento.exemplos[0]).toContain('feito: trocou ONU; faltou: voltou a cair')
  })

  it('marca como não registrado o par sem observação aproveitável', () => {
    const payload = buildSintesePayload(analysis, { janelaDias: 60, filtros: '' })
    expect(payload.causas[0].exemplos[2]).toContain('feito: nao registrado; faltou: nao registrado')
  })

  it('não quebra quando a causa veio da distribuição declarada, sem pares', () => {
    const semPares = mergeAIReincidenciaBatches(
      [{ cached: false, analises: [], causas_distribuicao: [{ causa: 'Rede/Infraestrutura', count: 4 }] }], [],
    )
    const payload = buildSintesePayload(semPares, { janelaDias: 60, filtros: '' })
    expect(payload.causas[0]).toMatchObject({ causa: 'Rede/Infraestrutura', count: 4, intervalo_medio: 0, equipes: [], exemplos: [] })
    expect(payload.total_clientes).toBe(0)
  })
})
