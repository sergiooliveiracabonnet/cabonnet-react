import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ClienteReincidente } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'
import { buildBairroSummary } from './reincidenciasReport'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="mapa">{children}</div>,
  TileLayer: () => null,
  ZoomControl: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  CircleMarker: ({ children, eventHandlers }: { children: ReactNode; eventHandlers?: { click?: () => void } }) => <button type="button" data-testid="pino" onClick={eventHandlers?.click}>{children}</button>,
  useMap: () => ({ fitBounds: vi.fn(), flyTo: vi.fn(), invalidateSize: vi.fn() }),
}))
vi.mock('../mapa/MapaComponents', () => ({
  MapResizer: () => null,
  FlyTo: () => null,
  HeatLayer: ({ points }: { points: unknown[] }) => <div data-testid="calor" data-pontos={points.length} />,
}))

const { ReincidenciasMapa } = await import('./ReincidenciasMapa')

afterEach(cleanup)

const gps = (lat: string, lng: string) => `Informações da Execução:\nObs:OK\nLOCALIZAÇÃO\nLatitude Inicio: ${lat}\nLongitude Inicio: ${lng}`
const os = (numos: string, obs: string): OSRow => ({ numos, observacoes: obs, nomedaequipe: '03- VAL - INSTALACAO F11' }) as unknown as OSRow
const cli = (chave: string, bairro: string, rows: OSRow[]): ClienteReincidente => ({
  chave, cliente: `Cliente ${chave}`, cidade: 'Taubaté', bairro, visitas: rows.length, intervaloMedio: 5, diasDesdeUltima: 1, rows,
})

const clientes = [
  cli('A', 'CENTRO', [os('1', gps('-23.0001', '-45.5001')), os('2', gps('-23.0002', '-45.5002'))]),
  cli('B', 'CENTRO', [os('3', gps('-23.0003', '-45.5003')), os('4', 'sem gps')]),
  cli('C', 'JARDIM', [os('5', gps('-22.9510', '-45.4010')), os('6', gps('-22.9511', '-45.4011'))]),
]
const bairros = buildBairroSummary(clientes)
const chaveDe = (nome: string) => bairros.find(b => b.bairro === nome)!.key
const props = { tipo: 'Revisita de manutenção', clientes, bairros, carregando: false, erro: false, onAbrirBairro: vi.fn() }

describe('ReincidenciasMapa', () => {
  it('título com o tipo, mapa e camada de calor com os pontos agrupados', () => {
    render(<ReincidenciasMapa {...props} />)
    expect(screen.getByRole('heading', { name: 'Revisita de manutenção: mapa de calor' })).toBeTruthy()
    expect(screen.getByTestId('mapa')).toBeTruthy()
    expect(screen.getByTestId('calor').getAttribute('data-pontos')).toBe('2')  // dois quarteirões
  })

  it('mostra a cobertura de OS com localização', () => {
    render(<ReincidenciasMapa {...props} />)
    expect(screen.getByText(/5 de 6 OS com localização \(83%\)/)).toBeTruthy()
    expect(screen.getByText(/as demais não trazem GPS/)).toBeTruthy()
  })

  it('lista os pontos mais quentes com OS e clientes, do mais quente ao menos', () => {
    render(<ReincidenciasMapa {...props} />)
    const itens = screen.getAllByRole('listitem')
    expect(itens[0].textContent).toContain('CENTRO')
    expect(itens[0].textContent).toContain('3 OS · 2 clientes')
    expect(itens[1].textContent).toContain('JARDIM')
  })

  it('"Ver ordens" abre o modal do bairro daquele ponto', () => {
    const onAbrirBairro = vi.fn()
    render(<ReincidenciasMapa {...props} onAbrirBairro={onAbrirBairro} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver ordens' })[1])
    expect(onAbrirBairro).toHaveBeenCalledWith(chaveDe('JARDIM'))
  })

  it('clicar no pino do mapa também abre o bairro', () => {
    const onAbrirBairro = vi.fn()
    render(<ReincidenciasMapa {...props} onAbrirBairro={onAbrirBairro} />)
    fireEvent.click(screen.getAllByTestId('pino')[0])
    expect(onAbrirBairro).toHaveBeenCalledWith(chaveDe('CENTRO'))
  })

  it('enquanto as observações carregam, avisa e não desenha o mapa', () => {
    render(<ReincidenciasMapa {...props} carregando />)
    expect(screen.getByRole('status').textContent).toContain('Buscando a localização')
    expect(screen.queryByTestId('mapa')).toBeNull()
  })

  it('erro ao ler as observações vira aviso claro', () => {
    render(<ReincidenciasMapa {...props} erro />)
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível ler a localização')
  })

  it('sem nenhuma OS com GPS mostra o aviso em vez de um mapa vazio', () => {
    render(<ReincidenciasMapa {...props} clientes={[cli('A', 'CENTRO', [os('1', 'sem gps'), os('2', 'sem gps')])]} />)
    expect(screen.getByText('Nenhuma OS deste relatório tem localização registrada.')).toBeTruthy()
    expect(screen.queryByTestId('mapa')).toBeNull()
  })
})
