import { useState, useEffect } from 'react'
import { Send, Bell, BellOff, Trash2, CheckCheck, Settings, AlertTriangle, Clock, TrendingUp, MapPin } from 'lucide-react'
import { useTelegramStore } from '../../store/telegramStore'
import { telegram } from '../../lib/api'
import { Badge } from '../../components/ui/Badge'

const ICON_MAP = {
  'alert-triangle': AlertTriangle,
  'alert-circle':   AlertTriangle,
  'clock':          Clock,
  'trending-up':    TrendingUp,
  'map-pin':        MapPin,
}

const NIVEL_COR = { critico: 'red', atencao: 'yellow', info: 'cyan' }

export function TelegramIndicator() {
  const { enabled, history } = useTelegramStore()
  const naoLidos = history.filter((a: any) => !a.lido).length

  return (
    <div className="flex items-center gap-1.5">
      <Send size={12} className={enabled ? 'text-green' : 'text-muted'} />
      <span className={`text-[10px] font-semibold ${enabled ? 'text-green' : 'text-muted'}`}>
        {enabled ? 'TG' : 'TG off'}
      </span>
      {naoLidos > 0 && (
        <span className="w-4 h-4 rounded-full bg-red text-white text-[9px] font-bold flex items-center justify-center">
          {naoLidos > 9 ? '9+' : naoLidos}
        </span>
      )}
    </div>
  )
}

