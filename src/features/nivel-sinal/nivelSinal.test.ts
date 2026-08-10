import { describe, expect, it } from 'vitest'
import { parseSignalCsv, signalSummary } from './nivelSinal'

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
})
