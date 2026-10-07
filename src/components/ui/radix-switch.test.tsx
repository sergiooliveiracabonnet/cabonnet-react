import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { Switch } from './radix-switch'

afterEach(cleanup)

function Controlado({ onChange }: { onChange?: (v: boolean) => void }) {
  const [on, setOn] = useState(false)
  return <Switch aria-label="modo" checked={on} onCheckedChange={v => { setOn(v); onChange?.(v) }} />
}

describe('Switch', () => {
  it('expõe role=switch e reflete o estado em aria-checked', () => {
    render(<Switch aria-label="modo" checked />)
    expect(screen.getByRole('switch', { name: 'modo' }).getAttribute('aria-checked')).toBe('true')
  })

  it('clicar alterna e avisa o novo valor', () => {
    const onChange = vi.fn()
    render(<Controlado onChange={onChange} />)
    const sw = screen.getByRole('switch', { name: 'modo' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('desabilitado não dispara a mudança', () => {
    const onChange = vi.fn()
    render(<Switch aria-label="modo" disabled onCheckedChange={onChange} />)
    fireEvent.click(screen.getByRole('switch', { name: 'modo' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('label associado por htmlFor liga o interruptor', () => {
    const onChange = vi.fn()
    render(<><Switch id="x" onCheckedChange={onChange} /><label htmlFor="x">Incluir</label></>)
    fireEvent.click(screen.getByText('Incluir'))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
