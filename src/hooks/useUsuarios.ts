import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usuarios, type UsuarioItem, type UserRole } from '../lib/api'

const QK = ['usuarios']

export function useUsuarios() {
  return useQuery<UsuarioItem[]>({
    queryKey:             QK,
    queryFn:              async () => (await usuarios.list()).items,
    staleTime:            30_000,
    retry:                1,
    refetchOnWindowFocus: false,
  })
}

export function useUsuariosActions() {
  const qc = useQueryClient()

  const create = async (body: { username: string; password: string; role: UserRole }) => {
    await usuarios.create(body)
    await qc.invalidateQueries({ queryKey: QK })
  }

  const update = async (id: number, body: { role?: UserRole; ativo?: boolean }) => {
    await usuarios.update(id, body)
    await qc.invalidateQueries({ queryKey: QK })
  }

  const resetPassword = async (id: number, password: string) => {
    await usuarios.resetPassword(id, password)
  }

  const changeOwnPassword = async (atual: string, nova: string) => {
    await usuarios.changeOwnPassword(atual, nova)
  }

  return { create, update, resetPassword, changeOwnPassword }
}
