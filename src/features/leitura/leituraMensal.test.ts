import { describe, it, expect } from 'vitest'
import { enrichRows } from '../../lib/transform'
import type { OSRow } from '../../lib/types'
import { buildLeituraMensal, comparar, osParaLer, puxaram, vtsAbertas, type Periodo } from './leituraMensal'

const SET: Periodo = { id: '2026-09', label: 'SET/26', from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) }
const AGO: Periodo = { id: '2026-08', label: 'AGO/26', from: new Date(2026, 7, 1), to: new Date(2026, 7, 31) }

let seq = 0
const d = (dia: number, mes: number) => `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/2026`

/** VT de um cliente: aberta em `cad`, executada em `exec` ([dia, mês]). */
function vt(cliente: string, cidade: string, bairro: string, cad: [number, number], exec: [number, number] | null, equipe = '03- VAL - INSTALACAO F11'): OSRow {
  seq++
  return {
    numos: String(9100000 + seq),
    nomecliente: `Cliente ${cliente}`, codigocliente: cliente,
    nomedacidade: cidade, bairro,
    nomedaequipe: equipe, tiposervico: 'MANUTENCAO', servico: 'ASSISTENCIA - VT 24H',
    descsituacao: exec ? 'Concluída' : 'Pendente',
    datacadastro: `${d(...cad)} 09:00`, dataagendamento: d(...cad),
    dataexecucao: exec ? `${d(...exec)} 15:00` : '', databaixa: exec ? d(...exec) : '',
  } as unknown as OSRow
}

describe('vtsAbertas', () => {
  it('conta pela data de abertura, só VT', () => {
    const rows = enrichRows([
      vt('A', 'TAUBATE', 'CENTRO', [3, 9], [4, 9]),
      vt('B', 'TAUBATE', 'CENTRO', [31, 8], [2, 9]),     // aberta em agosto
      { ...vt('C', 'TAUBATE', 'CENTRO', [5, 9], [6, 9]), servico: 'INSTALACAO PRINCIPAL', tiposervico: 'INSTALACAO' } as OSRow,
    ])
    expect(vtsAbertas(rows, SET).map(r => r.codigocliente)).toEqual(['A'])
    expect(vtsAbertas(rows, AGO).map(r => r.codigocliente)).toEqual(['B'])
  })
})

