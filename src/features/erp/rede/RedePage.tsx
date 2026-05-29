// @ts-nocheck
import { useState } from 'react'
import {
  Activity, RefreshCw, Server, WifiOff,
  Network, ChevronDown, ChevronRight, Users,
} from 'lucide-react'
import { useZabbixAnalytics } from '../../../hooks/useZabbixAnalytics'

function fmtSync(d) {
  if (!d) return '—'
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function KpiCard({ label, value, sub, icon: Icon, color = 'text-primary', loading }) {
  return (
    <div className="rounded-xl border border-border bg-surface/30 p-4 flex items-start gap-3">
      <div className={`mt-0.5 shrink-0 ${color}`}><Icon size={18} /></div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 mb-1 truncate">{label}</p>
        {loading
          ? <div className="h-6 w-16 rounded bg-surface animate-pulse" />
          : <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
        }
        {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, sync, onRefresh }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        {sync && <span>sync {fmtSync(sync)}</span>}
        {onRefresh && (
          <button onClick={onRefresh} className="hover:text-zinc-300 transition-colors">
            <RefreshCw size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

function ErrorBanner({ msg }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-400">
      <WifiOff size={13} />
      <span>{msg}</span>
    </div>
  )
}

function SummaryRow({ assinantes, pppoe }) {
  const total      = assinantes.data?.total ?? null
  const pct        = assinantes.data?.pct   ?? null
  const pppoeTotal = pppoe.data?.grand_total ?? null

  const kpis = [
    {
      label: 'Assinantes Ativos',
      value: total != null ? total.toLocaleString('pt-BR') : '—',
      sub:   pct   != null ? `${pct}% de utilização` : null,
      icon:  Users,
      color: 'text-primary',
      loading: assinantes.loading,
    },
    {
      label: 'Conexões PPPoE / VLAN',
      value: pppoeTotal != null ? pppoeTotal.toLocaleString('pt-BR') : '—',
      sub:   'por roteador BGP Vale',
      icon:  Network,
      color: 'text-blue-400',
      loading: pppoe.loading,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {kpis.map(k => <KpiCard key={k.label} {...k} />)}
    </div>
  )
}

function PppoePanel({ pppoe }) {
  const [expandedHost, setExpandedHost] = useState(null)
  const d = pppoe.data

  const grandTotal = d?.grand_total ?? 0
  const hosts      = d?.hosts ?? []
  const maxTotal   = hosts[0]?.total ?? 1

  return (
    <div className="rounded-xl border border-border bg-surface/20 p-5">
      <SectionTitle icon={Network} title="PPPoE Conexões Ativas · por VLAN" sync={pppoe.lastSync} onRefresh={pppoe.refresh} />

      {pppoe.error && <ErrorBanner msg={pppoe.error} />}

      {!pppoe.loading && (
        <div className="flex items-end gap-4 mb-5">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Total geral</p>
            <p className="text-4xl font-bold tabular-nums text-primary tracking-tight">
              {grandTotal.toLocaleString('pt-BR')}
            </p>
          </div>
          <p className="text-xs text-zinc-500 mb-2">conexões ativas</p>
          {hosts.length > 0 && (
            <p className="text-xs text-zinc-500 mb-2 ml-auto">
              {hosts.length} host{hosts.length > 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {pppoe.loading && (
        <div className="mb-5">
          <div className="h-10 w-32 rounded bg-surface animate-pulse mb-2" />
          <div className="h-4 w-24 rounded bg-surface/30 animate-pulse" />
        </div>
      )}

      {!pppoe.loading && hosts.length > 0 && (
        <div className="space-y-3">
          {hosts.map((h, idx) => {
            const pct      = Math.round((h.total / maxTotal) * 100)
            const expanded = expandedHost === idx
            const maxVlan  = h.vlans[0]?.conexoes ?? 1

            return (
              <div key={h.host} className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setExpandedHost(expanded ? null : idx)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface/30 transition-colors"
                >
                  <Server size={13} className="text-primary shrink-0" />
                  <span className="text-sm font-medium text-zinc-200 flex-1 text-left truncate">{h.host}</span>
                  <span className="text-sm font-semibold tabular-nums text-primary mr-3">
                    {h.total.toLocaleString('pt-BR')}
                  </span>
                  {expanded ? <ChevronDown size={13} className="text-zinc-500 shrink-0" /> : <ChevronRight size={13} className="text-zinc-500 shrink-0" />}
                </button>

                <div className="h-1 bg-surface/30">
                  <div className="h-full bg-primary/60 transition-all" style={{ width: `${pct}%` }} />
                </div>

                {expanded && (
                  <div className="px-4 py-3 border-t border-border/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 max-h-72 overflow-y-auto">
                      {h.vlans.map(v => {
                        const vPct = Math.round((v.conexoes / maxVlan) * 100)
                        const color = v.conexoes === 0
                          ? 'text-zinc-600'
                          : vPct > 80 ? 'text-orange-400' : 'text-zinc-300'
                        return (
                          <div key={v.vlan} className="flex items-center gap-2 text-xs">
                            <span className="text-zinc-500 w-16 shrink-0 font-mono">VLAN {v.vlan}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${vPct > 80 ? 'bg-orange-500/70' : 'bg-primary/50'}`}
                                style={{ width: `${vPct}%` }}
                              />
                            </div>
                            <span className={`w-12 text-right tabular-nums shrink-0 ${color}`}>
                              {v.conexoes.toLocaleString('pt-BR')}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {pppoe.loading && (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-14 rounded-lg bg-surface/30 animate-pulse" />)}
        </div>
      )}

      {!pppoe.loading && !pppoe.error && hosts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
          <Network size={28} className="mb-2" />
          <p className="text-sm">Nenhum item PPPoE encontrado</p>
        </div>
      )}
    </div>
  )
}

export default function RedePage() {
  const analytics = useZabbixAnalytics()

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white flex items-center gap-2">
            <Activity size={18} className="text-primary" />
            Monitoramento de Rede
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Zabbix · Vale do Paraíba · atualização automática
          </p>
        </div>
        {!analytics.loading && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>ao vivo</span>
          </div>
        )}
      </div>

      <SummaryRow
        assinantes={analytics.assinantes}
        pppoe={analytics.pppoe}
      />

      <PppoePanel pppoe={analytics.pppoe} />
    </div>
  )
}
