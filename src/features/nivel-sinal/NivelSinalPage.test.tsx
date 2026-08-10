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
    expect(screen.getByText('Crítico + Atenção no filtro')).toBeInTheDocument()
    expect(screen.getByText('Classificação “Crítico” no CSV · 100.0%')).toBeInTheDocument()
    expect(screen.getByText('Classificação “Atenção” no CSV · 0.0%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /apoio à decisão/i })).toBeInTheDocument()
  })

  it('pagina os hotspots em uma matriz de doze PONs', async () => {
    const { container } = render(<NivelSinalPage />)
    const header = 'Cidade;Bairro;OLT;Tipo;Slot;PON;ONU ID;Cliente;Situação;Status;Classificação;RX dBm;Modelo'
    const data = Array.from({ length: 13 }, (_, ponIndex) =>
      Array.from({ length: 4 }, (_, onuIndex) =>
        `Taubaté;Centro;OLT TBT;Huawei;1;1/${ponIndex + 1};${onuIndex};Cliente;Conectado;Online;Crítico;-31,5;HG8145`,
      ).join('\n'),
    ).join('\n')
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [new File([`${header}\n${data}`], 'sinais.csv', { type: 'text/csv' })] } })

    expect(await screen.findByText('Página 1 de 2')).toBeInTheDocument()
    expect(screen.getByText('1–12 de 13 PONs')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página de hotspots' }))
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument()
    expect(screen.getByText('13–13 de 13 PONs')).toBeInTheDocument()
  })
})
