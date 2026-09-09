import { beforeEach, describe, expect, it } from 'vitest'
import { useUIStore } from './uiStore'

describe('cluster no uiStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useUIStore.setState({ cluster: 'VALE' })
  })

  it('começa no Vale — somar Adamantina de saída mudaria todo KPI histórico', () => {
    expect(useUIStore.getState().cluster).toBe('VALE')
  })

  it('setCluster persiste a escolha para a próxima sessão do navegador', () => {
    useUIStore.getState().setCluster('ADAMANTINA')
    expect(useUIStore.getState().cluster).toBe('ADAMANTINA')
    expect(localStorage.getItem('cluster')).toBe('ADAMANTINA')
  })

  it('conta amarrada a um cluster sobrepõe a escolha guardada', () => {
    useUIStore.getState().setCluster('VALE')
    useUIStore.getState().aplicarClusterDaSessao('ADAMANTINA')
    expect(useUIStore.getState().cluster).toBe('ADAMANTINA')
  })

  it('conta com TODOS preserva a escolha do usuário em vez de resetar', () => {
    useUIStore.getState().setCluster('ADAMANTINA')
    useUIStore.getState().aplicarClusterDaSessao('TODOS')
    expect(useUIStore.getState().cluster).toBe('ADAMANTINA')
  })
})
