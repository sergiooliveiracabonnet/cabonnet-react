import { Fragment, useState } from 'react'
import { Shield, UserPlus, Key, Power, AlertTriangle } from 'lucide-react'
import { useUsuarios, useUsuariosActions } from '../../hooks/useUsuarios'
import { usePermissoes, usePermissoesActions } from '../../hooks/usePermissoes'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import type { UserRole, UsuarioItem } from '../../lib/api'
import { PageHeader } from '../../components/ui/PageHeader'

const ROLE_LABEL: Record<UserRole, string> = { gestor: 'Gestor', operador: 'Operador', viewer: 'Viewer' }

const inputCls = 'w-full rounded-lg px-3 py-2 text-body bg-surface/40 border border-white/[0.08] ' +
  'text-text outline-none focus:border-primary/40 transition-colors'

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Falha inesperada'
}

function NovoUsuarioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { create } = useUsuariosActions()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function reset() {
    setUsername(''); setPassword(''); setRole('viewer'); setError('')
  }

  async function handleSave() {
    if (!username.trim() || password.length < 6) {
      setError('Usuário obrigatório e senha com ao menos 6 caracteres')
      return
    }
    setSaving(true)
    setError('')
    try {
      await create({ username: username.trim(), password, role })
      reset()
      onClose()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Novo usuário" maxWidth="420px">
      <div className="space-y-3">
        <div>
          <label className="block text-caption font-medium text-secondary mb-1">Usuário</label>
          <input autoFocus value={username} onChange={e => setUsername(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-caption font-medium text-secondary mb-1">Senha</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-caption font-medium text-secondary mb-1">Papel</label>
          <select value={role} onChange={e => setRole(e.target.value as UserRole)} className={inputCls}>
            {(Object.keys(ROLE_LABEL) as UserRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        {error && <p className="text-label text-red flex items-center gap-1.5"><AlertTriangle size={12} /> {error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => { reset(); onClose() }}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : 'Criar'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function ResetSenhaModal({ user, onClose }: { user: UsuarioItem | null; onClose: () => void }) {
  const { resetPassword } = useUsuariosActions()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!user) return
    if (password.length < 6) { setError('Senha deve ter ao menos 6 caracteres'); return }
    setSaving(true)
    setError('')
    try {
      await resetPassword(user.id, password)
      setPassword('')
      onClose()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={!!user} onClose={() => { setPassword(''); setError(''); onClose() }}
           title={`Redefinir senha — ${user?.username ?? ''}`} maxWidth="380px">
      <div className="space-y-3">
        <input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)}
               placeholder="Nova senha" className={inputCls} />
        {error && <p className="text-label text-red flex items-center gap-1.5"><AlertTriangle size={12} /> {error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : 'Redefinir'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function PermissoesMatrix() {
  const { data, isLoading } = usePermissoes()
  const { set } = usePermissoesActions()
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')

  if (isLoading || !data) return <p className="text-label text-muted p-4">Carregando permissões…</p>

  const roles: UserRole[] = ['gestor', 'operador', 'viewer']

  async function toggle(role: UserRole, modulo: string) {
    if (role === 'gestor' || !data) return
    const atual = data.permissoes[role] ?? []
    const novo  = atual.includes(modulo) ? atual.filter(m => m !== modulo) : [...atual, modulo]
    const key   = `${role}:${modulo}`
    setPending(p => ({ ...p, [key]: true }))
    setError('')
    try {
      await set(role, novo)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setPending(p => ({ ...p, [key]: false }))
    }
  }

  return (
    <div>
      {error && <p className="text-label text-red flex items-center gap-1.5 mb-2"><AlertTriangle size={12} /> {error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-label">
          <thead>
            <tr className="border-b-2 border-white/[0.08]">
              <th className="px-3 py-2 text-left text-caption font-bold uppercase tracking-[0.6px] text-muted">Módulo</th>
              {roles.map(r => (
                <th key={r} className="px-3 py-2 text-center text-caption font-bold uppercase tracking-[0.6px] text-muted">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.modulos.map(m => (
              <tr key={m.key} className="border-b border-white/[0.05] hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-secondary">{m.label}</td>
                {roles.map(r => {
                  const checked  = r === 'gestor' ? true : (data.permissoes[r] ?? []).includes(m.key)
                  const disabled = r === 'gestor' || pending[`${r}:${m.key}`]
                  return (
                    <td key={r} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(r, m.key)}
                        className="w-3.5 h-3.5 accent-primary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function UsuariosPage() {
  const { data: usuariosList = [], isLoading } = useUsuarios()
  const { update } = useUsuariosActions()
  const [novoOpen, setNovoOpen] = useState(false)
  const [resetUser, setResetUser] = useState<UsuarioItem | null>(null)
  const [rowError, setRowError] = useState<{ id: number; msg: string } | null>(null)

  async function handleUpdate(u: UsuarioItem, body: { role?: UserRole; ativo?: boolean }) {
    setRowError(null)
    try {
      await update(u.id, body)
    } catch (e) {
      setRowError({ id: u.id, msg: errMsg(e) })
    }
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Usuários e Permissões"
        description="Cadastro de usuários e módulos liberados por papel"
        icon={Shield}
        actions={
          <Button variant="primary" size="sm" className="gap-1.5" onClick={() => setNovoOpen(true)}>
            <UserPlus size={14} /> Novo usuário
          </Button>
        }
      />

      <div className="rounded-xl bg-card border border-white/[0.08] overflow-hidden">
        {isLoading ? (
          <p className="text-label text-muted p-4">Carregando…</p>
        ) : usuariosList.length === 0 ? (
          <p className="text-label text-muted p-4">Nenhum usuário cadastrado</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-white/[0.08]">
                <th className="px-3 py-2 text-left text-caption font-bold uppercase tracking-[0.6px] text-muted">Usuário</th>
                <th className="px-3 py-2 text-left text-caption font-bold uppercase tracking-[0.6px] text-muted">Papel</th>
                <th className="px-3 py-2 text-left text-caption font-bold uppercase tracking-[0.6px] text-muted">Status</th>
                <th className="px-3 py-2 text-right text-caption font-bold uppercase tracking-[0.6px] text-muted">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuariosList.map(u => (
                <Fragment key={u.id}>
                  <tr className="border-b border-white/[0.05] hover:bg-white/[0.02] text-label">
                    <td className="px-3 py-2.5 text-text font-medium">{u.username}</td>
                    <td className="px-3 py-2.5">
                      <select
                        value={u.role}
                        onChange={e => handleUpdate(u, { role: e.target.value as UserRole })}
                        className="bg-transparent border border-white/[0.08] rounded-md px-2 py-1 text-caption text-text outline-none focus:border-primary/40"
                      >
                        {(Object.keys(ROLE_LABEL) as UserRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={u.ativo ? 'green' : 'red'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setResetUser(u)}
                          title="Redefinir senha"
                          className="p-1.5 rounded-md text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Key size={13} />
                        </button>
                        <button
                          onClick={() => handleUpdate(u, { ativo: !u.ativo })}
                          title={u.ativo ? 'Desativar' : 'Ativar'}
                          className={`p-1.5 rounded-md transition-colors ${
                            u.ativo ? 'text-muted hover:text-red hover:bg-red/10' : 'text-muted hover:text-green hover:bg-green/10'
                          }`}
                        >
                          <Power size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {rowError?.id === u.id && (
                    <tr>
                      <td colSpan={4} className="px-3 pb-2.5">
                        <p className="text-caption text-red flex items-center gap-1.5">
                          <AlertTriangle size={11} /> {rowError.msg}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl bg-card border border-white/[0.08] p-4">
        <h2 className="text-body font-semibold text-text mb-1">Permissões por papel</h2>
        <p className="text-caption text-muted mb-3">Gestor sempre tem acesso total a todos os módulos. Operador e Viewer são configuráveis abaixo.</p>
        <PermissoesMatrix />
      </div>

      <NovoUsuarioModal open={novoOpen} onClose={() => setNovoOpen(false)} />
      <ResetSenhaModal user={resetUser} onClose={() => setResetUser(null)} />
    </div>
  )
}
