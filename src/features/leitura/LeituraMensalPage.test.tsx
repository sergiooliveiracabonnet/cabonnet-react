import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { enrichRows } from '../../lib/transform'
import type { OSRow } from '../../lib/types'
import { buildLeituraMensal, type Periodo } from './leituraMensal'
import { LeituraMensalView } from './LeituraMensalPage'

afterEach(cleanup)

const SET: Periodo = { id: '2026-09', label: 'SET/26', from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) }
const AGO: Periodo = { id: '2026-08', label: 'AGO/26', from: new Date(2026, 7, 1), to: new Date(2026, 7, 31) }

let seq = 0
function vt(cliente: string, bairro: string, mes: number): OSRow {
  seq++
  const d = `0${2 + (seq % 7)}/${String(mes).padStart(2, '0')}/2026`
  return {
    numos: String(9200000 + seq), nomecliente: cliente, codigocliente: cliente,
    nomedacidade: 'CACAPAVA', bairro, nomedaequipe: '03- VAL - INSTALACAO F01', tiposervico: 'MANUTENCAO', servico: 'ASSISTENCIA - VT 24H',
    descsituacao: 'Concluída', datacadastro: `${d} 09:00`, dataagendamento: d, dataexecucao: `${d} 15:00`, databaixa: d,
  } as unknown as OSRow
}

// Borda da Mata: 19 VTs em agosto, 4 em setembro — caiu.
const rows = enrichRows([
  ...Array.from({ length: 19 }, (_, i) => vt(`A${i}`, 'BORDA DA MATA', 8)),
  ...Array.from({ length: 4 }, (_, i) => vt(`B${i}`, 'BORDA DA MATA', 9)),
  ...Array.from({ length: 20 }, (_, i) => vt(`C${i}`, 'CENTRO', 8)),
  ...Array.from({ length: 20 }, (_, i) => vt(`D${i}`, 'CENTRO', 9)),
])
const leitura = buildLeituraMensal(rows, [SET, AGO])

describe('LeituraMensalView', () => {
  it('lista de bairros em ordem do tempo: mês anterior, mês analisado, variação', () => {
    render(<LeituraMensalView leitura={leitura} carregando={false} lendo={false} erroMotivos={false} mesId="2026-09" onMes={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'CACAPAVA' }))
    const detalhe = screen.getByRole('region', { name: 'Leitura de CACAPAVA' })
    const tabela = within(detalhe).getAllByRole('table').find(t => within(t).queryByText('Por bairro'))!
    expect(within(tabela).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Por bairro', 'AGO/26', 'SET/26', 'Var.'])
    const linha = within(tabela).getByText('BORDA DA MATA').closest('tr')!
    expect([...linha.querySelectorAll('td')].map(td => td.textContent)).toEqual(['BORDA DA MATA', '19', '4', '−15'])
  })

  it('o selo vem com o porquê', () => {
    render(<LeituraMensalView leitura={leitura} carregando={false} lendo={false} erroMotivos={false} mesId="2026-09" onMes={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'CACAPAVA' }))
    const cpv = leitura.cidades.find(c => c.key === 'CACAPAVA')!
    const detalhe = screen.getByRole('region', { name: 'Leitura de CACAPAVA' })
    expect(within(detalhe).getByText(cpv.porqueSaldo)).toBeTruthy()
    expect(cpv.porqueSaldo).toMatch(/^Melhorou: VTs abertas \(−/)
  })
})
