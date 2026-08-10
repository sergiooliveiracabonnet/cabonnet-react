import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import NivelSinalPage from './NivelSinalPage'

describe('NivelSinalPage', () => {
  it('usa a estrutura nativa do projeto sem documento incorporado', () => {
    render(<NivelSinalPage />)
    expect(screen.getByRole('heading', { name: 'Nível de Sinal' })).toBeInTheDocument()
    expect(screen.getByText('Carregue o relatório de sinais das ONUs')).toBeInTheDocument()
    expect(screen.queryByTitle(/console óptico/i)).not.toBeInTheDocument()
  })

  it('exibe todos os blocos analíticos após importar o CSV', async () => {
    const { container } = render(<NivelSinalPage />)
    const csv = `Cidade;Bairro;OLT;Tipo;Slot;PON;ONU ID;Cliente;Situação;Status;Classificação;RX dBm;Modelo\nTaubaté;Centro;OLT TBT;Huawei;1;1/2;7;Cliente A;Conectado;Online;Crítico;-31,5;HG8145`
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File([csv], 'sinais.csv', { type: 'text/csv' })] } })

    expect(await screen.findByText('Distribuição de potência RX')).toBeInTheDocument()
    expect(screen.getByText('Ranking de OLTs')).toBeInTheDocument()
    expect(screen.getByText('Distribuição por cidade')).toBeInTheDocument()
    expect(screen.getByText('Hotspots de PON — prioridade de campo')).toBeInTheDocument()
    expect(screen.getByText('Bairros mais afetados')).toBeInTheDocument()
    expect(screen.getByText('Modelos de ONU')).toBeInTheDocument()
    expect(screen.getByText('Detalhamento das ONUs')).toBeInTheDocument()
  })
})
