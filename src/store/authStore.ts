import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type AuthStatus = 'checking' | 'authed' | 'unauthed'
export type UserRole   = 'gestor' | 'operador' | 'viewer' | 'fornecedor' | null
export type AuthFornecedor = 'WES' | 'Instacable' | 'THM' | null

interface AuthState {
  status:  AuthStatus
  role:    UserRole
  modulos: string[]
  fornecedorKey: AuthFornecedor
  setAuthed:   (role?: UserRole, modulos?: string[], fornecedorKey?: AuthFornecedor) => void
  setUnauthed: () => void
  setChecking: () => void
}

// sessionStorage é copiado ao duplicar uma aba — o estado 'authed' fica disponível
// imediatamente na nova aba, sem spinner. A verificação com o servidor acontece
// em background (App.tsx); se o servidor retornar 401, vai para login normalmente.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status:  'checking',
      role:    null,
      modulos: [],
      fornecedorKey: null,

      setAuthed:   (role = 'gestor', modulos = [], fornecedorKey = null) => set({ status: 'authed', role, modulos, fornecedorKey }),
      setUnauthed: () => set({ status: 'unauthed', role: null, modulos: [], fornecedorKey: null }),
      setChecking: () => set({ status: 'checking', role: null, modulos: [], fornecedorKey: null }),
    }),
    {
      name:    'cbn_auth',
      storage: createJSONStorage(() => sessionStorage),
      // Persiste apenas status, role e modulos — nunca funções
      partialize: (s) => ({ status: s.status, role: s.role, modulos: s.modulos, fornecedorKey: s.fornecedorKey }),
      // Só restaura estado 'authed'; 'checking'/'unauthed' recomeçam do zero
      merge: (persisted, current) => {
        const p = persisted as Partial<AuthState>
        if (p?.status === 'authed') {
          return { ...current, status: 'authed', role: p.role ?? null, modulos: p.modulos ?? [], fornecedorKey: p.fornecedorKey ?? null }
        }
        return current
      },
    }
  )
)