interface StatusMsg { ok: boolean; txt: string }
export default function TelegramPanel({ onClose }: { onClose: () => void }) {
  const store = useTelegramStore()
  const [tab,       setTab]       = useState('alertas')
  const [enviando,  setEnviando]  = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<StatusMsg | null>(null)

  useEffect(() => {
    telegram.status()
      .then((d: any) => store.setEnabled(d?.enabled === true))
      .catch(() => store.setEnabled(false))
  }, [])

  async function testar() {
    setEnviando('teste')
    try {
      await telegram.send('🔔 <b>CABONNET — Teste de Conexão</b>\nSistema de alertas funcionando corretamente.')
      setStatusMsg({ ok: true, txt: 'Mensagem enviada com sucesso!' })
    } catch {
      setStatusMsg({ ok: false, txt: 'Falha ao enviar. Verifique o token no servidor.' })
    } finally { setEnviando(null) }
  }

  async function enviarStatusNow() {
    setEnviando('status')
    try {
      await telegram.sendNow()
      setStatusMsg({ ok: true, txt: 'Status operacional enviado!' })
    } catch {
      setStatusMsg({ ok: false, txt: 'Erro ao enviar status.' })
    } finally { setEnviando(null) }
  }

  const naoLidos = store.history.filter((a: any) => !a.lido).length

  return (
    <div className="bg-card border border-white/[0.09] rounded-xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.07]">
        <Send size={15} className={store.enabled ? 'text-green' : 'text-muted'} />
        <div className="flex-1">
          <p className="font-bold text-[14px] text-text">Alertas & Telegram</p>
          <p className={`text-[10px] ${store.enabled ? 'text-green' : 'text-muted'}`}>
            {store.enabled ? '● Bot configurado e ativo' : '● Bot não configurado no servidor'}
          </p>
        </div>
        <button onClick={() => store.setAtivo(!store.ativo)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
            ${store.ativo ? 'bg-green/15 text-green border border-green/30' : 'bg-white/[0.05] text-muted border border-white/[0.08] hover:text-secondary'}`}
        >
          {store.ativo ? <><Bell size={11} /> Ativo</> : <><BellOff size={11} /> Inativo</>}
        </button>
        <button onClick={onClose} className="text-muted hover:text-text text-lg leading-none">×</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.07]">
        {[['alertas', `Histórico${naoLidos ? ` (${naoLidos})` : ''}`], ['config', 'Configurações']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2.5 text-[11px] font-bold transition-colors
              ${tab === id ? 'text-primary border-b-2 border-primary' : 'text-muted hover:text-secondary'}`}
          >{label}</button>
        ))}
      </div>

      {/* Tab: Histórico */}
      {tab === 'alertas' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.05]">
            <span className="text-[10px] text-muted uppercase tracking-wide">{store.history.length} alertas</span>
            <div className="flex gap-2">
              {naoLidos > 0 && (
                <button onClick={store.markAllRead} className="flex items-center gap-1 text-[10px] text-cyan hover:text-primary transition-colors">
                  <CheckCheck size={10} /> Marcar todos lidos
                </button>
              )}
              {store.history.length > 0 && (
                <button onClick={store.clearHistory} className="flex items-center gap-1 text-[10px] text-red/70 hover:text-red transition-colors">
                  <Trash2 size={10} /> Limpar
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
            {store.history.length === 0 ? (
              <div className="py-12 text-center">
                <Bell size={32} className="mx-auto text-muted/30 mb-3" />
                <p className="text-[12px] text-muted">Nenhum alerta registrado ainda.</p>
                <p className="text-[10px] text-muted/60 mt-1">Ative o motor para começar o monitoramento.</p>
              </div>
            ) : store.history.map((a: any, i: number) => {
              const Icon = (ICON_MAP as Record<string, any>)[a.icon] ?? Bell
              const cor  = (NIVEL_COR as Record<string, string>)[a.nivel] ?? 'secondary'
              const ts   = new Date(a.ts)
              return (
                <div key={i} className={`flex items-start gap-3 px-4 py-3 ${!a.lido ? 'bg-white/[0.015]' : ''}`}>
                  <Icon size={13} className={`text-${cor} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant={cor}>{a.nivel}</Badge>
                      <span className="text-[11px] font-semibold text-text truncate">{a.titulo}</span>
                      {!a.lido && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                    </div>
                    <p className="text-[10px] text-muted">{a.msg}</p>
                  </div>
                  <span className="text-[10px] text-muted/60 flex-shrink-0 tabular-nums">
                    {ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tab: Configurações */}
      {tab === 'config' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Status do bot */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${store.enabled ? 'bg-green/[0.07] border-green/25' : 'bg-white/[0.03] border-white/[0.07]'}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${store.enabled ? 'bg-green' : 'bg-muted'}`} />
            <div className="flex-1">
              <p className="text-[11px] font-bold text-text">{store.enabled ? 'Bot Telegram configurado' : 'Bot não configurado'}</p>
              <p className="text-[10px] text-muted">Token e chat_id definidos em .env no servidor</p>
            </div>
          </div>

          {/* Nível de verbosidade */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted block mb-2">
              <Settings size={9} className="inline mr-1" /> Nível de Alertas Telegram
            </label>
            <div className="flex flex-col gap-1.5">
              {[['critico','🔴 Apenas críticos'],['atencao','🟡 Críticos + Atenção'],['todos','🔵 Todos']].map(([v, l]) => (
                <button key={v} onClick={() => store.setNivel(v)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-[11px] transition-all
                    ${store.nivel === v ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/[0.07] text-muted hover:text-secondary'}`}
                >{l}</button>
              ))}
            </div>
          </div>

          {/* Alertas de aging individual */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted block mb-2">Alertas OS Individuais</label>
            <div className="flex items-center justify-between px-3 py-2.5 bg-surface border border-white/[0.07] rounded-lg">
              <div>
                <p className="text-[11px] font-semibold text-text">OS com SLA vencido</p>
                <p className="text-[10px] text-muted">Até 3 OS por ciclo de verificação</p>
              </div>
              <button onClick={() => store.setAlertaAging(!store.alertaAging)}
                className={`w-9 h-5 rounded-full transition-all relative ${store.alertaAging ? 'bg-primary' : 'bg-white/[0.12]'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${store.alertaAging ? 'left-4' : 'left-0.5'}`} />
              </button>
            </div>
          </div>

          {/* Thresholds */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-muted block mb-1.5">Fila Alta (OS)</label>
              <input type="number" min={5} max={500} value={store.filaThreshold}
                onChange={e => store.setFilaThreshold(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-[12px] bg-surface border border-white/[0.08] rounded-lg text-text outline-none focus:border-primary/40"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-muted block mb-1.5">Intervalo (min)</label>
              <input type="number" min={1} max={60} value={store.pollMin}
                onChange={e => store.setPollMin(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-[12px] bg-surface border border-white/[0.08] rounded-lg text-text outline-none focus:border-primary/40"
              />
            </div>
          </div>

          {/* Feedback */}
          {statusMsg && (
            <div className={`px-3 py-2 rounded-lg text-[11px] font-semibold ${statusMsg.ok ? 'bg-green/10 text-green border border-green/25' : 'bg-red/10 text-red border border-red/25'}`}>
              {statusMsg.txt}
            </div>
          )}

          {/* Botões de ação */}
          <div className="flex flex-col gap-2 pt-1">
            <button onClick={testar} disabled={!!enviando}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary/15 border border-primary/30 text-primary text-[12px] font-bold hover:bg-primary/25 transition-all disabled:opacity-50"
            >
              <Send size={12} /> {enviando === 'teste' ? 'Enviando…' : 'Enviar mensagem de teste'}
            </button>
            <button onClick={enviarStatusNow} disabled={!!enviando}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-secondary text-[12px] font-bold hover:bg-white/[0.08] transition-all disabled:opacity-50"
            >
              <Bell size={12} /> {enviando === 'status' ? 'Enviando…' : 'Enviar status operacional agora'}
            </button>
          </div>

        </div>
      )}
    </div>
  )
}
