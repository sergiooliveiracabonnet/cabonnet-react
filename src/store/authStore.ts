import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type AuthStatus = 'checking' | 'authed' | 'unauthed'
export type UserRole   = 'gestor' | 'operador' | 'viewer' | null

interface AuthState {
  status: AuthStatus
  role:   UserRole
  setAuthed:   (role?: UserRole) => void
  setUnauthed: () => void
  setChecking: () => void
}

// sessionStorage é copiado ao duplicar uma aba — o estado 'authed' fica disponível
// imediatamente na nova aba, sem spinner. A verificação com o servidor acontece
// em background (App.tsx); se o servidor retornar 401, vai para login normalmente.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status: 'checking',
      role:   null,

      setAuthed:   (role = 'gestor') => set({ status: 'authed',   role }),
      setUnauthed: ()                => set({ status: 'unauthed', role: null }),
      setChecking: ()                => set({ status: 'checking', role: null }),
    }),
    {
      name:    'cbn_auth',
      storage: createJSONStorage(() => sessionStorage),
      // Persiste apenas status e role — nunca funções
      partialize: (s) => ({ status: s.status, role: s.role }),
      // Só restaura estado 'authed'; 'checking'/'unauthed' recomeçam do zero
      merge: (persisted, current) => {
        const p = persisted as Partial<AuthState>
        if (p?.status === 'authed') {
          return { ...current, status: 'authed', role: p.role ?? null }
        }
        return current
      },
    }
  )
)
