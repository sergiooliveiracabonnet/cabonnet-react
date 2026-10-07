import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DateFilterBar } from './DateFilterBar'
import { useUIStore } from '../../store/uiStore'

afterEach(cleanup)
beforeEach(() => useUIStore.setState({ hideRede: true }))

describe('DateFilterBar — interruptor de Rede', () => {
  it('Rede oculta (padrão) aparece como interruptor desligado', () => {
    render(<DateFilterBar sidebarOpen />)
    expect(screen.getByRole('switch', { name: 'Exibir OS de Rede Interna' }).getAttribute('aria-checked')).toBe('false')
  })

  it('ligar o interruptor passa a exibir as OS de Rede e desligar volta a ocultar', () => {
    render(<DateFilterBar sidebarOpen />)
    const sw = screen.getByRole('switch', { name: 'Exibir OS de Rede Interna' })
    fireEvent.click(sw)
    expect(useUIStore.getState().hideRede).toBe(false)
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    expect(useUIStore.getState().hideRede).toBe(true)
  })

  it('clicar no rótulo "Rede" também alterna', () => {
    render(<DateFilterBar sidebarOpen />)
    fireEvent.click(screen.getByText('Rede'))
    expect(useUIStore.getState().hideRede).toBe(false)
  })
})
