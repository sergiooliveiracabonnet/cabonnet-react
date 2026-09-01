import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ApproximateLocationNotice, MapLegend } from './MapaComponents'

afterEach(cleanup)

describe('MapLegend', () => {
  it('explica cor, tamanho e marcadores especiais sem depender só da cor', () => {
    render(<MapLegend />)

    expect(screen.getByRole('region', { name: 'Legenda do mapa' })).toBeInTheDocument()
    expect(screen.getByText('SLA crítico')).toBeInTheDocument()
    expect(screen.getByText('SLA excedido')).toBeInTheDocument()
    expect(screen.getByText('Maior círculo = mais OS')).toBeInTheDocument()
    expect(screen.getByText('Contorno tracejado = posição aproximada')).toBeInTheDocument()
    expect(screen.getByText('Execução em campo')).toBeInTheDocument()
  })
})

describe('ApproximateLocationNotice', () => {
  it('informa que bairros não representam coordenadas exatas', () => {
    render(<ApproximateLocationNotice />)
    expect(screen.getByRole('status')).toHaveTextContent('Posições aproximadas')
    expect(screen.getByRole('status')).toHaveTextContent('não representam o endereço exato')
  })
})
