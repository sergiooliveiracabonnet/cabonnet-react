import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { StatCard, accentToTone } from './StatCard'
import { TrendingUp } from 'lucide-react'

// Este projeto não usa `test.globals` no vite.config.js, então o RTL não
// detecta `afterEach` global e não desmonta entre testes — sem isso, testes
// que repetem o mesmo texto (ex: value=7 em dois testes) colidem com
// "Found multiple elements". Limpeza explícita corrige o isolamento sem
// enfraquecer nenhuma asserção.
afterEach(cleanup)

describe('accentToTone', () => {
  it('mapeia accents de status', () => {
    expect(accentToTone('red')).toBe('critical')
    expect(accentToTone('orange')).toBe('warning')
    expect(accentToTone('yellow')).toBe('warning')
    expect(accentToTone('green')).toBe('ok')
  })
  it('neutraliza accents decorativos', () => {
    for (const a of ['primary', 'cyan', 'teal', 'purple', 'secondary', 'muted', undefined])
      expect(accentToTone(a)).toBe('neutral')
  })
})

describe('StatCard', () => {
  it('renderiza título, valor e sub', () => {
    render(<StatCard title="Total OS" value={42} sub="no período" />)
    expect(screen.getByText('Total OS')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('no período')).toBeInTheDocument()
  })

  it('renderiza ícone quando fornecido', () => {
    const { container } = render(<StatCard title="KPI" value={1} icon={TrendingUp} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('sem onClick não tem role de botão', () => {
    render(<StatCard title="KPI" value={1} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('com onClick é um botão acessível por teclado', () => {
    const onClick = vi.fn()
    render(<StatCard title="KPI" value={5} onClick={onClick} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('tabindex', '0')
    fireEvent.click(btn)
    fireEvent.keyDown(btn, { key: 'Enter' })
    fireEvent.keyDown(btn, { key: ' ' })
    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('renderiza badge de escopo', () => {
    render(<StatCard title="KPI" value={1} scope="aovivo" />)
    expect(screen.getByText(/Ao vivo/i)).toBeInTheDocument()
  })

  it('renderiza trend em pct', () => {
    render(<StatCard title="KPI" value={10} trend={{ delta: 3, pct: 30 }} />)
    expect(screen.getByText(/30%/)).toBeInTheDocument()
  })

  it('tone critical coloriza o valor', () => {
    render(<StatCard title="KPI" value={7} tone="critical" />)
    expect(screen.getByText('7')).toHaveStyle({ color: 'rgb(var(--c-red))' })
  })

  it('tone neutral não coloriza o valor', () => {
    render(<StatCard title="KPI" value={7} />)
    expect(screen.getByText('7')).toHaveStyle({ color: 'rgb(var(--c-text))' })
  })

  it('size inline renderiza par label/valor', () => {
    render(<StatCard title="Críticas" value={3} size="inline" />)
    // getByText exato falha pq o label é "Críticas" + ":" como nós de texto
    // adjacentes no mesmo <span> — o texto normalizado do nó é "Críticas:".
    expect(screen.getByText(/Críticas/)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('size inline clicável recebe cursor e anel de foco', () => {
    const { container } = render(<StatCard title="Críticas" value={3} size="inline" onClick={() => {}} />)
    expect(container.firstChild).toHaveClass('cursor-pointer')
  })

  it('size sm renderiza tile compacto', () => {
    render(<StatCard title="Total" value={99} size="sm" />)
    expect(screen.getByText('99')).toBeInTheDocument()
  })

  it('aceita className adicional', () => {
    const { container } = render(<StatCard title="KPI" value={1} className="minha-classe" />)
    expect(container.firstChild).toHaveClass('minha-classe')
  })
})
