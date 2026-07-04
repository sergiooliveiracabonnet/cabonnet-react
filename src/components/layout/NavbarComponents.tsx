import { useState, useEffect, useRef, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { RefreshCw, ChevronDown, Clock, AlertTriangle, Bell, History, Sparkles, ExternalLink, X as XIcon } from 'lucide-react'
import { aiStatus } from '../../lib/api'
import { useUIStore } from '../../store/uiStore'
import { useOSDerived } from '../../contexts/OSDataContext'
import { useAuditStore } from '../../store/auditStore'
import { shortEquipe } from '../../lib/osFormat'
import { useAlertStore } from '../../store/alertStore'
import type { FiredAlert } from '../../hooks/useAlerts'
import type { OSRow } from '../../lib/types'

const INTERVALS: { value: number | null; label: string }[] = [
  { value: null, label: 'Manual'  },
  { value: 5,    label: '5 min'   },
  { value: 10,   label: '10 min'  },
  { value: 15,   label: '15 min'  },
  { value: 20,   label: '20 min'  },
]

function fmtHora(ms: number | null | undefined): string {
  if (!ms) return '--:--'
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function fmtAgeLabel(ms: number | null | undefined): string {
  if (!ms) return 'nunca atualizado'
  const ago = Math.floor((Date.now() - ms) / 1000)
  if (ago < 60)  return `atualizado há ${ago}s`
  if (ago < 3600) return `atualizado há ${Math.floor(ago / 60)}min`
  return `atualizado às ${fmtHora(ms)}`
}

function fmtCountdown(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function severityCls(s: string): string {
  if (s === 'critical') return 'text-red'
  if (s === 'warning')  return 'text-yellow'
  return 'text-cyan'
}

// ─── RefreshControl ───────────────────────────────────────────────────────────

export const RefreshControl = memo(function RefreshControl() {
  const qc = useQueryClient()
  const { isLoading, dataUpdatedAt } = useOSDerived()
  const triggerGlobalRefresh = useUIStore(s => s.triggerGlobalRefresh)

  const [interval,  setIntervalVal] = useState<number | null>(null)
  const [countdown, setCountdown]   = useState(0)
  const [showMenu,  setShowMenu]    = useState(false)
  const [spinning,  setSpinning]    = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!interval) { setCountdown(0); return }
    const totalSecs = interval * 60
    setCountdown(totalSecs)

    const refreshId = setInterval(() => {
      qc.refetchQueries({ queryKey: ['os-query'] }).then(() => setCountdown(totalSecs))
      triggerGlobalRefresh()
    }, totalSecs * 1000)

    const tickId = setInterval(() => {
      setCountdown(c => (c > 0 ? c - 1 : 0))
    }, 1000)

    return () => { clearInterval(refreshId); clearInterval(tickId) }
  }, [interval, qc, triggerGlobalRefresh])

  useEffect(() => {
    if (!showMenu) return
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showMenu])

  useEffect(() => {
    if (isLoading) { setSpinning(true); return }
    const t = setTimeout(() => setSpinning(false), 600)
    return () => clearTimeout(t)
  }, [isLoading])

  function handleRefresh() {
    qc.refetchQueries({ queryKey: ['os-query'] }).then(() => {
      if (interval) setCountdown(interval * 60)
    })
    triggerGlobalRefresh()
    setShowMenu(false)
  }

  const urgent   = interval && countdown <= 30
  const btnLabel = interval ? fmtCountdown(countdown) : fmtHora(dataUpdatedAt as number | undefined)

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <button
        onClick={() => setShowMenu(v => !v)}
        aria-label={interval ? `Auto-refresh em ${fmtCountdown(countdown)}` : fmtAgeLabel(dataUpdatedAt as number | undefined)}
        title={fmtAgeLabel(dataUpdatedAt as number | undefined)}
        className={`flex items-center gap-1.5 h-8 px-2.5 rounded-md border
                    transition-all duration-fast
                    ${urgent
                      ? 'border-yellow/40 text-yellow bg-yellow/5 hover:bg-yellow/10'
                      : 'border-white/[0.08] text-secondary hover:border-muted/40 hover:text-text'}`}
      >
        <RefreshCw size={12} className={`flex-shrink-0 ${spinning ? 'animate-spin' : ''}`} />
        <span className="text-[11px] font-mono tabular-nums w-[36px] text-center">{btnLabel}</span>
        <ChevronDown size={10} className={`transition-transform ${showMenu ? 'rotate-180' : ''}`} />
      </button>

      {showMenu && (
        <div className="absolute right-0 top-10 z-50 w-52
                        bg-elevated border border-white/[0.08] rounded-lg shadow-accent overflow-hidden">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="w-full flex items-center gap-2.5 px-3 py-2.5
                       text-[11px] font-semibold text-primary hover:bg-primary/10
                       border-b border-white/[0.08] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Atualizar agora
          </button>
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.08]">
            <div className="flex items-center gap-1.5">
              <Clock size={10} className="text-muted" />
              <span className="text-[11px] text-muted">
                <span className="font-mono text-secondary">{fmtAgeLabel(dataUpdatedAt as number | undefined)}</span>
              </span>
            </div>
            {interval && (
              <span className={`text-[11px] font-mono font-bold tabular-nums ${urgent ? 'text-yellow' : 'text-muted'}`}>
                -{fmtCountdown(countdown)}
              </span>
            )}
          </div>
          <div className="px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2">Auto-refresh</p>
            {INTERVALS.map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => { setIntervalVal(opt.value); setShowMenu(false) }}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md
                            text-[12px] transition-colors
                            ${interval === opt.value
                              ? 'bg-primary/15 text-primary font-semibold'
                              : 'text-secondary hover:bg-surface/40'}`}
              >
                {opt.label}
                {interval === opt.value && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

// ─── AI Status Badge ─────────────────────────────────────────────────────────

export function AIStatusBadge() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey:        ['ai-status'],
    queryFn:         aiStatus,
    staleTime:       5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry:           false,
  })

  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  type AIStatusData = { valid?: boolean; status?: string; reason?: string; model?: string; console_url?: string; usage?: { calls: number; errors: number; input_tokens: number; output_tokens: number; total_tokens: number; cost_usd: number; cost_brl: number } }
  const d        = data as AIStatusData | undefined
  const valid    = d?.valid ?? null
  const connStatus = d?.status ?? null
  const usage    = d?.usage
  const noConn   = connStatus === 'no_connection'
  const dotCls   = isLoading
    ? 'bg-muted animate-pulse'
    : valid
    ? 'bg-green'
    : noConn
    ? 'bg-orange'
    : 'bg-red'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Status da API Anthropic"
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface transition-colors"
      >
        <Sparkles size={13} className={valid ? 'text-green' : noConn ? 'text-orange' : valid === false ? 'text-red' : 'text-muted'} />
        <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-[600] w-72 animate-fade-in">
          <div className="bg-elevated border border-white/[0.10] rounded-2xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Sparkles size={13} className="text-primary" />
                <span className="text-[12px] font-bold text-text">Anthropic API</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-text transition-colors">
                <XIcon size={13} />
              </button>
            </div>

            {/* Status */}
            <div className="px-4 py-3 border-b border-white/[0.05]">
              {isLoading ? (
                <p className="text-[11px] text-muted animate-pulse">Verificando chave…</p>
              ) : valid ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green" />
                  <span className="text-[12px] text-green font-semibold">Chave válida</span>
                  <span className="text-[10px] text-muted ml-auto">{d?.model?.replace('claude-', 'Claude ')}</span>
                </div>
              ) : noConn ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange flex-shrink-0" />
                    <span className="text-[12px] text-orange font-semibold">Sem conexão com a Anthropic</span>
                  </div>
                  {d?.reason && (
                    <p className="text-[10px] text-muted/70 pl-4">{d.reason}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red flex-shrink-0" />
                    <span className="text-[12px] text-red font-semibold">Chave inválida</span>
                  </div>
                  {d?.reason && (
                    <p className="text-[10px] text-muted/70 pl-4">{d.reason}</p>
                  )}
                </div>
              )}
            </div>

            {/* Uso desta sessão */}
            {usage && (
              <div className="px-4 py-3 border-b border-white/[0.05] space-y-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.06em] text-muted">Esta sessão do servidor</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div>
                    <p className="text-[9px] text-muted">Chamadas</p>
                    <p className="text-[14px] font-mono font-bold text-text">{usage.calls}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted">Tokens totais</p>
                    <p className="text-[14px] font-mono font-bold text-text">{usage.total_tokens.toLocaleString('pt-BR')}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted">Custo estimado</p>
                    <p className="text-[14px] font-mono font-bold text-cyan">USD {usage.cost_usd.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted">Em reais (est.)</p>
                    <p className="text-[14px] font-mono font-bold text-cyan">R$ {usage.cost_brl.toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex justify-between text-[9px] text-muted/60 pt-1">
                  <span>Entrada: {usage.input_tokens.toLocaleString('pt-BR')} tokens</span>
                  <span>Saída: {usage.output_tokens.toLocaleString('pt-BR')} tokens</span>
                </div>
              </div>
            )}

            {/* Link para saldo real */}
            <div className="px-4 py-3">
              <p className="text-[10px] text-muted mb-2">
                O saldo real só está disponível no console da Anthropic.
              </p>
              <a
                href={d?.console_url ?? 'https://console.anthropic.com/settings/billing'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2 rounded-lg
                           bg-primary/10 border border-primary/30 text-primary text-[11px] font-semibold
                           hover:bg-primary/20 transition-colors"
              >
                Ver saldo no Console Anthropic
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SLA Críticas ─────────────────────────────────────────────────────────────

export function SlaCriticasBadge({ slaCriticas }: { slaCriticas: OSRow[] }) {
  const navigate = useNavigate()
  const [showAlerta, setShowAlerta] = useState(false)
  const alertaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showAlerta) return
    function onDown(e: MouseEvent) {
      if (alertaRef.current && !alertaRef.current.contains(e.target as Node)) setShowAlerta(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showAlerta])

  if (slaCriticas.length === 0) return null

  return (
    <div className="relative flex-shrink-0" ref={alertaRef}>
      <button
        onClick={() => setShowAlerta(v => !v)}
        aria-label={`${slaCriticas.length} OS com SLA 2× excedido`}
        aria-expanded={showAlerta}
        title={`${slaCriticas.length} OS com SLA 2× excedido`}
        className="relative w-8 h-8 rounded-md flex items-center justify-center
                   text-red bg-red/[0.08] hover:bg-red/[0.15] transition-all duration-fast"
      >
        <AlertTriangle size={14} />
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full
                         bg-red text-[10px] font-bold text-white flex items-center justify-center leading-none">
          {slaCriticas.length > 9 ? '9+' : slaCriticas.length}
        </span>
      </button>

      {showAlerta && (
        <div className="absolute right-0 top-10 z-50 w-80
                        bg-elevated border border-red/30 rounded-lg shadow-accent overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-red/20 bg-red/[0.06]">
            <AlertTriangle size={13} className="text-red flex-shrink-0" />
            <p className="text-[12px] font-bold text-red flex-1">
              {slaCriticas.length} OS com SLA 2× excedido
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.05]">
            {slaCriticas.map((os, i) => (
              <div key={(os.numos as string) ?? i} className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[12px] font-bold text-text font-mono">{os.numos as string}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[11px] font-bold text-red bg-red/10 px-1.5 py-0.5 rounded">
                      {(os._agingAbertura as number) ?? '?'}d aberta
                    </span>
                    {(os._diasAcimaSLA as number) > 0 && (
                      <span className="text-[11px] font-bold text-orange bg-orange/10 px-1.5 py-0.5 rounded">
                        +{os._diasAcimaSLA as number}d SLA
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-secondary truncate">{os.nomecliente as string}</p>
                <p className="text-[10px] text-muted mt-0.5">
                  {os.nomedacidade as string} · {shortEquipe(os.nomedaequipe as string) || 'Sem equipe'} · {os._slaTipoLabel as string}
                </p>
              </div>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-white/[0.08]">
            <button
              onClick={() => { navigate('/ordens'); setShowAlerta(false) }}
              className="w-full text-center text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              Ver todas em Ordens →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Motor de Alertas ─────────────────────────────────────────────────────────

export function AlertasEngineBadge({ alerts }: { alerts: FiredAlert[] }) {
  const { rules, updateRule, resetRules } = useAlertStore()
  const [alertsOpen, setAlertsOpen] = useState(false)
  const alertsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!alertsOpen) return
    function onDown(e: MouseEvent) {
      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) setAlertsOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [alertsOpen])

  const hasCritical = alerts.some(a => a.severity === 'critical')
  const hasWarning  = alerts.some(a => a.severity === 'warning')
  const bellCls     = hasCritical
    ? 'text-red bg-red/[0.08] hover:bg-red/[0.15]'
    : hasWarning
    ? 'text-yellow bg-yellow/[0.08] hover:bg-yellow/[0.15]'
    : alerts.length > 0
    ? 'text-cyan bg-cyan/[0.08] hover:bg-cyan/[0.15]'
    : 'text-secondary hover:text-text hover:bg-surface'

  return (
    <div className="relative flex-shrink-0" ref={alertsRef}>
      <button
        onClick={() => setAlertsOpen(v => !v)}
        title="Motor de alertas"
        className={`relative w-8 h-8 rounded-md flex items-center justify-center transition-all duration-fast ${bellCls}`}
      >
        <Bell size={14} />
        {alerts.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full
                           bg-yellow text-[10px] font-bold text-black flex items-center justify-center leading-none">
            {alerts.length > 9 ? '9+' : alerts.length}
          </span>
        )}
      </button>

      {alertsOpen && (
        <div className="absolute right-0 top-10 z-50 w-80
                        bg-elevated border border-white/[0.08] rounded-lg shadow-accent overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-white/[0.08] bg-surface/30">
            <span className="text-[12px] font-bold text-text">Motor de Alertas</span>
            <button onClick={resetRules} className="text-[10px] text-muted hover:text-secondary transition-colors">
              Restaurar padrões
            </button>
          </div>
          {alerts.length > 0 && (
            <div className="border-b border-white/[0.08]">
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted px-3 pt-2.5 pb-1.5">
                Ativos ({alerts.length})
              </p>
              {alerts.map(a => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.04]">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    a.severity === 'critical' ? 'bg-red' :
                    a.severity === 'warning'  ? 'bg-yellow' : 'bg-cyan'
                  }`} />
                  <span className="text-[11px] text-text flex-1 truncate">{a.label}</span>
                  <span className={`text-[11px] font-mono font-bold ${severityCls(a.severity)}`}>
                    {a.currentValue}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="px-3 py-2.5 space-y-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted">Regras</p>
            {rules.map(rule => (
              <div key={rule.id} className="flex items-center gap-2">
                <button
                  onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                  className={`relative inline-flex items-center w-7 h-4 rounded-full flex-shrink-0
                              transition-colors ${rule.enabled ? 'bg-primary' : 'bg-muted/25'}`}
                >
                  <span className={`absolute w-3 h-3 rounded-full bg-white shadow transition-transform
                                    ${rule.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                </button>
                <span className={`text-[11px] flex-1 truncate ${rule.enabled ? 'text-text' : 'text-muted'}`}>
                  {rule.label}
                </span>
                <span className="text-[10px] text-muted font-mono flex-shrink-0">{rule.operator}</span>
                <input
                  type="number"
                  value={rule.threshold}
                  onChange={e => updateRule(rule.id, { threshold: +e.target.value })}
                  className="w-12 text-[11px] font-mono text-right tabular-nums
                             bg-card border border-white/[0.08] rounded px-1.5 py-0.5
                             outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 text-text"
                />
              </div>
            ))}
          </div>
          {alerts.length === 0 && (
            <p className="text-[11px] text-muted text-center px-3 py-2 border-t border-white/[0.08]">
              Nenhuma regra disparada
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export function AuditLogBadge() {
  const { entries: auditEntries, clear: clearAudit } = useAuditStore()
  const [auditOpen, setAuditOpen] = useState(false)
  const auditRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!auditOpen) return
    function onDown(e: MouseEvent) {
      if (auditRef.current && !auditRef.current.contains(e.target as Node)) setAuditOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [auditOpen])

  return (
    <div className="relative flex-shrink-0" ref={auditRef}>
      <button
        onClick={() => setAuditOpen(v => !v)}
        title="Log de atividade"
        className={`relative w-8 h-8 rounded-md flex items-center justify-center transition-all duration-fast
          ${auditEntries.length > 0 ? 'text-muted hover:text-secondary hover:bg-surface' : 'text-disabled hover:text-muted hover:bg-surface'}`}
      >
        <History size={14} />
        {auditEntries.length > 0 && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />
        )}
      </button>

      {auditOpen && (
        <div className="absolute right-0 top-10 z-50 w-80
                        bg-elevated border border-white/[0.08] rounded-lg shadow-accent overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.08] bg-surface/30">
            <div className="flex items-center gap-2">
              <History size={12} className="text-muted" />
              <span className="text-[12px] font-bold text-text">Log de Atividade</span>
            </div>
            {auditEntries.length > 0 && (
              <button onClick={clearAudit} className="text-[10px] text-muted hover:text-secondary transition-colors">
                Limpar
              </button>
            )}
          </div>
          {auditEntries.length === 0 ? (
            <p className="text-[11px] text-muted text-center px-3 py-6 italic">
              Nenhuma ação registrada nesta sessão.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.04]">
              {auditEntries.map(e => {
                const catCls: Record<string, string> = {
                  kanban:    'bg-purple/10 text-purple',
                  export:    'bg-green/10 text-green',
                  telegram:  'bg-cyan/10 text-cyan',
                  fechamento:'bg-yellow/10 text-yellow',
                  auth:      'bg-primary/10 text-primary',
                  other:     'bg-surface text-muted',
                }
                return (
                  <div key={e.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${catCls[e.category] ?? catCls.other}`}>
                        {e.category}
                      </span>
                      <span className="text-[11px] font-semibold text-text flex-1 truncate">{e.action}</span>
                      <span className="text-[10px] font-mono text-muted flex-shrink-0">
                        {new Date(e.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {e.detail && (
                      <p className="text-[10px] text-muted truncate pl-1">{e.detail}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
