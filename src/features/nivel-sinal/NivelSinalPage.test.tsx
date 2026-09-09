import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NivelSinalPage from './NivelSinalPage'

describe('NivelSinalPage', () => {
  beforeEach(() => {
    vi.stubGlobal('CompressionStream', undefined)
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      let rawBody = options?.body ? String(options.body) : ''
      if (url.endsWith('/sync/chunk') && options?.body instanceof Blob) {
        rawBody = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result ?? ''))
          reader.onerror = () => reject(reader.error)
          reader.readAsText(options.body as Blob)
        })
      }
      const body = rawBody ? JSON.parse(rawBody) : null
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ ok: true, items: body?.occurrences ?? (body?.id ? [body] : []), import_id: 1 }) } as Response
    }))
  })

  it('mantém a análise como aba principal e abre o controle de ocorrências', () => {
    render(<NivelSinalPage />)

    expect(screen.getByRole('tab', { name: 'Análise de sinal' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Carregue o relatório de sinais das ONUs')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Controle de ocorrências' }))

    expect(screen.getByRole('tab', { name: 'Controle de ocorrências' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Controle de Ocorrências de Sinal' })).toBeInTheDocument()
    expect(screen.getByText(/criadas automaticamente a partir do CSV/i)).toBeInTheDocument()
  })

  it('começa sem ocorrências e cria uma ocorrência automaticamente pelo CSV', async () => {
    const { container } = render(<NivelSinalPage />)
    fireEvent.click(screen.getByRole('tab', { name: 'Controle de ocorrências' }))
    expect(screen.getByText('Nenhuma ocorrência registrada.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Análise de sinal' }))
    const csv = `Cidade;Bairro;OLT;Slot;PON;ONU ID;Cliente;Código;Serial;Status;Classificação;RX dBm
Taubaté;Centro;OLT TBT;1;1/2;7;Cliente Teste;12345;ABC123;Online;Crítico;-29,5`
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File([csv], 'sinais.csv', { type: 'text/csv' })] } })

    fireEvent.click(screen.getByRole('tab', { name: 'Controle de ocorrências' }))
    expect(await screen.findByText('Cliente Teste')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /registrar tratativa de cliente teste/i }))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'Concluído' } })
    fireEvent.change(screen.getByLabelText('Tratativa realizada'), { target: { value: 'Conector substituído' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar tratativa' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Salvar tratativa' })).not.toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: 'Concluído' } })
    expect(screen.getByText('Cliente Teste')).toBeInTheDocument()
  })

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
    expect(screen.getByText('1 crítico · 0 atenção')).toBeInTheDocument()
    expect(screen.getByText('RX ≤ −27 dBm · 100.0%')).toBeInTheDocument()
    expect(screen.getByText('RX entre −27 e −25 dBm · 0.0%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /apoio à decisão/i })).toBeInTheDocument()
  })

  it('tira a PON da pendência ao marcar como tratada e a lista na aba PONs tratadas', async () => {
    const treatments: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      let raw = options?.body ? String(options.body) : ''
      if (options?.body instanceof Blob) {
        raw = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result ?? ''))
          reader.onerror = () => reject(reader.error)
          reader.readAsText(options.body as Blob)
        })
      }
      const body = raw ? JSON.parse(raw) : null
      if (url.includes('/pon/tratar')) {
        treatments.push({
          pon_key: body.pon_key, action: 'tratada', snapshot: body.snapshot,
          created_at: '2026-09-08 09:30:00', created_by: 'sergio', treated_count: 1, reopened_count: 0,
        })
      }
      // Copia: devolver a mesma referencia faria o React bailar do re-render
      // e o teste passaria a medir o mock, nao a tela.
      const items = url.includes('/pon') ? [...treatments] : (body?.occurrences ?? [])
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ ok: true, items, import_id: 1 }) } as Response
    }))

    const { container } = render(<NivelSinalPage />)
    const header = 'Cidade;Bairro;OLT;Tipo;Slot;PON;ONU ID;Cliente;Situação;Status;Classificação;RX dBm;Modelo'
    const linhas = Array.from({ length: 4 }, (_, index) =>
      `Taubaté;Centro;OLT TBT;Huawei;1;1/2;${index};Cliente ${index};Conectado;Online;Crítico;-31,5;HG8145`)
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File([[header, ...linhas].join('\n')], 'sinais.csv', { type: 'text/csv' })] },
    })

    const tratar = await screen.findByRole('button', { name: 'Marcar PON 1/2 da OLT TBT como tratada' })
    fireEvent.click(tratar)

    await waitFor(() => expect(screen.getByText(/Nenhuma PON pendente atinge/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('tab', { name: 'PONs tratadas (1)' }))

    expect(screen.getByRole('heading', { name: 'PONs tratadas' })).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    // O CSV carregado ainda acusa a PON: a tratativa sai da fila mas fica sinalizada.
    expect(screen.getByText('Ainda crítica · 4 críticas', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reabrir PON 1/2 da OLT TBT' })).toBeInTheDocument()
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
