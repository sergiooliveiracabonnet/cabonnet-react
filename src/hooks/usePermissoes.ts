import { useQuery, useQueryClient } from '@tanstack/react-query'
import { permissoes, type UserRole, type ModuloDef } from '../lib/api'

const QK = ['permissoes']

export interface PermissoesData {
  permissoes: Record<UserRole, string[]>
  modulos:    ModuloDef[]
}

export function usePermissoes() {
  return useQuery<PermissoesData>({
    queryKey:             QK,
    queryFn:              async () => {
      const res = await permissoes.get()
      return { permissoes: res.permissoes, modulos: res.modulos }
    },
    staleTime:            30_000,
    retry:                1,
    refetchOnWindowFocus: false,
  })
}

export function usePermissoesActions() {
  const qc = useQueryClient()

  const set = async (role: UserRole, modulos: string[]) => {
    await permissoes.set(role, modulos)
    await qc.invalidateQueries({ queryKey: QK })
  }

  return { set }
}
