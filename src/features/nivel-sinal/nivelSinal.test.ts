import { describe, expect, it } from 'vitest'
import { buildAIContext, buildHistogram, buildHotspots, filterSignals, groupBySeverity, parseSignalCsv, signalSummary, sortSignals, type SignalSeverity } from './nivelSinal'

const csv = `Cidade;Bairro;OLT;Tipo;Slot;PON;ONU ID;Cliente;Situação;Status;Classificação;RX dBm;Serial
Taubaté;Centro;OLT Taubaté;Huawei;1;1/2;7;Cliente A;Conectado;Online;Crítico;-31,5;ABC
Caçapava;Vera Cruz;OLT Caçapava;FiberHome;2;0/1;8;Cliente B;Conectado;Offline;Atenção;-27;DEF
Jacareí;Centro;OLT Jacareí;Huawei;1;1/1;9;Fora do escopo;Conectado;Online;Normal;-20;GHI`

describe('parseSignalCsv', () => {
  it('interpreta CSV com ponto e vírgula, vírgula decimal e limita às cinco cidades', () => {
    const rows = parseSignalCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ cidade: 'Taubaté', rx: -31.5, classificacao: 'Crítico' })
  })

  it('resume severidade, indisponibilidade e PONs', () => {
    expect(signalSummary(parseSignalCsv(csv))).toEqual({ total: 2, criticos: 1, atencao: 1, offline: 1, pons: 2 })
  })

  it('calcula hotspots com o mesmo critério do relatório original', () => {
    const base = parseSignalCsv(csv)[0]
    const rows = Array.from({ length: 10 }, (_, index) => ({
      ...base, onu: String(index), classificacao: (index < 8 ? 'Crítico' : 'Atenção') as SignalSeverity,
    }))
    expect(buildHotspots(rows)[0]).toMatchObject({ criticos: 8, total: 10, concentracao: 0.8, nivel: 'alto' })
  })

  it('prioriza hotspots pela maior quantidade absoluta de casos críticos', () => {
    const base = parseSignalCsv(csv)[0]
    const maiorVolume = Array.from({ length: 30 }, (_, index) => ({
      ...base, pon: '1/1', onu: `volume-${index}`,
      classificacao: (index < 10 ? 'Crítico' : 'Atenção') as SignalSeverity,
    }))
    const maiorConcentracao = Array.from({ length: 8 }, (_, index) => ({
      ...base, pon: '1/2', onu: `concentracao-${index}`, classificacao: 'Crítico' as SignalSeverity,
    }))

    expect(buildHotspots([...maiorConcentracao, ...maiorVolume]).map(item => item.pon)).toEqual(['1/1', '1/2'])
  })

  it('gera histograma de 0,5 dBm e agrupamentos por severidade', () => {
    const rows = parseSignalCsv(csv)
    expect(buildHistogram(rows).reduce((sum, bin) => sum + bin.total, 0)).toBe(2)
    expect(groupBySeverity(rows, row => row.cidade)[0]).toMatchObject({ total: 1, criticos: 1 })
  })

  it('combina filtros de severidade, offline e busca e ordena numericamente', () => {
    const rows = parseSignalCsv(csv)
    const filtered = filterSignals(rows, { query: 'cliente b', severities: ['Atenção'], offline: true })
    expect(filtered).toHaveLength(1)
    expect(sortSignals(rows, 'rx', 'asc').map(row => row.rx)).toEqual([-31.5, -27])
  })

  it('infere bairro pela PON e interpreta distância com separador de milhar', () => {
    const input = `Cidade;Bairro;OLT;Slot;PON;ONU ID;Cliente;RX dBm;Distância\nTaubaté;Centro;OLT TBT;1;1/2;1;Cliente A;-31;9.216\nTaubaté;;OLT TBT;1;1/2;2;Cliente B;-30;2.499`
    const rows = parseSignalCsv(input)
    expect(rows[1].bairro).toBe('Centro')
    expect(rows.map(row => row.distancia)).toEqual([9216, 2499])
  })

  it('importa o relatório geral com resumo antes do cabeçalho e mantém apenas alertas RX', () => {
    const report = `"Relatório Geral de ONUs"
"Gerado em";"10/08/2026, 16:26:12"
"Total de ONUs";"3"

"Detalhes das ONUs"
"Cidade";"OLT";"Tipo";"PON";"Setor/Bairro";"ONU ID";"Status";"Cliente ONU";"RX dBm";"Distância m";"Alerta RX"
"Taubate";"OLT Belém 2";"FiberHome";"3/10";"BORDA DA MATA";"1";"Online";"Cliente 1";"-27,20";"2.499";"Sim"
"Taubate";"OLT Belém 2";"FiberHome";"3/10";"BORDA DA MATA";"2";"Online";"Cliente 2";"-25,08";"1.381";"Sim"
"Taubate";"OLT Belém 2";"FiberHome";"3/10";"BORDA DA MATA";"3";"Online";"Cliente 3";"-20,00";"1.000";"Não"`

    const rows = parseSignalCsv(report)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ bairro: 'BORDA DA MATA', slot: '3', pon: '3/10', distancia: 2499, classificacao: 'Crítico' })
    expect(rows[1]).toMatchObject({ distancia: 1381, classificacao: 'Atenção' })
  })

  it('monta contexto agregado para IA sem dados pessoais ou identificadores', () => {
    const context = buildAIContext(parseSignalCsv(csv), { cidade: 'Taubaté' })
    const serialized = JSON.stringify(context)
    expect(context.resumo.total).toBe(2)
    expect(serialized).not.toContain('Cliente A')
    expect(serialized).not.toContain('ABC')
    expect(serialized).not.toContain('pppoe')
    expect(context.por_cidade).toContainEqual(expect.objectContaining({ nome: 'Caçapava', total: 1 }))
  })
})
