import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginPage } from './LoginPage'
import { LoginBackdrop } from './LoginBackdrop'

const login = vi.fn()
vi.mock('../../lib/api', () => ({ api: { auth: { login: (...a: unknown[]) => login(...a) } } }))

describe('LoginPage', () => {
  beforeEach(() => login.mockReset())

  it('liga cada rotulo ao seu campo', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText('Usuário')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
  })

  it('o botao de mostrar senha tem nome e estado', () => {
    render(<LoginPage />)
    const botao = screen.getByRole('button', { name: 'Mostrar senha' })
    expect(botao).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(botao)
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text')
  })

  it('nao carrega nome de pessoa fixo no codigo', () => {
    render(<LoginPage />)
    expect(screen.queryByText(/Sergio/i)).toBeNull()
  })

  it('erro vira alerta anunciado e marca os campos como invalidos', async () => {
    login.mockResolvedValue({ ok: false, error: 'Usuário ou senha incorretos' })
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'u' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'p' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    const alerta = await waitFor(() => screen.getByRole('alert'))
    expect(alerta).toHaveTextContent('Usuário ou senha incorretos')
    expect(screen.getByLabelText('Usuário')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Usuário')).toHaveAttribute('aria-describedby', alerta.id)
  })

  it('so envia com usuario e senha preenchidos', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  })

  it('o cenario e decoracao: escondido de leitor de tela e sem cor fixa', () => {
    const { container } = render(<LoginBackdrop />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    // Cor so por token do tema (currentColor / --c-*). Hex aqui voltaria o navy
    // e nao trocaria de tema. As mascaras usam #fff porque so a opacidade conta.
    const cores = [...container.querySelectorAll('[stroke],[fill],[stop-color]')]
      .flatMap(el => ['stroke', 'fill', 'stop-color'].map(a => el.getAttribute(a)))
      .filter((v): v is string => !!v && v.startsWith('#') && v.toLowerCase() !== '#fff')
    expect(cores).toEqual([])
  })
})
