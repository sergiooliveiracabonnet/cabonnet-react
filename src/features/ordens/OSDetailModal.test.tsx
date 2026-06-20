import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OSDetailModal } from './OSDetailModal'
import type { OSRow } from '../../lib/types'

vi.mock('../../hooks/useOSDetails', () => ({ useOSDetails: vi.fn() }))
import { useOSDetails } from '../../hooks/useOSDetails'

const baseOS = { numos: '9999999', nomecliente: 'Cliente Teste', descsituacao: 'Concluída' } as unknown as OSRow

const emptyDetails = {
  fotos: [], checklist: [], motivoInconclusivo: null,
  historico: [], obsTecnico: null, nomeTecnico: null, reagendada: false,
  equipeAgendada: null, equipeExecutou: null, equipeReagend: null,
  materiais: [], materiaisRetirados: [], datacontratacao: null,
  datainstalacao: null, situacaocontrato: null, valorcontrato: null,
}

describe('OSDetailModal — seções condicionais novas', () => {
  it('não renderiza fotos/checklist/motivo quando vazios', () => {
    vi.mocked(useOSDetails).mockReturnValue({ isLoading: false, error: null, details: emptyDetails })
    render(<OSDetailModal os={baseOS} open onClose={() => {}} />)
    expect(screen.queryByText('Fotos da Execução')).not.toBeInTheDocument()
    expect(screen.queryByText('Checklist de Execução')).not.toBeInTheDocument()
    expect(screen.queryByText('Motivo de Inconclusão')).not.toBeInTheDocument()
  })

  it('renderiza motivo de inconclusão quando presente', () => {
    vi.mocked(useOSDetails).mockReturnValue({
      isLoading: false, error: null,
      details: { ...emptyDetails, motivoInconclusivo: 'Cliente ausente' },
    })
    render(<OSDetailModal os={baseOS} open onClose={() => {}} />)
    expect(screen.getByText('Motivo de Inconclusão')).toBeInTheDocument()
    expect(screen.getByText('Cliente ausente')).toBeInTheDocument()
  })

  it('renderiza checklist quando presente', () => {
    vi.mocked(useOSDetails).mockReturnValue({
      isLoading: false, error: null,
      details: { ...emptyDetails, checklist: [{ servico: 'Instalação', descricao: 'Testou sinal', checked: true }] },
    })
    render(<OSDetailModal os={baseOS} open onClose={() => {}} />)
    expect(screen.getByText('Checklist de Execução')).toBeInTheDocument()
    expect(screen.getByText('Testou sinal')).toBeInTheDocument()
  })

  it('renderiza grid de fotos quando presente e abre lightbox ao clicar', async () => {
    vi.mocked(useOSDetails).mockReturnValue({
      isLoading: false, error: null,
      details: { ...emptyDetails, fotos: [{ codfoto: 10, nomearquivo: 'foto1.jpg', descricao: 'Fachada' }] },
    })
    render(<OSDetailModal os={baseOS} open onClose={() => {}} />)
    expect(screen.getByText('Fotos da Execução')).toBeInTheDocument()
    expect(screen.getByAltText('Fachada')).toBeInTheDocument()
  })
})
