import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { useState } from 'react'
import { MultiSelect } from './MultiSelect'

afterEach(cleanup)

const opcoes = [
  { value: 'CACAPAVA', label: 'Caçapava' },
  { value: 'PINDAMONHANGABA', label: 'Pindamonhangaba' },
  { value: 'TAUBATE', label: 'Taubaté' },
]

function Controlado({ inicial = [], onChange }: { inicial?: string[]; onChange?: (v: string[]) => void }) {
  const [v, setV] = useState<string[]>(inicial)
  return <MultiSelect label="Cidade" options={opcoes} value={v} onChange={x => { setV(x); onChange?.(x) }} allLabel="Todas as cidades" pluralLabel="cidades" />
}

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Cidade/ }))

describe('MultiSelect', () => {
  it('sem nada marcado mostra o texto de "todas"', () => {
    render(<Controlado />)
    expect(screen.getByRole('button', { name: /Cidade/ }).textContent).toContain('Todas as cidades')
  })

  it('abre a lista e marca várias opções', () => {
    const onChange = vi.fn()
    render(<Controlado onChange={onChange} />)
    abrir()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Taubaté' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Caçapava' }))
    expect(onChange).toHaveBeenLastCalledWith(['TAUBATE', 'CACAPAVA'])
    expect(screen.getByRole('button', { name: /Cidade/ }).textContent).toContain('2 cidades')
  })

  it('uma opção marcada mostra o nome dela', () => {
    render(<Controlado inicial={['PINDAMONHANGABA']} />)
    expect(screen.getByRole('button', { name: /Cidade/ }).textContent).toContain('Pindamonhangaba')
  })

  it('desmarcar tira da seleção', () => {
    const onChange = vi.fn()
    render(<Controlado inicial={['TAUBATE', 'CACAPAVA']} onChange={onChange} />)
    abrir()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Taubaté' }))
    expect(onChange).toHaveBeenLastCalledWith(['CACAPAVA'])
  })

  it('"Selecionar todas" marca tudo e "Limpar" volta a nenhum filtro', () => {
    const onChange = vi.fn()
    render(<Controlado onChange={onChange} />)
    abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar todas' }))
    expect(onChange).toHaveBeenLastCalledWith(['CACAPAVA', 'PINDAMONHANGABA', 'TAUBATE'])
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('fecha com Esc e com clique fora', () => {
    render(<div><Controlado /><p>fora</p></div>)
    abrir()
    expect(screen.getByRole('group', { name: 'Cidade' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Cidade' })).toBeNull()
    abrir()
    fireEvent.mouseDown(screen.getByText('fora'))
    expect(screen.queryByRole('group', { name: 'Cidade' })).toBeNull()
  })

  it('aria-expanded acompanha a abertura', () => {
    render(<Controlado />)
    const botao = screen.getByRole('button', { name: /Cidade/ })
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(botao)
    expect(botao.getAttribute('aria-expanded')).toBe('true')
    expect(within(screen.getByRole('group', { name: 'Cidade' })).getAllByRole('checkbox')).toHaveLength(3)
  })

  it('sem opções avisa em vez de abrir uma lista vazia', () => {
    render(<MultiSelect label="Cidade" options={[]} value={[]} onChange={() => {}} allLabel="Todas as cidades" />)
    fireEvent.click(screen.getByRole('button', { name: /Cidade/ }))
    expect(screen.getByText('Nenhuma opção.')).toBeTruthy()
  })
})
