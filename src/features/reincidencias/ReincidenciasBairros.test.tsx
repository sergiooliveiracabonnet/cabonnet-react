import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { BairroModal, BairrosCard } from './ReincidenciasBairros'
import { buildBairroSummary } from './reincidenciasReport'
import type { ClienteReincidente } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'

afterEach(cleanup)

const os = (numos: string, servico = 'ASSISTENCIA - VT 24H', obs = ''): OSRow => ({
  numos, servico, tiposervico: 'MANUTENCAO', nomedaequipe: '03- VAL - MANUTENCAO F02',
  dataexecucao: '10/09/2026', databaixa: '10/09/2026', observacoes: obs,
}) as unknown as OSRow

const cli = (chave: string, cidade: string, bairro: string, rows: OSRow[]): ClienteReincidente => ({
  chave, cliente: `Cliente ${chave}`, cidade, bairro, visitas: rows.length, intervaloMedio: 6, diasDesdeUltima: 2, rows,
})

const resumo = buildBairroSummary([
  cli('A', 'Taubaté', 'CENTRO', [os('1000001', undefined, 'conector trocado'), os('1000002')]),
  cli('B', 'Taubaté', 'CENTRO', [os('2000001'), os('2000002')]),
  cli('C', 'Taubaté', 'JARDIM AZUL', [os('3000001'), os('3000002')]),
])

// A chave do bairro é interna (forma canônica); o teste a busca pelo nome em vez de fixá-la no texto.
const chaveDe = (nome: string) => resumo.find(b => b.bairro === nome)!.key

describe('BairrosCard', () => {
  it('lista os bairros com clientes e participação; clicar abre aquele bairro', () => {
    const onOpen = vi.fn()
    render(<BairrosCard tipo="Revisita de manutenção" resumo={resumo} onOpen={onOpen} />)
    expect(screen.getByText('4 OS')).toBeTruthy()
    expect(screen.getByText(/2 clientes/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /JARDIM AZUL/ }))
    expect(onOpen).toHaveBeenCalledWith(chaveDe('JARDIM AZUL'))
  })

  it('"Ver todos os bairros" abre pelo bairro com mais clientes', () => {
    const onOpen = vi.fn()
    render(<BairrosCard tipo="Revisita de manutenção" resumo={resumo} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver todos os bairros \(2\)/ }))
    expect(onOpen).toHaveBeenCalledWith(chaveDe('CENTRO'))
  })

  it('o título diz se é revisita de manutenção ou de instalação', () => {
    render(<BairrosCard tipo="Revisita de instalação" resumo={resumo} onOpen={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Revisita de instalação por bairro' })).toBeTruthy()
  })

  it('sem revisitas mostra o aviso', () => {
    render(<BairrosCard tipo="Revisita de manutenção" resumo={[]} onOpen={() => {}} />)
    expect(screen.getByText('Sem revisitas para mostrar por bairro.')).toBeTruthy()
  })
})

describe('BairroModal', () => {
  it('mostra as OS dos clientes do bairro escolhido, com a observação', () => {
    render(<BairroModal tipo="Revisita de manutenção" resumo={resumo} selectedKey={chaveDe('CENTRO')} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByText('1000001')).toBeTruthy()
    expect(screen.getByText('2000002')).toBeTruthy()
    expect(screen.getByText('conector trocado')).toBeTruthy()
    expect(screen.queryByText('3000001')).toBeNull()
  })

  it('trocar de bairro na lista da esquerda avisa o novo bairro', () => {
    const onSelect = vi.fn()
    render(<BairroModal tipo="Revisita de manutenção" resumo={resumo} selectedKey={chaveDe('CENTRO')} onSelect={onSelect} onClose={() => {}} />)
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Bairros' })).getByRole('button', { name: /JARDIM AZUL/ }))
    expect(onSelect).toHaveBeenCalledWith(chaveDe('JARDIM AZUL'))
  })

  it('o título do modal traz o tipo da revisita', () => {
    render(<BairroModal tipo="Revisita de instalação" resumo={resumo} selectedKey={chaveDe('CENTRO')} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Revisita de instalação por bairro')).toBeTruthy()
  })

  it('não renderiza nada sem bairro selecionado', () => {
    render(<BairroModal tipo="Revisita de manutenção" resumo={resumo} selectedKey={null} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('BairrosCard — taxa, variação e indício', () => {
  const rows = (n: number, equipe: string) => Array.from({ length: n }, (_, i) => ({ ...os(`${equipe}${i}`), nomedaequipe: `03- VAL - INSTALACAO ${equipe}` }) as OSRow)
  const base = Array.from({ length: 10 }, (_, i) => cli(`B${i}`, 'Taubaté', 'CENTRO', [os(`9${i}`)]))
  const comBase = buildBairroSummary(
    [cli('A', 'Taubaté', 'CENTRO', rows(3, 'F11')), cli('B', 'Taubaté', 'CENTRO', rows(3, 'F11')), cli('C', 'Taubaté', 'CENTRO', rows(3, 'F11'))],
    { base, anterior: [cli('A', 'Taubaté', 'CENTRO', rows(2, 'F11'))] },
  )

  it('mostra a taxa e a variação contra o período anterior na lista', () => {
    render(<BairrosCard tipo="Revisita de manutenção" resumo={comBase} onOpen={() => {}} />)
    expect(screen.getByText(/taxa 30%/)).toBeTruthy()
    expect(screen.getByText('▲ +7')).toBeTruthy()
  })

  it('mostra o indício de execução com a equipe dominante', () => {
    render(<BairrosCard tipo="Revisita de manutenção" resumo={comBase} onOpen={() => {}} />)
    expect(screen.getByText(/Indício de execução · INST F11/)).toBeTruthy()
  })

  it('o modal explica o indício e mostra clientes sobre atendidos', () => {
    render(<BairroModal tipo="Revisita de manutenção" resumo={comBase} selectedKey={chaveDe('CENTRO')} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByText(/3 de 10 atendidos/)).toBeTruthy()
    expect(screen.getByText(/fez a visita de origem em 100% das revisitas/)).toBeTruthy()
  })
})

describe('BairroModal — grafias reunidas', () => {
  const grafias = buildBairroSummary([
    cli('A', 'Taubaté', 'JD SONIA MARIA', [os('1'), os('2')]),
    cli('B', 'Taubaté', 'JARDIM SONIA MARIA', [os('3'), os('4')]),
    cli('C', 'Taubaté', 'JARDIM SANIA MARIA', [os('5'), os('6')]),
  ])

  it('mostra todas as grafias do cadastro que foram unidas, para conferir', () => {
    render(<BairroModal tipo="Revisita de manutenção" resumo={grafias} selectedKey={grafias[0].key} onSelect={() => {}} onClose={() => {}} />)
    const aviso = screen.getByTestId('grafias-reunidas')
    expect(aviso.textContent).toContain('3 grafias do cadastro reunidas')
    expect(aviso.textContent).toContain('JD SONIA MARIA')
    expect(aviso.textContent).toContain('JARDIM SANIA MARIA')
  })

  it('bairro com uma única grafia não mostra o aviso', () => {
    render(<BairroModal tipo="Revisita de manutenção" resumo={resumo} selectedKey={chaveDe('CENTRO')} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.queryByTestId('grafias-reunidas')).toBeNull()
  })
})
