import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { StatCard, accentToTone } from './StatCard'
import { TrendUp } from '@phosphor-icons/react'
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
    const { container } = render(<StatCard title="Total OS" value={42} sub="no período" />)
    expect(screen.getByText('Total OS')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('no período')).toBeInTheDocument()
    expect(container.firstChild).toHaveAttribute('data-ui', 'stat-card')
    expect(container.firstChild).toHaveClass('min-h-[112px]')
    expect(container.firstChild).toHaveClass('bg-surface-2')
  })

  it('renderiza ícone quando fornecido', () => {
    const { container } = render(<StatCard title="KPI" value={1} icon={TrendUp} />)
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

  it('tone não colore mais o valor diretamente (vira badge)', () => {
    render(<StatCard title="KPI" value={7} tone="critical" />)
    expect(screen.getByText('7')).not.toHaveStyle({ color: 'rgb(var(--red))' })
  })

  it('tone neutral não adiciona estilo de cor ao valor', () => {
    render(<StatCard title="KPI" value={7} />)
    expect(screen.getByText('7')).not.toHaveAttribute('style')
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
    const { container } = render(<StatCard title="Total" value={99} size="sm" />)
    expect(screen.getByText('99')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('min-h-[104px]')
  })

  it('size sm outlined mantém superfície e borda visíveis', () => {
    const { container } = render(<StatCard title="Fila Total" value={42} size="sm" outlined />)
    expect(container.firstChild).toHaveClass(
      'border',
      'border-border',
      'bg-card',
      'transition-colors',
      'hover:border-primary/30',
    )
  })

  it('colore o card pela posicao no grid', () => {
    const { container: c0 } = render(<StatCard title="A" value={1} index={0} />)
    expect((c0.firstChild as HTMLElement).className).toContain('bg-orange')

    const { container: c1 } = render(<StatCard title="B" value={2} index={1} />)
    expect((c1.firstChild as HTMLElement).className).toContain('bg-blue')

    const { container: c3 } = render(<StatCard title="C" value={3} index={3} />)
    expect((c3.firstChild as HTMLElement).className).toContain('bg-yellow')
  })

  it('a quinta posicao volta para a primeira cor', () => {
    const { container } = render(<StatCard title="E" value={5} index={4} />)
    expect((container.firstChild as HTMLElement).className).toContain('bg-orange')
  })

  it('sem index o card fica neutro', () => {
    const { container } = render(<StatCard title="N" value={0} />)
    const cls = (container.firstChild as HTMLElement).className
    expect(cls).toContain('bg-surface-2')
    expect(cls).not.toContain('bg-orange')
  })

  it('o tone vira badge em vez de pintar o card', () => {
    const { container, getByText } = render(
      <StatCard title="X" value={9} index={0} tone="critical" />,
    )
    expect(getByText('Crítico')).toBeInTheDocument()
    expect((container.firstChild as HTMLElement).className).toContain('bg-orange')
  })

  it('aceita className adicional', () => {
    const { container } = render(<StatCard title="KPI" value={1} className="minha-classe" />)
    expect(container.firstChild).toHaveClass('minha-classe')
  })

  it('renderiza sparkline quando fornecida (size md)', () => {
    const { container } = render(<StatCard title="Entradas" value={46} sparkline={[10, 20, 15, 30, 25]} />)
    expect(container.querySelector('svg[aria-hidden="true"] path')).toBeInTheDocument()
  })

  it('renderiza sparkline quando fornecida (size sm)', () => {
    const { container } = render(<StatCard title="Entradas" value={46} size="sm" sparkline={[10, 20, 15, 30, 25]} />)
    expect(container.querySelector('svg[aria-hidden="true"] path')).toBeInTheDocument()
  })

  it('não renderiza sparkline com menos de 2 pontos', () => {
    const { container } = render(<StatCard title="Entradas" value={46} sparkline={[10]} />)
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeInTheDocument()
  })

  it('sem prop sparkline não renderiza nenhum svg de série', () => {
    const { container } = render(<StatCard title="Entradas" value={46} />)
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeInTheDocument()
  })
})
