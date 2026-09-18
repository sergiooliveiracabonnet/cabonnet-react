import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ExecutadasHeroBlock } from './DashboardHeroBlock'
import type { OSRow } from '../../lib/types'

afterEach(cleanup)

function row(o: Partial<OSRow> = {}): OSRow {
  return { _executadaHoje: true, _categoria: 'VT_MANUTENCAO', ...o } as unknown as OSRow
}

describe('ExecutadasHeroBlock', () => {
  it('mostra o total de hoje e a distribuição por categoria', () => {
    const rows = [row(), row({ _categoria: 'INSTALACAO' })]
    render(<ExecutadasHeroBlock rows={rows} onOpenModal={vi.fn()} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('OS hoje')).toBeInTheDocument()
  })

  it('mostra os stats do período selecionado separados do número de hoje', () => {
    const rows = [row()]
    render(<ExecutadasHeroBlock rows={rows} onOpenModal={vi.fn()} concl={42} taxa={78} />)
    expect(screen.getByText('No período selecionado:')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('concluídas')).toBeInTheDocument()
    expect(screen.getByText('78%')).toBeInTheDocument()
    expect(screen.getByText('taxa de conclusão')).toBeInTheDocument()
  })

  it('abre o drill-down de concluídas do período ao clicar', () => {
    const onOpenConcl = vi.fn()
    render(<ExecutadasHeroBlock rows={[row()]} onOpenModal={vi.fn()} concl={42} onOpenConcl={onOpenConcl} />)
    fireEvent.click(screen.getByRole('button', { name: /42 concluídas/i }))
    expect(onOpenConcl).toHaveBeenCalledTimes(1)
  })

  it('não mostra a faixa do período quando concl e taxa não são informados', () => {
    render(<ExecutadasHeroBlock rows={[row()]} onOpenModal={vi.fn()} />)
    expect(screen.queryByText('No período selecionado:')).not.toBeInTheDocument()
  })
})
