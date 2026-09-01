import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

// Segunda camada de defesa é o backend (_require_modulo/_require_gestor em
// cabonnet/app.py) — isto aqui é só UX: evita que operador/viewer cheguem
// numa tela sem sentido pra eles via deep-link direto.

export function RequireModulo({ modulo, children }: { modulo: string; children: ReactNode }) {
  const role    = useAuthStore(s => s.role)
  const modulos = useAuthStore(s => s.modulos)
  if (role === 'gestor' || modulos.includes(modulo)) return <>{children}</>
  return <Navigate to="/" replace />
}

export function RequireGestor({ children }: { children: ReactNode }) {
  const role = useAuthStore(s => s.role)
  if (role === 'gestor') return <>{children}</>
  return <Navigate to="/" replace />
}
