import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ai } from '../../lib/api'
import { NivelSinalAI } from './NivelSinalAI'
import type { SignalRow } from './nivelSinal'

vi.mock('../../lib/api', () => ({ ai: { nivelSinal: vi.fn() } }))

const row = {
  cidade: 'Taubaté', bairro: 'Centro', olt: 'OLT TBT', tipo: 'Huawei', slot: '1', pon: '1/2', onu: '7',
  cliente: 'Cliente privado', codigo: '123', situacao: 'Conectado', pppoe: 'privado', serial: 'ABC', modelo: 'HG8145',
  status: 'Online', classificacao: 'Crítico', rx: -31.5, tx: 2, oltRx: -29, distancia: 1000, causa: '—',
} as SignalRow

describe('NivelSinalAI', () => {
  beforeEach(() => vi.mocked(ai.nivelSinal).mockReset())

  it('gera diagnóstico e plano de ação usando somente contexto agregado', async () => {
    vi.mocked(ai.nivelSinal).mockResolvedValue({ ok: true, diagnostico: 'Falha concentrada.', prioridades: ['OLT TBT'], plano_acao: [{ prazo: 'Imediato', acao: 'Inspecionar PON', responsavel: 'Campo', criterio: 'RX normalizado' }], riscos: [] })
    render(<NivelSinalAI rows={[row]} filters={{}} />)
    fireEvent.click(screen.getByRole('button', { name: /analisar relatório/i }))

    expect(await screen.findByText('Falha concentrada.')).toBeInTheDocument()
    expect(screen.getByText('Inspecionar PON')).toBeInTheDocument()
    const payload = vi.mocked(ai.nivelSinal).mock.calls[0][0] as Record<string, unknown>
    expect(JSON.stringify(payload)).not.toContain('Cliente privado')
    expect(JSON.stringify(payload)).not.toContain('privado')
  })

  it('responde perguntas sobre o relatório', async () => {
    vi.mocked(ai.nivelSinal).mockResolvedValue({ ok: true, resposta: 'Comece pela OLT TBT.' })
    render(<NivelSinalAI rows={[row]} filters={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Por qual PON devemos começar?' }))

    await waitFor(() => expect(ai.nivelSinal).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('Comece pela OLT TBT.')).toBeInTheDocument())
  })
})
