// @ts-nocheck
import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Zap, Monitor, Settings, RefreshCw, Users, Layers, TrendingUp,
  Clipboard, GitMerge, Clock, AlertCircle, ChevronDown, ChevronRight,
  Trash2, Activity,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, ChartTooltip, Grid } from '../../components/ui/line-chart'
import { api, endpoints } from '../../lib/api'
import { transformJuniper } from '../../lib/builders'
import { useOSDerived } from '../../contexts/OSDataContext'
import { KPICard } from '../../components/ui/KPICard'
import { SectionTitle } from '../../components/ui/SectionTitle'
import { ChartCard } from '../../components/ui/ChartCard'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { SearchBox } from '../../components/ui/SearchBox'
import { KPIGridSkeleton } from '../../components/ui/Skeleton'


// Full class strings kept literal for Tailwind scanner
const STATUS_STYLE = {
  ok:    { text: 'text-green',  border: 'border-green/[0.20]',  bg: 'bg-green/[0.04]',  icon: 'bg-green/[0.10]'  },
  warn:  { text: 'text-yellow', border: 'border-yellow/[0.20]', bg: 'bg-yellow/[0.04]', icon: 'bg-yellow/[0.10]' },
  alert: { text: 'text-red',    border: 'border-red/[0.20]',    bg: 'bg-red/[0.04]',    icon: 'bg-red/[0.10]'    },
}
function getHeroStyle(nivel) {
  return STATUS_STYLE[nivel] ?? { text: 'text-muted', border: 'border-white/[0.08]', bg: '', icon: 'bg-white/[0.05]' }
}

// OS city urgency — full class strings for Tailwind scanner
const OS_URGENCY = [
  { min: 15, text: 'text-red',    bg: 'bg-red/[0.06]',    bar: 'bg-red'    },
  { min: 8,  text: 'text-orange', bg: 'bg-orange/[0.06]', bar: 'bg-orange' },
  { min: 4,  text: 'text-yellow', bg: 'bg-yellow/[0.06]', bar: 'bg-yellow' },
]
function getOsStyle(total) {
  for (const u of OS_URGENCY) if (total >= u.min) return u
  return { text: 'text-primary', bg: '', bar: 'bg-primary' }
}

function relTime(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60)    return `${diff}s atrás`
  if (diff < 3600)  return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return `${Math.floor(diff / 86400)}d atrás`
}

