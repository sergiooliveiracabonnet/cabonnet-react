import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PonMedicoesModal } from './PonMedicoesModal'
import { buildMedicaoDrafts, type PonMedicao } from './ponMedicoes'
import type { SignalRow } from './nivelSinal'

const row = (overrides: Partial<SignalRow> = {}): SignalRow => ({
  cidade: 'Taubaté', bairro: 'Centro', olt: 'OLT TBT', tipo: 'Huawei', slot: '1', pon: '1/2',
  onu: '7', cliente: 'Cliente A', codigo: '12345', situacao: 'Conectado', pppoe: 'pppoe-a',
  serial: 'ABC123', modelo: 'HG8145', status: 'Online', classificacao: 'Crítico',
  rx: -29.5, tx: 2.1, oltRx: -22, distancia: 1200, temperatura: 48, causa: '—',
  cidadeCliente: 'Taubaté', alertaRx: true,
  ...overrides,
})

const medicao = (overrides: Partial<PonMedicao> = {}): PonMedicao => ({
  onu_key: 'SUMIU', cliente: 'Fantasma', onu: '9', serial: 'SUMIU', codigo: '999',
  rx_antes: -30, rx_depois: null, observacao: '',
  ...overrides,
})

const abrir = (props: Partial<Parameters<typeof PonMedicoesModal>[0]> = {}) => render(
  <PonMedicoesModal titulo="Tratar PON 1/2" subtitulo="Taubaté · Centro" modo="tratar" busy={false} hasCsv
    drafts={buildMedicaoDrafts([row()], [])} onCancel={vi.fn()} onConfirm={vi.fn()} {...props} />)

describe('PonMedicoesModal', () => {
  it('deixa achar a linha inválida sem varrer a PON inteira', () => {
    const drafts = buildMedicaoDrafts(
      Array.from({ length: 8 }, (_, index) => row({ serial: `SN${index}`, cliente: `Cliente ${index}` })), [])
    abrir({ drafts })

    // Numa PON de 128 clientes, "corrija antes de salvar" sem dizer onde é inútil.
    expect(screen.queryByRole('button', { name: /valores inválidos/i })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nova potência de Cliente 5'), { target: { value: '25' } })

    fireEvent.click(screen.getByRole('button', { name: /valores inválidos/i }))
    expect(screen.getByLabelText('Nova potência de Cliente 5')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nova potência de Cliente 4')).not.toBeInTheDocument()
  })

  it('não acusa cliente de "fora do CSV" quando nenhum CSV foi carregado', () => {
    abrir({ hasCsv: false, drafts: buildMedicaoDrafts([], [medicao()]) })

    expect(screen.getByText('Fantasma')).toBeInTheDocument()
    expect(screen.queryByText('fora do CSV atual')).not.toBeInTheDocument()
  })

  it('marca como fora do CSV quem sumiu de um CSV que está carregado', () => {
    abrir({ drafts: buildMedicaoDrafts([row()], [medicao()]) })

    expect(screen.getByText('fora do CSV atual')).toBeInTheDocument()
  })

  it('não oferece um X que não fecha nada enquanto a gravação corre', () => {
    abrir({ busy: true })

    expect(screen.getByRole('button', { name: 'Fechar modal' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })
})
