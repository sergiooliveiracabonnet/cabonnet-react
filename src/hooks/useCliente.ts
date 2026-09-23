import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clientesApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'

export const MODULO_CLIENTE = 'cliente'

export function useTemModuloCliente(): boolean {
  return useAuthStore(s => s.role === 'gestor' || s.modulos.includes(MODULO_CLIENTE))
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

// A busca vai ao ERP (não à base de OS carregada), então só dispara com termo
// que o servidor aceita: 2 letras, ou 3 dígitos.
export function termoBuscaValido(q: string): boolean {
  const t = q.trim()
  if (/[A-Za-zÀ-ÿ]/.test(t)) return t.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').length >= 2
  return t.replace(/\D/g, '').length >= 3
}

export function useClienteBusca(query: string, enabled = true) {
  const q = useDebounced(query.trim(), 300)
  const ativo = enabled && termoBuscaValido(q)
  const { data, isFetching, error } = useQuery({
    queryKey:  ['cliente-busca', q],
    queryFn:   () => clientesApi.busca(q),
    enabled:   ativo,
    staleTime: 1000 * 60 * 5,
    retry:     0,
  })
  return {
    items:     ativo ? (data?.items ?? []) : [],
    isLoading: ativo && isFetching,
    error:     error as Error | null,
  }
}

export function useCliente(codigo: string | undefined) {
  return useQuery({
    queryKey:  ['cliente', codigo],
    queryFn:   () => clientesApi.detalhe(codigo as string),
    enabled:   !!codigo,
    staleTime: 1000 * 60 * 5,
    retry:     0,
  })
}
