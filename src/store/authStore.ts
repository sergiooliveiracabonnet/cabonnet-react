import { create } from 'zustand'

export type AuthStatus = 'checking' | 'authed' | 'unauthed'
export type UserRole   = 'gestor' | 'operador' | 'viewer' | null

interface AuthState {
  status: AuthStatus
  role:   UserRole
  setAuthed:   (role?: UserRole) => void
  setUnauthed: () => void
  setChecking: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'checking',
  role:   null,

  setAuthed:   (role = 'gestor') => set({ status: 'authed',   role }),
  setUnauthed: ()                => set({ status: 'unauthed', role: null }),
  setChecking: ()                => set({ status: 'checking', role: null }),
}))
