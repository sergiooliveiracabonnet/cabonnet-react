import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { DataTable } from './DataTable'

// Projeto não usa `test.globals` — RTL não desmonta entre testes sem afterEach explícito.
afterEach(cleanup)

const columns = [
  { key: 'nome', label: 'Nome' },
  { key: 'qtd',  label: 'Qtd', align: 'right' as const },
]
const rows = [
  { _id: 1, nome: 'Bravo', qtd: 2 },
  { _id: 2, nome: 'Alfa',  qtd: 9 },
]

describe('DataTable — sort acessível', () => {
  it('header ordenável é um botão', () => {
    render(<DataTable columns={columns} rows={rows} />)
    expect(screen.getByRole('button', { name: 'Nome' })).toBeInTheDocument()
  })
  it('clicar ordena e expõe aria-sort', () => {
    render(<DataTable columns={columns} rows={rows} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nome' }))
    const th = screen.getByRole('button', { name: 'Nome' }).closest('th')!
    expect(th).toHaveAttribute('aria-sort', 'ascending')
    const primeiraLinha = screen.getAllByRole('row')[1]
    expect(within(primeiraLinha).getByText('Alfa')).toBeInTheDocument()
  })
})

describe('DataTable — densidade padrão', () => {
  // Compacto é o padrão do sistema: a operação lê listas longas de OS e cada
  // linha a mais na tela evita um scroll. Quem quiser folga passa a prop.
  it('sem a prop density as linhas saem compactas', () => {
    render(<DataTable columns={columns} rows={rows} />)
    const primeiraCelula = screen.getAllByRole('row')[1].querySelector('td')!
    expect(primeiraCelula.className).toContain('h-7')
  })

  it('a prop density continua vencendo o padrão', () => {
    render(<DataTable columns={columns} rows={rows} density="normal" />)
    const primeiraCelula = screen.getAllByRole('row')[1].querySelector('td')!
    expect(primeiraCelula.className).toContain('h-9')
  })
})

describe('DataTable — virtualização', () => {
  const originalInnerHeight = window.innerHeight
  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
  })

  it('virtualiza listas grandes (renderiza menos linhas que o total)', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const muitas = Array.from({ length: 500 }, (_, i) => ({ _id: i, nome: `Item ${i}`, qtd: i }))
    render(<DataTable columns={columns} rows={muitas} />)
    const bodyRows = screen.getAllByRole('row').length - 1 // menos o header
    expect(bodyRows).toBeLessThan(200)
  })

  it('não virtualiza listas pequenas', () => {
    render(<DataTable columns={columns} rows={rows} />)
    expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1)
  })
})

describe('DataTable — estado vazio', () => {
  it('exibe título padrão do EmptyState quando rows está vazio', () => {
    render(<DataTable columns={columns} rows={[]} />)
    expect(screen.getByText('Nenhum resultado encontrado')).toBeInTheDocument()
  })

  it('exibe título e descrição customizados quando informados', () => {
    render(<DataTable columns={columns} rows={[]} emptyTitle="Sem OS" emptyDescription="Ajuste os filtros" />)
    expect(screen.getByText('Sem OS')).toBeInTheDocument()
    expect(screen.getByText('Ajuste os filtros')).toBeInTheDocument()
    expect(screen.queryByText('Nenhum resultado encontrado')).not.toBeInTheDocument()
  })
})

describe('DataTable — abertura acessível da linha', () => {
  it('permite abrir uma linha clicável com Enter e Espaço', () => {
    const opened: string[] = []
    render(<DataTable columns={columns} rows={rows} onRowClick={row => opened.push(row.nome)} />)
    const firstDataRow = screen.getAllByRole('button', { name: /abrir detalhes/i })[0]

    fireEvent.keyDown(firstDataRow, { key: 'Enter' })
    fireEvent.keyDown(firstDataRow, { key: ' ' })

    expect(opened).toEqual(['Bravo', 'Bravo'])
  })
})
