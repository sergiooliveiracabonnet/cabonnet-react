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

describe('DataTable — virtualização', () => {
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
