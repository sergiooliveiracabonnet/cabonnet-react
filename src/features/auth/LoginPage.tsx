import { useState, useRef, useId, useLayoutEffect, type FormEvent } from 'react'
import { Eye, EyeSlash, WarningCircle } from '@phosphor-icons/react'
import { api } from '../../lib/api'
import { CABONNET_BLACK_LOGO } from '../../lib/pdfBrand'
import { useAuthStore } from '../../store/authStore'
import { useAuditStore } from '../../store/auditStore'
import { useUIStore } from '../../store/uiStore'
import { Button } from '../../components/ui/Button'
import { LoginBackdrop } from './LoginBackdrop'

// A borda do campo e o que o identifica como campo (WCAG 1.4.11, 3:1). O
// --c-border do card da 1.3:1; --c-muted passa nos dois temas.
const CAMPO = `w-full h-10 rounded-md border border-muted bg-bg px-3 text-body text-text
               placeholder:text-muted outline-none transition-colors
               hover:border-secondary
               focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/50
               disabled:opacity-50`

export function LoginPage() {
  const setAuthed  = useAuthStore(s => s.setAuthed)
  const logAudit   = useAuditStore(s => s.log)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)
  const submittingRef = useRef(false)

  // O login e sempre escuro, qualquer que seja o tema salvo: o cenario do rack
  // foi pensado sobre carbono. O tema do usuario volta quando a tela sai.
  useLayoutEffect(() => {
    const raiz = document.documentElement
    const eraClaro = raiz.classList.contains('light')
    raiz.classList.remove('light')
    return () => { if (eraClaro) raiz.classList.add('light') }
  }, [])
  const idUsuario = useId()
  const idSenha   = useId()
  const idErro    = useId()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!username.trim() || !password || submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    setError('')
    try {
      const res = await api.auth.login(username.trim(), password)
      if (res.ok) {
        logAudit(`Login realizado`, `role: ${res.role ?? 'gestor'}`, 'auth')
        setSuccess(true)
        setTimeout(() => {
          setAuthed((res.role ?? 'gestor') as 'gestor' | 'supervisor' | 'operador' | 'viewer' | 'fornecedor', res.modulos ?? [], res.fornecedor_key ?? null, res.cluster_key ?? 'TODOS')
          useUIStore.getState().aplicarClusterDaSessao(res.cluster_key ?? 'TODOS', username.trim())
        }, 600)
        return
      } else {
        setError(res.error || 'Credenciais inválidas')
      }
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)) ?? ''
      if (msg.startsWith('401')) {
        setError('Usuário ou senha incorretos')
      } else if (msg.startsWith('Timeout')) {
        setError('Servidor não respondeu. Verifique se o Cabonnet está rodando.')
      } else {
        setError('Não foi possível conectar ao servidor.')
      }
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center p-6 bg-bg overflow-hidden">
      <LoginBackdrop />
      <div className="relative w-full max-w-[360px] animate-fade-in">

        <div className="flex flex-col items-center mb-8">
          <img
            src={CABONNET_BLACK_LOGO}
            alt="Cabonnet"
            className="h-16 w-auto mb-5"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <h1 className="font-headline text-headline font-semibold text-text">Gestão de OS</h1>
          <p className="mt-1 text-label text-secondary">Acesso restrito</p>
        </div>

        <form onSubmit={handleSubmit}
              className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div>
            <label htmlFor={idUsuario} className="block mb-1.5 text-label font-medium text-secondary">
              Usuário
            </label>
            <input
              id={idUsuario}
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? idErro : undefined}
              className={CAMPO}
            />
          </div>

          <div>
            <label htmlFor={idSenha} className="block mb-1.5 text-label font-medium text-secondary">
              Senha
            </label>
            <div className="relative">
              <input
                id={idSenha}
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? idErro : undefined}
                className={`${CAMPO} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showPwd}
                className="absolute right-1 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center
                           rounded-md text-muted transition-colors hover:text-text
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {showPwd ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div id={idErro} role="alert"
                 className="flex items-start gap-2 rounded-md border border-red/30 bg-red/10 px-3 py-2.5">
              <WarningCircle size={16} weight="fill" aria-hidden="true" className="mt-px flex-shrink-0 text-red" />
              <p className="text-label leading-snug text-text">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={loading || success || !username.trim() || !password}
          >
            {loading || success
              ? <>
                  <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {success ? 'Entrando…' : 'Verificando…'}
                </>
              : 'Entrar'}
          </Button>
        </form>

        <p className="mt-6 text-center text-caption text-muted">
          Cabonnet ISP · Sistema Interno · v{__APP_VERSION__}
        </p>
      </div>
    </main>
  )
}
