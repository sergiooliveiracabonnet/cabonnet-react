import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { CoortePanel, type CoorteLinhaView } from './CoortePanel'

afterEach(cleanup)

const BUCKETS = [1, 2, 3, 7]

function linha(o: Partial<CoorteLinhaView> = {}): CoorteLinhaView {
  return {
    chave: 1, label: '13/07', total: 389, resolvidas: 350,
    pct: [41, 65, 79, 91], pctNoPrazo: 72,
    ...o,
  }
}

describe('CoortePanel', () => {
  it('renderiza uma coluna por bucket mais a coluna contratual', () => {
    render(<CoortePanel buckets={BUCKETS} linhas={[linha()]} />)
    for (const d of BUCKETS) {
      expect(screen.getByText(`D+${d}`)).toBeInTheDocument()
    }
    expect(screen.getByText('No prazo')).toBeInTheDocument()
  })

  it('mostra os percentuais da safra e o total de OS', () => {
    render(<CoortePanel buckets={BUCKETS} linhas={[linha()]} />)
    expect(screen.getByText('13/07')).toBeInTheDocument()
    expect(screen.getByText('389')).toBeInTheDocument()
    expect(screen.getByText('41%')).toBeInTheDocument()
    expect(screen.getByText('91%')).toBeInTheDocument()
    expect(screen.getByText('72%')).toBeInTheDocument()
  })

  // Célula vazia é informação, não bug: a safra não tem idade para responder.
  it('deixa a célula vazia quando o bucket é null, sem escrever "null" na tela', () => {
    const { container } = render(
      <CoortePanel buckets={BUCKETS} linhas={[linha({ pct: [38, 61, null, null], pctNoPrazo: null })]} />
    )
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument()
    expect(screen.queryByText('NaN%')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.border-dashed')).toHaveLength(3)
  })

  it('explica na dica por que a célula está vazia', () => {
    render(<CoortePanel buckets={BUCKETS} linhas={[linha({ pct: [38, null, null, null], pctNoPrazo: null })]} />)
    expect(screen.getByTitle('Safra ainda não tem 2 dia(s) de idade')).toBeInTheDocument()
    expect(screen.getByTitle('Safra ainda não venceu o maior SLA dela')).toBeInTheDocument()
  })

  it('lista várias safras, uma linha cada', () => {
    render(<CoortePanel buckets={BUCKETS} linhas={[
      linha({ chave: 3, label: '27/07' }),
      linha({ chave: 2, label: '20/07' }),
      linha({ chave: 1, label: '13/07' }),
    ]} />)
    const tabela = screen.getByRole('table')
    expect(within(tabela).getAllByRole('row')).toHaveLength(4) // cabeçalho + 3
    expect(screen.getByText('3 semanas')).toBeInTheDocument()
  })

  it('mostra estado vazio sem quebrar quando não há safras', () => {
    render(<CoortePanel buckets={BUCKETS} linhas={[]} />)
    expect(screen.getByText(/Sem safras suficientes/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
