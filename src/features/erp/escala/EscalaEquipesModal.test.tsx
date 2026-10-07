import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EscalaEquipesModal } from './EscalaEquipesModal'
import { ESCALA_EQUIPES } from './escalaConstants'

const { equipesInativas, setEquipeAtiva } = vi.hoisted(() => ({
  equipesInativas: vi.fn(),
  setEquipeAtiva:  vi.fn(),
}))
vi.mock('../../../lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../lib/api')>()
  return { ...actual, escala: { ...actual.escala, equipesInativas, setEquipeAtiva } }
})

afterEach(cleanup)
beforeEach(() => {
  equipesInativas.mockReset().mockResolvedValue({ ok: true, inativas: ['F50'] })
  setEquipeAtiva.mockReset().mockResolvedValue({ ok: true })
})

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <EscalaEquipesModal open onClose={() => {}} />
    </QueryClientProvider>,
  )
}

describe('EscalaEquipesModal', () => {
  it('lista o roster inteiro e marca como desligada a equipe inativa', async () => {
    renderModal()
    const f50 = await screen.findByRole('switch', { name: 'Ligar F50' })
    expect(f50.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: 'Desligar F15' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getAllByRole('switch')).toHaveLength(ESCALA_EQUIPES.length)
  })

  it('desligar uma equipe chama a API com ativo=false', async () => {
    renderModal()
    fireEvent.click(await screen.findByRole('switch', { name: 'Desligar F11' }))
    await waitFor(() => expect(setEquipeAtiva).toHaveBeenCalledWith('F11', false))
  })

  it('religar uma equipe chama a API com ativo=true', async () => {
    renderModal()
    fireEvent.click(await screen.findByRole('switch', { name: 'Ligar F50' }))
    await waitFor(() => expect(setEquipeAtiva).toHaveBeenCalledWith('F50', true))
  })

  it('mostra o erro quando o servidor recusa a alteração', async () => {
    setEquipeAtiva.mockRejectedValue(new Error('Falha ao salvar equipe da escala'))
    renderModal()
    fireEvent.click(await screen.findByRole('switch', { name: 'Desligar F11' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Falha ao salvar equipe da escala')
  })
})
