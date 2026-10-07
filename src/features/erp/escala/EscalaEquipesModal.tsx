import { useState } from 'react'
import { Warning } from '@phosphor-icons/react'
import { Modal } from '../../../components/ui/Modal'
import { Switch } from '../../../components/ui/radix-switch'
import { useEscalaEquipes } from '../../../hooks/useEscala'
import { EMPRESA_LABEL, EMPRESA_COLOR, type Empresa } from './escalaConstants'

const ORDEM: Empresa[] = ['INSTACABLE', 'THM', 'WES', 'PROPRIA']

/** Liga/desliga equipes da escala. Equipe desligada some da grade, do resumo e da
 *  imagem; o que já foi lançado para ela é mantido e volta se for religada. */
export function EscalaEquipesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { todas, inativas, setAtiva } = useEscalaEquipes()
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  async function alternar(codigo: string, ativo: boolean) {
    setSalvando(codigo)
    setErro('')
    try {
      await setAtiva(codigo, ativo)
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : 'Não foi possível salvar. Tente novamente.')
    } finally {
      setSalvando(null)
    }
  }

  const ativas = todas.length - inativas.size

  return (
    <Modal open={open} onClose={onClose} maxWidth="520px"
           title="Gerenciar equipes"
           subtitle={`${ativas} de ${todas.length} ativas · equipe desligada some da escala e o histórico fica guardado`}>
      <div className="px-6 py-5">
        {erro && (
          <div role="alert" className="mb-3 flex items-center gap-2 rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-label text-red">
            <Warning size={15} /> {erro}
          </div>
        )}

        <div className="space-y-4">
          {ORDEM.map(empresa => {
            const lista = todas.filter(e => e.empresa === empresa)
            if (!lista.length) return null
            return (
              <section key={empresa}>
                <p className="mb-1.5 flex items-center gap-1.5 text-caption font-bold uppercase tracking-label text-muted">
                  <span className="h-2 w-2 rounded-sm" style={{ background: EMPRESA_COLOR[empresa] }} />{EMPRESA_LABEL[empresa]}
                </p>
                <ul className="divide-y divide-hairline rounded-xl border border-subtle">
                  {lista.map(e => {
                    const ativo = !inativas.has(e.codigo)
                    return (
                      <li key={e.codigo} className="flex items-center gap-3 px-3 py-2">
                        <div className={`min-w-0 flex-1 ${ativo ? '' : 'opacity-50'}`}>
                          <p className="truncate text-label font-semibold text-text">{e.codigo}{e.tecnico ? ` — ${e.tecnico}` : ''}</p>
                          <p className="truncate text-caption text-muted">{e.clusterBase}</p>
                        </div>
                        <span className="w-16 text-right text-caption text-muted">{ativo ? 'Ativa' : 'Desligada'}</span>
                        <Switch checked={ativo} disabled={salvando === e.codigo}
                                aria-label={`${ativo ? 'Desligar' : 'Ligar'} ${e.codigo}`}
                                onCheckedChange={next => alternar(e.codigo, next)} />
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
