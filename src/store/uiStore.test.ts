import { beforeEach, describe, expect, it } from 'vitest'
import { useUIStore } from './uiStore'

describe('cluster no uiStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useUIStore.setState({ cluster: 'VALE', clusterDono: null })
  })

  it('começa no Vale — somar Adamantina de saída mudaria todo KPI histórico', () => {
    expect(useUIStore.getState().cluster).toBe('VALE')
  })

  it('setCluster persiste a escolha sob a chave do usuário', () => {
    useUIStore.getState().aplicarClusterDaSessao('TODOS', 'admin')
    useUIStore.getState().setCluster('ADAMANTINA')
    expect(useUIStore.getState().cluster).toBe('ADAMANTINA')
    expect(localStorage.getItem('cluster:admin')).toBe('ADAMANTINA')
  })

  it('conta amarrada a um cluster sobrepõe a escolha guardada', () => {
    useUIStore.getState().aplicarClusterDaSessao('TODOS', 'admin')
    useUIStore.getState().setCluster('VALE')
    useUIStore.getState().aplicarClusterDaSessao('ADAMANTINA', 'oscar')
    expect(useUIStore.getState().cluster).toBe('ADAMANTINA')
  })

  it('conta amarrada não persiste nada — o recorte dela é do servidor, não uma escolha', () => {
    useUIStore.getState().aplicarClusterDaSessao('ADAMANTINA', 'oscar')
    expect(localStorage.getItem('cluster:oscar')).toBeNull()
  })

  it('conta global depois de uma conta amarrada volta ao padrão, não herda Adamantina', () => {
    // O bug: o admin logava depois do Oscar e via a operação inteira recortada
    // em Adamantina, sem ter escolhido nada.
    useUIStore.getState().aplicarClusterDaSessao('ADAMANTINA', 'oscar')
    useUIStore.getState().aplicarClusterDaSessao('TODOS', 'admin')
    expect(useUIStore.getState().cluster).toBe('VALE')
  })

  it('conta global recupera a própria escolha entre sessões', () => {
    useUIStore.getState().aplicarClusterDaSessao('TODOS', 'admin')
    useUIStore.getState().setCluster('ADAMANTINA')
    useUIStore.getState().aplicarClusterDaSessao('ADAMANTINA', 'oscar')
    useUIStore.getState().aplicarClusterDaSessao('TODOS', 'admin')
    expect(useUIStore.getState().cluster).toBe('ADAMANTINA')
  })

  it('a escolha de um usuário não vale para outro no mesmo navegador', () => {
    useUIStore.getState().aplicarClusterDaSessao('TODOS', 'admin')
    useUIStore.getState().setCluster('TODOS')
    useUIStore.getState().aplicarClusterDaSessao('TODOS', 'sergio')
    expect(useUIStore.getState().cluster).toBe('VALE')
  })

  it('sessão sem username não deixa rastro em disco', () => {
    useUIStore.getState().aplicarClusterDaSessao('TODOS', null)
    useUIStore.getState().setCluster('ADAMANTINA')
    expect(useUIStore.getState().cluster).toBe('ADAMANTINA')
    expect(Object.keys(localStorage).filter(k => k.startsWith('cluster:'))).toEqual([])
  })
})
