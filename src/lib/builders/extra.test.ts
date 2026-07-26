import { describe, expect, it } from 'vitest'
import { transformJuniper } from './extra'

describe('transformJuniper', () => {
  it('trata uma coleta válida sem conexões como saudável', () => {
    const result = transformJuniper({
      total: 0,
      alerta: false,
      clientes: [],
      cluster: 'Vale',
      ultima_coleta: '26/07/2026 10:00:00',
    })

    expect(result?.hero.nivel).toBe('ok')
    expect(result?.hero.nivel_label).toBe('Nenhuma conexão ativa detectada')
    expect(result?.hasAlert).toBe(false)
    expect(result?.hasData).toBe(true)
  })

  it('trata qualquer conexão ativa como incidente, mesmo se o backend enviar alerta incorreto', () => {
    const result = transformJuniper({
      total: 1,
      alerta: false,
      clientes: [{ user_name: 'cliente-1', state: 'active', ip_address: '10.0.0.1' }],
      cluster: 'Vale',
      ultima_coleta: '26/07/2026 10:00:00',
    })

    expect(result?.hero.nivel).toBe('alert')
    expect(result?.hero.nivel_label).toBe('1 conexão ativa exige verificação')
    expect(result?.hasAlert).toBe(true)
  })

  it('distingue ausência de coleta de uma coleta saudável com zero conexões', () => {
    const result = transformJuniper({ total: 0, clientes: [], cluster: 'Vale' })

    expect(result?.hero.nivel).toBe('warn')
    expect(result?.hero.nivel_label).toBe('Aguardando dados da coleta')
    expect(result?.hasAlert).toBe(false)
    expect(result?.hasData).toBe(false)
  })
})
