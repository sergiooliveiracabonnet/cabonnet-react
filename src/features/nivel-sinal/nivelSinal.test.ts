import { describe, expect, it } from 'vitest'
import { buildHistogram, buildHotspots, filterSignals, groupBySeverity, parseSignalCsv, signalSummary, sortSignals, type SignalSeverity } from './nivelSinal'

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
})
