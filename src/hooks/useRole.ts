import { useAuthStore } from '../store/authStore'
import type { UserRole } from '../store/authStore'

export const useRole = (): UserRole => useAuthStore(s => s.role)

export const useIsGestor = (): boolean => useAuthStore(s => s.role === 'gestor')

export const useIsOperador = (): boolean =>
  useAuthStore(s => s.role === 'gestor' || s.role === 'operador')

export const useIsFornecedor = (): boolean => useAuthStore(s => s.role === 'fornecedor')