export default function JuniperPage() {
  const [fonte,        setFonte]        = useState('local')
  const [searchTable,  setSearchTable]  = useState('')
  const [viewMode,     setViewMode]     = useState('card')
  const [apiConfig,    setApiConfig]    = useState({ url: '', dsuid: '', user: '', pass: '', cluster: 'Vale' })
  const [expandedSnap, setExpandedSnap] = useState(null)

  const HISTORY_KEY = 'juniper_historico'
  const MAX_SNAPS   = 500

  const [historico, setHistorico] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') }
    catch { return [] }
  })

  const { data: raw, isLoading, refetch } = useQuery({
    queryKey: ['juniper', apiConfig.cluster],
    queryFn:  () => api.get(`${endpoints.juniper}?cluster=${encodeURIComponent(apiConfig.cluster)}`),
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
    retry: false,
  })

  const { data: serverHistData } = useQuery({
    queryKey: ['juniper-historico'],
    queryFn:  () => api.get(endpoints.juniperHist),
    staleTime: Infinity,
    retry: false,
  })

  const { allRows } = useOSDerived()
  const data       = useMemo(() => transformJuniper(raw), [raw])
  const hero       = data?.hero       ?? {}
  const kpis       = data?.kpis       ?? {}
  const interfaces = data?.interfaces ?? []
  const hist       = useMemo(() => {
    if (!historico.length) return { labels: [], values: [] }
    const sorted = [...historico].reverse()
    return {
      labels: sorted.map(s => `${s.data} ${s.hora}`),
      values: sorted.map(s => s.total),
    }
  }, [historico])
  const clientes  = data?.clientes ?? []
  const _log      = data?.log      ?? []
  const osCidades = useMemo(() => {
    const hoje   = new Date().toISOString().slice(0, 10)
    const isAtivo = r => ['Pendente', 'Atendimento'].includes(r._situacaoEfetiva ?? r.descsituacao)
    const isHoje  = r => (r.datacadastro || '').slice(0, 10) === hoje
    const cityMap = new Map()
    for (const r of allRows) {
      if (!isAtivo(r) || !isHoje(r)) continue
      const c = (r.nomedacidade || '').trim()
      if (c) cityMap.set(c, (cityMap.get(c) ?? 0) + 1)
    }
    return [...cityMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cidade, total]) => ({ cidade, total }))
  }, [allRows])
  const isStale  = data?.isStale  ?? false
  const hasAlert = data?.hasAlert ?? false

  useEffect(() => {
    if (!raw || !clientes.length) return
    const now = new Date()
    const entry = {
      ts:       now.toISOString(),
      hora:     now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      data:     now.toLocaleDateString('pt-BR'),
      total:    kpis.total  ?? clientes.length,
      online:   kpis.online ?? clientes.filter(c => c.state !== 'inactive').length,
      clientes: clientes,
    }
    setHistorico(prev => {
      if (prev[0]?.ts === entry.ts) return prev
      const next = [entry, ...prev].slice(0, MAX_SNAPS)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
      return next
    })
  }, [raw])

  const serverHistMergedRef = useRef(false)
  const histSaveRef         = useRef(false)

  useEffect(() => {
    if (serverHistMergedRef.current || !serverHistData) return
    serverHistMergedRef.current = true
    const serverSnaps = Array.isArray(serverHistData)
      ? serverHistData
      : Array.isArray(serverHistData?.historico)
        ? serverHistData.historico
        : []
    if (!serverSnaps.length) return
    setHistorico(prev => {
      const tsSet  = new Set(prev.map(s => s.ts))
      const extras = serverSnaps.filter(s => s.ts && !tsSet.has(s.ts))
      if (!extras.length) return prev
      const merged = [...prev, ...extras]
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, MAX_SNAPS)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(merged)) } catch { /* storage unavailable */ }
      return merged
    })
  }, [serverHistData])

  useEffect(() => {
    if (!histSaveRef.current) { histSaveRef.current = true; return }
    if (!historico.length) return
    api.post(endpoints.juniperHist, historico).catch(() => {})
  }, [historico])

  function limparHistorico() {
    localStorage.removeItem(HISTORY_KEY)
    api.post(endpoints.juniperHist, []).catch(() => {})
    setHistorico([])
  }

  const clientesFiltrados = clientes.filter(c => {
    const q = searchTable.toLowerCase()
    return !q
      || (c.usuario ?? '').toLowerCase().includes(q)
      || (c.ip      ?? '').toLowerCase().includes(q)
      || (c.mac     ?? '').toLowerCase().includes(q)
      || (c.iface   ?? '').toLowerCase().includes(q)
  })

  const heroStyle    = getHeroStyle(hero.nivel)
  const onlineCount  = kpis.online  ?? 0
  const offlineCount = kpis.offline ?? 0
  const maxIface     = interfaces.length ? Math.max(...interfaces.map(i => i.total), 1) : 1
  const maxOsCity    = osCidades.length  ? Math.max(...osCidades.map(c => c.total), 1)  : 1

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Zap size={16} className="text-primary" />
        <h2 className="font-headline text-xl font-semibold text-text">
          Juniper PPPoE — Validação de Clientes
        </h2>
        <div className="flex items-center gap-1.5 ml-1">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
          </span>
          <span className="text-[11px] text-muted">atualiza a cada 5 min</span>
        </div>
        {apiConfig.cluster && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-[1.5px] px-2.5 py-0.5
                           rounded-full bg-primary/10 text-primary border border-primary/20">
            {apiConfig.cluster}
          </span>
        )}
      </div>

      {/* ── Banner dados desatualizados ── */}
      {isStale && (
        <div className="flex items-center gap-3 px-4 py-3 bg-yellow/[0.08] border border-yellow/30 rounded-xl">
          <Clock size={16} className="text-yellow flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[12px] font-semibold text-yellow">Dados desatualizados</p>
            <p className="text-[11px] text-muted mt-0.5">A última coleta está defasada — verifique a conexão com o servidor.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw size={11} /> Atualizar agora
          </Button>
        </div>
      )}

      {/* ── Banner alerta crítico ── */}
      {hasAlert && (
        <div className="flex items-center gap-4 px-5 py-4 bg-red/[0.08] border-[1.5px] border-red/50 rounded-xl">
          <div className="relative flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red opacity-40" />
            <AlertCircle size={22} className="text-red relative" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-[13px] text-red">ALERTA — Sessões PPPoE problemáticas detectadas!</p>
            <p className="text-[11px] text-muted mt-0.5">Última verificação: {kpis.ultima ?? '—'}</p>
          </div>
          <Button variant="danger" size="sm" onClick={() => refetch()}>
            <RefreshCw size={11} /> Verificar
          </Button>
        </div>
      )}

      {/* ── Config API ── */}
      <div className="bg-card border border-white/[0.07] border-l-[4px] border-l-primary rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-bold uppercase tracking-[2px] text-primary/80 flex items-center gap-1.5">
            <Settings size={11} /> Fonte de Dados
          </p>
          <StatusPill nivel={hero.nivel} txt={hero.statusTxt ?? 'Não verificado'} />
        </div>

        {/* Segmented control */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex bg-white/[0.04] border border-white/[0.06] rounded-lg p-0.5 gap-0.5">
            {[['local', Monitor, 'Servidor Local'], ['api', Zap, 'Grafana API']].map(([v, Icon, l]) => (
              <button
                key={v}
                onClick={() => setFonte(v)}
                className={`flex items-center gap-1.5 text-[12px] font-semibold px-4 py-1.5 rounded-md transition-all duration-fast
                            ${fonte === v ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-secondary'}`}
              >
                <Icon size={13} /> {l}
              </button>
            ))}
          </div>
          {fonte === 'local' && (
            <span className="text-[11px] text-muted font-mono">localhost:5000</span>
          )}
        </div>

        {fonte === 'api' && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 animate-slide-down">
            {[
              { label: 'URL do Grafana', key: 'url',     placeholder: 'https://monitoramento.cabonnet.com.br' },
              { label: 'UID Datasource', key: 'dsuid',   placeholder: 'e5b84361-...' },
              { label: 'Usuário',        key: 'user',    placeholder: 'admin' },
              { label: 'Senha',          key: 'pass',    placeholder: '••••••••', type: 'password' },
              { label: 'Cluster',        key: 'cluster', placeholder: 'Vale' },
            ].map((f) => (
              <div key={f.key}>
                <label className="text-[11px] font-bold uppercase tracking-[0.8px] text-muted block mb-1">{f.label}</label>
                <input
                  type={f.type ?? 'text'}
                  value={apiConfig[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => setApiConfig(c => ({ ...c, [f.key]: e.target.value }))}
                  className="w-full px-3 py-1.5 text-[11px] rounded-lg bg-card-high border border-white/[0.08]
                             text-text outline-none focus:border-primary/40 transition-colors"
                />
              </div>
            ))}
            <div className="flex items-end">
              <Button variant="primary" size="sm">Salvar e Conectar</Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Hero status ── */}
      <div className={`${heroStyle.bg} border-2 ${heroStyle.border} rounded-xl p-6 transition-colors duration-normal`}>
        <div className="flex items-center gap-5 flex-wrap">
          {/* Icon with status ring */}
          <div className={`relative flex-shrink-0 p-3 rounded-2xl ${heroStyle.icon}`}>
            {hero.nivel === 'ok' && (
              <span className="absolute inset-0 rounded-2xl animate-ping bg-green/20" />
            )}
            <Zap size={40} className={`${heroStyle.text} relative`} />
          </div>

          <div className="flex-1 min-w-0">
            <p className={`font-headline font-bold text-[22px] ${heroStyle.text}`}>
              {hero.nivel_label ?? 'Sem conexão ativa'}
            </p>
            <p className="text-[12px] text-muted mt-1">
              {hero.desc ?? 'Configure a fonte acima para exibir clientes PPPoE'}
            </p>
            <p className="text-[11px] text-muted mt-1 font-mono">
              {hero.meta ?? 'Nenhuma coleta realizada ainda'}
            </p>
            {(onlineCount > 0 || offlineCount > 0) && (
              <div className="flex items-center gap-4 mt-3">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-green">
                  <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse inline-block" />
                  {onlineCount} online
                </span>
                {offlineCount > 0 && (
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                    <span className="w-1.5 h-1.5 rounded-full bg-red/50 inline-block" />
                    {offlineCount} offline
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="text-right">
            <p className={`font-headline font-bold text-[52px] leading-none tabular-nums ${heroStyle.text}`}>
              {kpis.total ?? '—'}
            </p>
            <p className="text-[11px] text-muted mt-1">clientes conectados</p>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      {isLoading ? <KPIGridSkeleton count={5} /> : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 stagger">
          <KPICard title="Total Conectados"   value={kpis.total}      sub="clientes PPPoE ativos"  accent="primary"   />
          <KPICard title="Interfaces Ativas"  value={kpis.interfaces} sub="portas / VLANs em uso"  accent="cyan"      />
          <KPICard title="IPs Únicos"         value={kpis.ips}        sub="endereços distintos"     accent="teal"      />
          <KPICard title="Última Coleta"      value={kpis.ultima}     sub="horário da verificação"  accent="secondary" />
          <KPICard title="Próx. Atualização"  value={kpis.proximo}    sub="inicia após 1ª coleta"   accent="muted"     />
        </div>
      )}

      {/* ── Distribuição por interface ── */}
      {interfaces.length > 0 && (
        <>
          <SectionTitle icon={Layers}>Distribuição por Interface</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {interfaces.map((iface) => {
              const pct = Math.round((iface.total / maxIface) * 100)
              return (
                <div key={iface.nome} className="bg-card border border-white/[0.07] rounded-xl p-4 flex flex-col gap-3">
                  <div>
                    <p className="text-[11px] font-bold text-text truncate mb-0.5">{iface.nome}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="font-mono font-bold text-2xl text-primary tabular-nums">{iface.total}</p>
                      <p className="text-[11px] text-muted">clientes</p>
                    </div>
                    {iface.online > 0 && (
                      <p className="text-[10px] text-green mt-0.5 font-semibold">{iface.online} online</p>
                    )}
                  </div>
                  <div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${pct}%`, transition: 'width 0.6s ease' }}
                      />
                    </div>
                    <p className="text-[10px] text-muted/50 mt-1 font-mono text-right">{pct}%</p>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Histórico gráfico ── */}
      <ChartCard title="Histórico de Conexões" dot="#0ea5e9" height="h-44">
        <AreaChart data={hist.labels.map((name, i) => ({ name, value: hist.values[i] ?? 0 }))}>
          <Area dataKey="value" stroke="#0ea5e9" fill="rgba(14,165,233,.1)" strokeWidth={2} />
          <XAxis dataKey="name" />
          <YAxis />
          <Grid />
          <ChartTooltip />
        </AreaChart>
      </ChartCard>

      {/* ── Tabela de clientes ── */}
      <div className="bg-card border border-white/[0.09] rounded-xl overflow-hidden shadow-lg">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.07] bg-white/[0.02] flex-wrap">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-primary" />
            <span className="text-[13px] font-bold text-text">Clientes Conectados</span>
          </div>
          <div className="flex items-center gap-3 ml-1">
            {(() => {
              const online  = clientesFiltrados.filter(c => c.state !== 'inactive').length
              const offline = clientesFiltrados.length - online
              return (
                <>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-green">
                    <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse inline-block" />
                    {online} online
                  </span>
                  {offline > 0 && (
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                      <span className="w-1.5 h-1.5 rounded-full bg-red/60 inline-block" />
                      {offline} offline
                    </span>
                  )}
                </>
              )
            })()}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <SearchBox
              value={searchTable}
              onChange={setSearchTable}
              placeholder="Buscar usuário, IP, MAC, interface…"
              className="max-w-[260px]"
            />
            <div className="flex bg-white/[0.04] border border-white/[0.06] rounded-md p-0.5 gap-0.5">
              {[['card', 'Cards'], ['table', 'Tabela']].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className={`text-[11px] px-3 py-1 rounded transition-all
                              ${viewMode === v ? 'bg-primary text-white' : 'text-muted hover:text-secondary'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {clientesFiltrados.length === 0 ? (
          <div className="py-16 text-center text-muted">
            <Zap size={40} className="mx-auto mb-4 opacity-20" />
            <p className="text-[14px] font-semibold text-secondary mb-2">Nenhum dado disponível</p>
            <p className="text-[12px]">Configure a fonte de dados acima.</p>
          </div>
        ) : viewMode === 'card' ? (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {clientesFiltrados.map((c, i) => {
              const isOnline = c.state !== 'inactive'
              return (
                <div key={i} className={`relative overflow-hidden rounded-xl border transition-all duration-200
                  hover:-translate-y-0.5 hover:shadow-2xl
                  ${isOnline
                    ? 'bg-gradient-to-br from-[#0f1b2d] via-surface to-primary/[0.07] border-primary/[0.18] hover:border-primary/40 hover:shadow-primary/10'
                    : 'bg-gradient-to-br from-[#1a0f0f] via-surface to-red/[0.05] border-white/[0.06] hover:border-red/25'}`}>

                  <div className={`absolute inset-x-0 top-0 h-[2px] ${isOnline
                    ? 'bg-gradient-to-r from-primary via-cyan-400/70 to-transparent'
                    : 'bg-gradient-to-r from-red/60 via-red/30 to-transparent'}`} />

                  <div className="p-4 pt-5">
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                            ${isOnline ? 'bg-green shadow-[0_0_6px_rgba(34,197,94,0.8)] animate-pulse' : 'bg-red/60'}`} />
                          <p className="text-[13px] font-bold text-text truncate uppercase antialiased leading-tight">{c.usuario}</p>
                        </div>
                        <p className="text-[11px] text-muted/60 ml-3.5 uppercase tracking-[0.9px] font-mono truncate">{c.iface}</p>
                      </div>
                      <span className={`flex-shrink-0 text-[8px] font-black px-2.5 py-1 rounded-full tracking-widest border
                        ${isOnline
                          ? 'bg-green/[0.10] text-green border-green/25'
                          : 'bg-red/[0.12] text-red border-red/25'}`}>
                        {isOnline ? '● ONLINE' : '● OFFLINE'}
                      </span>
                    </div>

                    <div className={`rounded-xl px-3 py-2.5 mb-3 border ${isOnline
                      ? 'bg-primary/[0.08] border-primary/[0.15]'
                      : 'bg-white/[0.02] border-white/[0.05]'}`}>
                      <p className="text-[8px] font-bold uppercase tracking-[1.2px] text-muted mb-1">Endereço IP</p>
                      <p className={`text-[15px] font-mono font-bold uppercase antialiased leading-none tracking-wide
                        ${isOnline ? 'text-primary' : 'text-secondary'}`}>{c.ip}</p>
                    </div>

                    {c.mac !== '—' && (
                      <div className="mb-3">
                        <p className="text-[8px] font-bold uppercase tracking-[1.2px] text-muted/60 mb-0.5">MAC Address</p>
                        <p className="text-[11px] font-mono text-secondary/80 uppercase tracking-wider">{c.mac}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.05] mt-1">
                      <div className="flex items-center gap-1.5">
                        {c.uptime !== '—' && (
                          <>
                            <Clock size={10} className="text-muted/50 flex-shrink-0" />
                            <span className="text-[11px] font-mono text-muted uppercase">{c.uptime}</span>
                          </>
                        )}
                      </div>
                      {c.loginTime !== '—' && (
                        <span className="text-[11px] text-muted/50 font-mono uppercase">{c.loginTime}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b-2 border-white/[0.08]">
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold text-muted uppercase tracking-[0.6px] w-8" />
                  {['Usuário', 'IP', 'MAC', 'Interface', 'Uptime'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold text-muted uppercase tracking-[0.6px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {clientesFiltrados.map((c, i) => {
                  const isOnline = c.state !== 'inactive'
                  return (
                    <tr key={i} className="text-secondary hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={`w-1.5 h-1.5 rounded-full inline-block
                                         ${isOnline ? 'bg-green animate-pulse' : 'bg-red/50'}`} />
                      </td>
                      <td className="px-4 py-2.5 font-bold text-text antialiased uppercase">{c.usuario}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-primary antialiased uppercase">{c.ip}</td>
                      <td className="px-4 py-2.5 font-mono text-[12px] uppercase">{c.mac}</td>
                      <td className="px-4 py-2.5 uppercase">{c.iface}</td>
                      <td className="px-4 py-2.5 uppercase">{c.uptime}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Histórico de snapshots ── */}
      <SectionTitle icon={Clipboard}>Histórico de Conexões PPPoE</SectionTitle>
      <div className="bg-card border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-muted" />
            <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted">
              {historico.length} snapshots
            </span>
            <span className="text-[10px] text-muted/40">· máx {MAX_SNAPS}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted/60">Salvo localmente</span>
            {historico.length > 0 && (
              <button
                onClick={limparHistorico}
                className="flex items-center gap-1 text-[11px] text-red/60 hover:text-red transition-colors"
                title="Limpar histórico"
              >
                <Trash2 size={10} /> Limpar
              </button>
            )}
          </div>
        </div>
        <div className="divide-y divide-white/[0.04] min-h-[120px] max-h-[600px] overflow-y-auto">
          {historico.length === 0 ? (
            <p className="text-center text-muted text-[12px] py-10">
              O histórico será salvo automaticamente a cada coleta (5 min).
            </p>
          ) : (
            historico.map((snap, i) => {
              const isOpen     = expandedSnap === i
              const onlinePct  = snap.total > 0 ? Math.round((snap.online / snap.total) * 100) : 0
              const relTxt     = relTime(snap.ts)
              return (
                <div key={i} className="border-b border-white/[0.04] last:border-0">
                  <button
                    onClick={() => setExpandedSnap(isOpen ? null : i)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
                  >
                    {isOpen
                      ? <ChevronDown size={12} className="text-muted flex-shrink-0" />
                      : <ChevronRight size={12} className="text-muted flex-shrink-0" />}

                    {/* Time block */}
                    <div className="flex-shrink-0 w-[72px]">
                      <p className="font-mono text-[12px] text-text">{snap.hora}</p>
                      {relTxt && <p className="text-[10px] text-muted/50">{relTxt}</p>}
                    </div>

                    <span className="text-[11px] text-muted w-[80px] flex-shrink-0">{snap.data}</span>

                    {/* Badges */}
                    <Badge variant="cyan">{snap.total} conectados</Badge>
                    <Badge variant="green">{snap.online} online</Badge>

                    {/* Online % mini bar */}
                    <div className="flex-1 max-w-[80px] hidden md:block">
                      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green rounded-full"
                          style={{ width: `${onlinePct}%` }}
                        />
                      </div>
                      <p className="text-[9px] text-muted/40 font-mono mt-0.5">{onlinePct}%</p>
                    </div>

                    <span className="text-[10px] text-muted ml-auto font-mono">
                      {(snap.clientes ?? []).length} reg.
                    </span>
                  </button>

                  {isOpen && (
                    <div className="overflow-x-auto border-t border-white/[0.04] bg-white/[0.015]">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-white/[0.06]">
                            {['Usuário', 'IP', 'MAC', 'Interface', 'Uptime', 'Login'].map(h => (
                              <th key={h} className="px-4 py-2 text-left text-[11px] font-bold text-muted uppercase tracking-[0.6px]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                          {(snap.clientes ?? []).map((c, ci) => (
                            <tr key={ci} className="hover:bg-primary/[0.04]">
                              <td className="px-4 py-2 font-bold text-text uppercase antialiased">{c.usuario}</td>
                              <td className="px-4 py-2 font-mono font-semibold text-primary uppercase antialiased">{c.ip}</td>
                              <td className="px-4 py-2 font-mono text-[12px] font-semibold text-text uppercase antialiased">{c.mac}</td>
                              <td className="px-4 py-2 text-secondary uppercase">{c.iface}</td>
                              <td className="px-4 py-2 text-muted uppercase">{c.uptime}</td>
                              <td className="px-4 py-2 text-muted uppercase">{c.loginTime}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Correlação OS × Cidade ── */}
      <SectionTitle icon={GitMerge}>Correlação — OS Técnicas Abertas por Cidade</SectionTitle>
      <div className="bg-card border border-white/[0.07] rounded-xl p-4">
        <p className="text-[11px] text-muted mb-4 leading-relaxed">
          Alta concentração de OS em uma cidade pode indicar degradação de infraestrutura — correlacione com alertas PPPoE.
        </p>
        {osCidades.length === 0 ? (
          <p className="text-center text-muted text-[12px] py-6">Nenhuma OS ativa hoje.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {osCidades.map((c) => {
              const style = getOsStyle(c.total)
              const pct   = Math.round((c.total / maxOsCity) * 100)
              return (
                <div key={c.cidade} className={`${style.bg} bg-surface border border-white/[0.06] rounded-xl p-3 flex flex-col gap-2`}>
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[11px] font-semibold text-text truncate flex-1">{c.cidade}</p>
                    <p className={`font-mono font-bold text-xl tabular-nums flex-shrink-0 ${style.text}`}>{c.total}</p>
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${style.bar}`}
                      style={{ width: `${pct}%`, transition: 'width 0.6s ease' }}
                    />
                  </div>
                  <p className="text-[10px] text-muted">OS abertas</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}

function StatusPill({ nivel, txt }) {
  const isOk   = nivel === 'ok'
  const isWarn = nivel === 'warn'
  const dot    = isOk ? 'bg-green' : isWarn ? 'bg-yellow' : 'bg-muted'
  const border = isOk ? 'border-green/20' : isWarn ? 'border-yellow/20' : 'border-white/[0.07]'
  return (
    <div className={`inline-flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-full
                    bg-card-high border ${border} text-secondary`}>
      <span className="relative flex h-2 w-2 flex-shrink-0">
        {isOk && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-60" />}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dot}`} />
      </span>
      {txt}
    </div>
  )
}
