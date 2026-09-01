import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from './uiStore'

describe('tema', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('aplica a classe .dark quando o tema e escuro', () => {
    useUIStore.setState({ theme: 'light' })
    useUIStore.getState().toggleTheme()
    expect(useUIStore.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('remove a classe .dark quando o tema e claro', () => {
    useUIStore.setState({ theme: 'dark' })
    useUIStore.getState().toggleTheme()
    expect(useUIStore.getState().theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