describe('comparar / puxaram', () => {
  const lista = comparar(
    [{ key: 'a', label: 'A' }, { key: 'a', label: 'A' }, { key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
    [{ key: 'b', label: 'B' }, { key: 'b', label: 'B' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }],
  )

  it('soma os dois meses e ordena pela variação', () => {
    expect(lista.map(c => [c.label, c.atual, c.anterior, c.delta])).toEqual([['A', 3, 0, 3], ['C', 0, 1, -1], ['B', 1, 3, -2]])
  })

  it('puxaram traz só quem andou na direção pedida, com pelo menos 2', () => {
    expect(puxaram(lista, 1).map(c => c.label)).toEqual(['A'])
    expect(puxaram(lista, -1).map(c => c.label)).toEqual(['B'])
  })
})

describe('buildLeituraMensal', () => {
  seq = 0
  const rows = enrichRows([
    // Taubaté: 5 VTs em setembro (3 no Jardim Ana), 2 em agosto
    vt('T1', 'TAUBATE', 'JARDIM ANA', [2, 9], [3, 9]),
    vt('T2', 'TAUBATE', 'JD ANA', [4, 9], [5, 9]),
    vt('T3', 'TAUBATE', 'JARDIM ANA', [6, 9], [7, 9]),
    vt('T4', 'TAUBATE', 'CENTRO', [8, 9], [9, 9]),
    vt('T5', 'TAUBATE', 'CENTRO', [10, 9], [11, 9]),
    vt('T6', 'TAUBATE', 'CENTRO', [5, 8], [6, 8]),
    vt('T7', 'TAUBATE', 'CENTRO', [7, 8], [8, 8]),
    // Pindamonhangaba: 1 em setembro, 3 em agosto
    vt('P1', 'PINDAMONHANGABA', 'CENTRO', [2, 9], [3, 9]),
    vt('P2', 'PINDAMONHANGABA', 'CENTRO', [2, 8], [3, 8]),
    vt('P3', 'PINDAMONHANGABA', 'CENTRO', [4, 8], [5, 8]),
    vt('P4', 'PINDAMONHANGABA', 'CENTRO', [6, 8], [7, 8]),
    // Fundo: 20 VTs no Centro de Taubaté em cada mês, para a cidade ter volume de verdade.
    ...Array.from({ length: 20 }, (_, i) => vt(`FA${i}`, 'TAUBATE', 'CENTRO', [12, 8], [13, 8])),
    ...Array.from({ length: 20 }, (_, i) => vt(`FS${i}`, 'TAUBATE', 'CENTRO', [12, 9], [13, 9])),
  ])
  // Revisita: o cliente T1 volta a chamar em setembro, 10 dias depois da primeira visita.
  const retorno = vt('T1', 'TAUBATE', 'JARDIM ANA', [13, 9], [14, 9], '03- VAL - INSTALACAO F36')
  const comRevisita = [...rows, ...enrichRows([retorno])]
  const origem = rows[0]

  it('VTs por cidade, com variação e o bairro que puxou (grafias unidas)', () => {
    const l = buildLeituraMensal(rows, [SET, AGO])
    const tbt = l.cidades.find(c => c.key === 'TAUBATE')!
    expect([tbt.vt.atual, tbt.vt.anterior, tbt.vt.delta, tbt.vt.pct]).toEqual([25, 22, 3, 13.6])
    expect(tbt.vt.porBairro[0]).toMatchObject({ label: 'JARDIM ANA', atual: 3, anterior: 0, delta: 3 })
    const pnd = l.cidades.find(c => c.key === 'PINDAMONHANGABA')!
    expect([pnd.vt.atual, pnd.vt.anterior, pnd.vt.delta]).toEqual([1, 3, -2])
  })

  it('o geral soma as cidades', () => {
    const l = buildLeituraMensal(rows, [SET, AGO])
    expect(l.geral.vt.atual).toBe(26)
    expect(l.geral.vt.anterior).toBe(25)
  })

  it('frases dizem quanto e de onde veio', () => {
    const tbt = buildLeituraMensal(rows, [SET, AGO]).cidades.find(c => c.key === 'TAUBATE')!
    expect(tbt.frases.vt[0]).toEqual({ tom: 'piora', texto: expect.stringContaining('25 VTs abertas, +3') })
    expect(tbt.frases.vt[0].texto).toContain('contra AGO/26')
    expect(tbt.frases.vt.some(f => f.texto.includes('JARDIM ANA +3'))).toBe(true)
    const pnd = buildLeituraMensal(rows, [SET, AGO]).cidades.find(c => c.key === 'PINDAMONHANGABA')!
    // 1 contra 3 VTs: pouco volume para chamar de melhora.
    expect(pnd.frases.vt[0].tom).toBe('neutro')
  })

  it('revisita de manutenção: taxa, equipe de origem, ação na origem e motivo do retorno', () => {
    const motivos = {
      [origem.numos]: { motivo: 'Sem sinal / LOS', acao: 'Reconfiguração' },
      [retorno.numos]: { motivo: 'Queda / intermitência', acao: 'Troca de conector' },
    }
    const tbt = buildLeituraMensal(comRevisita, [SET, AGO], motivos).cidades.find(c => c.key === 'TAUBATE')!
    expect(tbt.manut.reincAtual).toBe(1)
    expect(tbt.manut.baseAtual).toBe(25)
    expect(tbt.manut.taxaAtual).toBe(4)
    expect(tbt.manut.porEquipe[0]).toMatchObject({ label: 'INST F11', atual: 1 })
    expect(tbt.manut.porAcaoOrigem[0]).toMatchObject({ label: 'Reconfiguração', atual: 1 })
    expect(tbt.manut.porMotivoRetorno[0]).toMatchObject({ label: 'Queda / intermitência', atual: 1 })
    expect(tbt.frases.manut[0].texto).toContain('1 cliente reincidente de 25 atendidos')
  })

  it('base pequena avisa e não conta como piora', () => {
    const tbt = buildLeituraMensal(comRevisita, [SET, AGO]).cidades.find(c => c.key === 'TAUBATE')!
    expect(tbt.frases.manut[0].tom).toBe('neutro')
    expect(tbt.frases.manut[1].texto).toContain('Base pequena (25 clientes atendidos)')
  })

  it('o motivo da VT entra quando o texto foi lido', () => {
    const motivos = Object.fromEntries(vtsAbertas(rows, SET).filter(r => r.nomedacidade === 'TAUBATE').map(r => [r.numos, { motivo: 'Sem sinal / LOS', acao: '' }]))
    const tbt = buildLeituraMensal(rows, [SET, AGO], motivos).cidades.find(c => c.key === 'TAUBATE')!
    expect(tbt.vt.porMotivo[0]).toMatchObject({ label: 'Sem sinal / LOS', atual: 25, anterior: 0 })
    expect(tbt.frases.vt.some(f => f.texto.startsWith('Por motivo de abertura: Sem sinal / LOS +25'))).toBe(true)
  })

  it('separa o efeito do volume do efeito da taxa', () => {
    // Agosto: 40 atendidos, 4 reincidentes (10%). Setembro: 80 atendidos, 16 reincidentes (20%).
    // Do +12, +4 vêm de atender o dobro (40 × 10%) e +8 da taxa ter subido.
    const lote: OSRow[] = []
    for (let i = 0; i < 40; i++) lote.push(vt(`A${i}`, 'CACAPAVA', 'CENTRO', [2, 8], [3, 8]))
    for (let i = 0; i < 4; i++) lote.push(vt(`A${i}`, 'CACAPAVA', 'CENTRO', [10, 8], [11, 8]))
    for (let i = 0; i < 80; i++) lote.push(vt(`S${i}`, 'CACAPAVA', 'CENTRO', [2, 9], [3, 9]))
    for (let i = 0; i < 16; i++) lote.push(vt(`S${i}`, 'CACAPAVA', 'CENTRO', [10, 9], [11, 9]))
    const cpv = buildLeituraMensal(enrichRows(lote), [SET, AGO]).cidades.find(c => c.key === 'CACAPAVA')!
    expect([cpv.manut.reincAnterior, cpv.manut.baseAnterior, cpv.manut.reincAtual, cpv.manut.baseAtual]).toEqual([4, 40, 16, 80])
    expect([cpv.manut.efeitoBase, cpv.manut.efeitoTaxa]).toEqual([4, 8])
    expect(cpv.frases.manut).toContainEqual({ tom: 'neutro', texto: 'Reincidentes +12 contra AGO/26: +4 pelo volume de atendidos (maior) e +8 pela taxa.' })
    expect(cpv.saldo).toBe('piora')
    expect(cpv.porqueSaldo).toBe('Pioraram: VTs abertas (+118,2%), revisita de manutenção (+10,0 pp).')
  })

  it('tendência vai do mês mais antigo ao mais recente', () => {
    const tbt = buildLeituraMensal(rows, [SET, AGO]).cidades.find(c => c.key === 'TAUBATE')!
    expect(tbt.tendencia.map(t => [t.label, t.vts])).toEqual([['AGO/26', 22], ['SET/26', 25]])
  })

  it('mudança pequena é estável e não vira explicação', () => {
    const iguais = enrichRows([
      ...Array.from({ length: 20 }, (_, i) => vt(`X${i}`, 'TREMEMBE', 'CENTRO', [2, 8], [3, 8])),
      ...Array.from({ length: 20 }, (_, i) => vt(`Y${i}`, 'TREMEMBE', 'CENTRO', [2, 9], [3, 9])),
    ])
    const tre = buildLeituraMensal(iguais, [SET, AGO]).cidades.find(c => c.key === 'TREMEMBE')!
    expect(tre.frases.vt[0]).toEqual({ tom: 'neutro', texto: '20 VTs abertas, o mesmo número de AGO/26.' })
    expect(tre.frases.vt.some(f => f.texto.startsWith('A alta') || f.texto.startsWith('A queda'))).toBe(false)
    expect(tre.saldo).toBe('neutro')
    expect(tre.porqueSaldo).toMatch(/^Sem mudança relevante: VTs abertas \(0,0%\)/)
  })

  it('osParaLer junta as VTs e as OS das revisitas dos meses', () => {
    const numos = osParaLer(comRevisita, [SET, AGO])
    expect(numos).toEqual(expect.arrayContaining([origem.numos, retorno.numos]))
    expect(new Set(numos).size).toBe(numos.length)
  })
})
