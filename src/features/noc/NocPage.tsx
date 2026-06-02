import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import {
  Monitor, Pause, Play, X, Maximize2, Minimize2,
  Activity, Users, Package, AlertCircle,
} from 'lucide-react'
import { OSDataProvider, useOSDerived } from '../../contexts/OSDataContext'
import { isCOPE, isReagend } from '../../lib/transform'
import { shortEquipe } from '../../lib/osFormat'

const SLIDE_MS     = 30_000
const TOTAL_SLIDES = 3
const SLIDE_CONFIG = [
  { name: 'Operacional',   icon: Activity },
  { name: 'SLA & Equipes', icon: Users    },
  { name: 'Fornecedores',  icon: Package  },
]

// Full class strings kept literal so Tailwind scanner includes them
const ACCENT_CFG = {
  red:    { text: 'text-red',    bar: 'bg-red',    tint: 'bg-red/[0.04]'    },
  green:  { text: 'text-green',  bar: 'bg-green',  tint: 'bg-green/[0.04]'  },
  yellow: { text: 'text-yellow', bar: 'bg-yellow', tint: 'bg-yellow/[0.04]' },
  cyan:   { text: 'text-cyan',   bar: 'bg-cyan',   tint: 'bg-cyan/[0.04]'   },
  orange: { text: 'text-orange', bar: 'bg-orange', tint: 'bg-orange/[0.04]' },
}
function getAccent(a: string) {
  return (ACCENT_CFG as Record<string, { text: string; bar: string; tint: string }>)[a] ?? { text: 'text-text', bar: 'bg-surface', tint: '' }
}

const SEMAFORO_CFG = {
  ok:      { dot: 'bg-green',  bar: 'bg-green',  badge: 'bg-green/10 text-green',   label: 'OK'      },
  atencao: { dot: 'bg-yellow', bar: 'bg-yellow', badge: 'bg-yellow/10 text-yellow', label: 'Atenção' },
  critico: { dot: 'bg-red',    bar: 'bg-red',    badge: 'bg-red/10 text-red',       label: 'Crítico' },
}

function useNowClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

// ─── Slide 0 — Visão Operacional ─────────────────────────────────────────────

 
function SlideOperacional({ kpis, isLoading }: { kpis: any[]; isLoading: boolean }) {
  return (
    <div className="h-full p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-shrink-0">
        <Activity size={13} className="text-muted" />
        <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted/70">
          Visão Operacional
        </p>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-3 gap-4">
          {kpis.slice(0, 6).map(k => {
            const acc = getAccent(k.accent)
            return (
              <div
                key={k.id}
                className={`${acc.tint} bg-card border border-white/[0.08] rounded-xl
                             flex flex-col items-center justify-center gap-2 p-6 relative overflow-hidden`}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl ${acc.bar}`} />
                <p className="text-[10px] font-bold text-muted uppercase tracking-[0.08em] text-center">
                  {k.title}
                </p>
                <p className={`font-mono text-7xl font-bold tabular-nums ${acc.text}`}>
                  {k.value}
                </p>
                {k.sub && (
                  <p className="text-[11px] text-muted text-center leading-relaxed">{k.sub}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Slide 1 — SLA & Equipes ─────────────────────────────────────────────────

 
function SlideEquipes({ semaforo, slaCriticas }: { semaforo: any[]; slaCriticas: any[] }) {
  return (
    <div className="h-full p-6 grid grid-cols-2 gap-6 overflow-hidden">
      {/* Semáforo */}
      <div className="flex flex-col gap-2.5 overflow-y-auto">
        <div className="flex items-center gap-2 flex-shrink-0 mb-0.5">
          <Users size={13} className="text-muted" />
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted/70">
            Semáforo por Equipe
          </p>
        </div>
        {semaforo.length === 0 && (
          <p className="text-muted text-[12px] py-4">Sem dados de equipes</p>
        )}
        {semaforo.map(eq => {
          const cfg = (SEMAFORO_CFG as Record<string, typeof SEMAFORO_CFG.critico>)[eq.status] ?? SEMAFORO_CFG.critico
          const total = (eq.fila ?? 0) + (eq.concl ?? 0)
          return (
            <div
              key={eq.nome}
              className="flex items-center gap-3 bg-card border border-white/[0.08]
                         rounded-xl px-4 py-3.5 relative overflow-hidden"
            >
              <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl ${cfg.bar}`} />
              <span className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
              <span className="text-[13px] font-semibold text-text flex-1 truncate">{eq.nome}</span>
              <span className="font-mono text-[12px] text-secondary tabular-nums">{eq.concl}/{total}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                {cfg.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* SLA Críticas */}
      <div className="flex flex-col gap-2.5 overflow-hidden">
        <div className="flex items-center gap-2 flex-shrink-0 mb-0.5">
          <AlertCircle size={13} className="text-red flex-shrink-0" />
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted/70">
            OS com SLA 2× Excedido
          </p>
          <span className="ml-auto font-mono text-[13px] font-bold text-red tabular-nums">
            {slaCriticas.length}
          </span>
        </div>
        {slaCriticas.length === 0 ? (
          <div className="flex items-center gap-3 bg-green/[0.06] border border-green/20 rounded-xl px-4 py-4">
            <span className="relative flex h-3 w-3 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green" />
            </span>
            <span className="text-[13px] text-green font-semibold">Nenhuma OS crítica</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1.5">
            {slaCriticas.slice(0, 12).map(os => {
              const veryOld = (os._agingAbertura ?? 0) > 30
              return (
                <div
                  key={os.numos}
                  className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border
                              ${veryOld ? 'bg-red/[0.07] border-red/25' : 'bg-card border-red/15'}`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 bg-red ${veryOld ? 'animate-pulse' : ''}`} />
                  <span className="font-mono text-[12px] text-primary font-bold w-20 flex-shrink-0">
                    {os.numos}
                  </span>
                  <span className="text-[12px] text-text flex-1 truncate">{os.nomecliente}</span>
                  <span className="text-[11px] text-muted truncate max-w-[120px]">
                    {shortEquipe(os.nomedaequipe) || '—'}
                  </span>
                  <span className={`font-mono text-[12px] font-bold text-red flex-shrink-0 tabular-nums ${veryOld ? 'animate-pulse' : ''}`}>
                    {os._agingAbertura ?? '?'}d
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Slide 2 — Fornecedores ───────────────────────────────────────────────────

 
function SlideFornecedores({ fornecedores }: { fornecedores: any[] }) {
  return (
    <div className="h-full p-6 flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-center gap-2 flex-shrink-0">
        <Package size={13} className="text-muted" />
        <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted/70">
          Desempenho por Fornecedor
        </p>
      </div>
      <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-4 content-start">
        {fornecedores.length === 0 && (
          <div className="col-span-full flex items-center justify-center py-16">
            <p className="text-[12px] text-muted">Aguardando dados do servidor</p>
          </div>
        )}
        {fornecedores.map(f => {
          const pct    = f.total > 0 ? Math.round((f.concluidas / f.total) * 100) : 0
          const slaCls = f.sla >= 80 ? 'text-green' : f.sla >= 60 ? 'text-yellow' : 'text-red'
          return (
            <div
              key={f.nome}
              className="bg-card border border-white/[0.08] rounded-xl p-5 flex flex-col gap-4"
              style={{ borderLeft: `3px solid ${f.cor}` }}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: f.cor }} />
                <p className="text-[13px] font-bold text-text truncate flex-1">{f.nome}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Ativas</p>
                  <p className="font-mono text-2xl font-bold text-text tabular-nums">{f.total}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Concl.</p>
                  <p className="font-mono text-2xl font-bold text-green tabular-nums">{f.concluidas}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wide mb-1">SLA%</p>
                  <p className={`font-mono text-2xl font-bold tabular-nums ${slaCls}`}>{f.sla}%</p>
                </div>
              </div>
              <div>
                <div className="h-2.5 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${f.cor}88, ${f.cor})`,
                      transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  />
                </div>
                <div className="flex justify-between items-center mt-1.5">
                  <p className="text-[10px] text-muted">{pct}% concluído</p>
                  <p className="text-[10px] text-muted/60 font-mono tabular-nums">{f.concluidas}/{f.total}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── NocInner ─────────────────────────────────────────────────────────────────

function NocInner() {
  const { derived, allRows, isLoading, error } = useOSDerived()
  const { kpis, fornecedores } = derived.dashboard as unknown as { kpis: unknown[]; fornecedores: unknown[] }
  const { semaforo } = derived.campo as unknown as { semaforo: unknown[] }

  // Sessão expirada / servidor reiniciado → mostra tela de erro clara
  const noData = !isLoading && (kpis as unknown[]).length === 0

  const navigate     = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const slideRef     = useRef(0)

  const [slide,          setSlide]          = useState(0)
  const [elapsed,        setElapsed]        = useState(0)
  const [paused,         setPaused]         = useState(false)
  const [isFullscreen,   setIsFullscreen]   = useState(false)
  const [critOverlay,    setCritOverlay]    = useState(true)
  const now = useNowClock()

  useEffect(() => { slideRef.current = slide }, [slide])

  // Auto-rotation
  useEffect(() => {
    if (paused) return
    const tick = setInterval(() => {
      setElapsed(e => {
        const next = e + 100
        if (next >= SLIDE_MS) { setSlide(s => (s + 1) % TOTAL_SLIDES); return 0 }
        return next
      })
    }, 100)
    return () => clearInterval(tick)
  }, [paused])

  // Fullscreen sync
  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // Keyboard navigation — uses ref so effect runs once only
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const s = slideRef.current
      if (e.key === 'ArrowRight') { setSlide((s + 1) % TOTAL_SLIDES); setElapsed(0) }
      if (e.key === 'ArrowLeft')  { setSlide((s - 1 + TOTAL_SLIDES) % TOTAL_SLIDES); setElapsed(0) }
      if (e.key === ' ')          { e.preventDefault(); setPaused(p => !p) }
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.()
        else document.exitFullscreen?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const progress  = (elapsed / SLIDE_MS) * 100
  const remaining = Math.ceil((SLIDE_MS - elapsed) / 1000)

  const slaCriticas = allRows.filter(
    r => r._slaCritico && r._tipo !== 'REDE' && !isCOPE(r) && !isReagend(r)
  )

  // Extract dashboard KPI values for critical detection
  const kpiMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const k of (kpis as Array<{ id: string; value: number | string }>)) {
      map[k.id] = typeof k.value === 'number' ? k.value : parseInt(String(k.value)) || 0
    }
    return map
  }, [kpis])

  const criticas   = kpiMap['criticas']  ?? 0
  const semEquipe  = kpiMap['semEq']     ?? 0
  const isCritical = criticas > 10 || semEquipe > 5

  // Auto-pause carousel when situation is critical
  useEffect(() => {
    if (isCritical && critOverlay) setPaused(true)
  }, [isCritical, critOverlay])

  function goSlide(i: number) { setSlide(i); setElapsed(0) }

  const SlideIcon = SLIDE_CONFIG[slide].icon
  const slideName = SLIDE_CONFIG[slide].name

  return (
    <div ref={containerRef} className="fixed inset-0 bg-bg text-text flex flex-col overflow-hidden">
      <style>{`
        @keyframes nocFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-6 py-3
                         border-b border-white/[0.08] bg-elevated flex-shrink-0">
        {/* Live pulse */}
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-60" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green" />
        </span>

        <Monitor size={17} className="text-primary flex-shrink-0" />
        <span className="font-headline font-bold text-base tracking-wide">NOC — Cabonnet</span>

        <div className="w-px h-5 bg-border mx-1 flex-shrink-0" />

        {/* Current slide label */}
        <SlideIcon size={13} className="text-primary flex-shrink-0" />
        <span className="text-[12px] font-semibold text-secondary">{slideName}</span>
        <span className="text-[10px] text-muted/50 font-mono">{slide + 1}/{TOTAL_SLIDES}</span>

        <div className="flex-1" />

        <span className="text-[11px] text-muted font-mono">
          {now.toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
          })}
        </span>
        <span className="text-2xl font-mono font-bold tabular-nums ml-2">
          {now.toLocaleTimeString('pt-BR')}
        </span>

        <button
          onClick={() => {
            if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.()
            else document.exitFullscreen?.()
          }}
          className="w-8 h-8 rounded-md flex items-center justify-center ml-2
                     text-secondary hover:text-text hover:bg-surface transition-all"
          title={isFullscreen ? 'Sair da tela cheia (F)' : 'Tela cheia (F)'}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>

        <button
          onClick={() => setPaused(p => !p)}
          className="w-8 h-8 rounded-md flex items-center justify-center
                     text-secondary hover:text-text hover:bg-surface transition-all"
          title={paused ? 'Retomar (Espaço)' : 'Pausar (Espaço)'}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>

        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-md flex items-center justify-center
                     text-secondary hover:text-red hover:bg-red/10 transition-all"
          title="Sair do NOC"
        >
          <X size={16} />
        </button>
      </header>

      {/* ── Sem dados (sessão expirada / servidor reiniciado) ── */}
      {noData && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-12 h-12 rounded-full bg-yellow/10 border border-yellow/30 flex items-center justify-center">
            <AlertCircle size={24} className="text-yellow" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-text mb-1">Sem dados disponíveis</p>
            <p className="text-[12px] text-muted">Sessão pode ter expirado após reinício do servidor.</p>
            <p className="text-[12px] text-muted mt-0.5">Volte ao painel principal e faça login novamente.</p>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[12px] font-semibold hover:bg-primary/20 transition-colors"
          >
            Ir para o Login
          </button>
        </div>
      )}

      {/* ── Critical overlay ── */}
      {!noData && isCritical && critOverlay && (
        <div className="flex items-center gap-4 px-5 py-3 bg-red/10 border-b border-red/30 flex-shrink-0">
          <AlertCircle size={18} className="text-red flex-shrink-0 animate-pulse" />
          <p className="text-[12px] font-semibold text-red flex-1">
            Situacao critica detectada — {criticas} OS criticas, {semEquipe} sem equipe
          </p>
          <button
            onClick={() => { setCritOverlay(false); setPaused(false) }}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-red/30
                       text-red hover:bg-red/10 transition-colors flex-shrink-0"
          >
            Retomar slides
          </button>
        </div>
      )}

      {/* ── Slide area ── */}
      {!noData && <main className="flex-1 overflow-hidden">

        <div
          key={slide}
          className="h-full"
          style={{ animation: 'nocFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          {slide === 0 && <SlideOperacional kpis={kpis} isLoading={isLoading} />}
          {slide === 1 && <SlideEquipes semaforo={semaforo} slaCriticas={slaCriticas} />}
          {slide === 2 && <SlideFornecedores fornecedores={fornecedores} />}
        </div>
      </main>}

      {/* ── Footer ── */}
      <footer className="flex-shrink-0 bg-elevated border-t border-white/[0.08] px-6 py-2.5">
        <div className="flex items-center gap-1 mb-2">
          {SLIDE_CONFIG.map(({ name, icon: Icon }, i) => (
            <button
              key={i}
              onClick={() => goSlide(i)}
              className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full transition-all
                          ${slide === i
                            ? 'bg-primary/15 text-primary font-bold'
                            : 'text-muted hover:text-secondary hover:bg-surface/40'}`}
            >
              <Icon size={11} />
              {name}
            </button>
          ))}

          {/* Dot indicators */}
          <div className="flex items-center gap-1.5 ml-2">
            {SLIDE_CONFIG.map((_, i) => (
              <button
                key={i}
                onClick={() => goSlide(i)}
                className={`rounded-full transition-all duration-normal
                            ${slide === i
                              ? 'w-4 h-2 bg-primary'
                              : 'w-2 h-2 bg-white/[0.20] hover:bg-white/[0.35]'}`}
              />
            ))}
          </div>

          <div className="flex-1" />

          <span className="text-[10px] text-muted/35 font-mono hidden xl:block mr-3">
            ←→ slides · Espaço pausar · F tela cheia
          </span>

          {paused && (
            <span className="text-[11px] text-yellow font-bold uppercase tracking-wide animate-pulse mr-2">
              Pausado
            </span>
          )}
          <span className="text-[11px] text-muted font-mono tabular-nums">{remaining}s</span>
        </div>

        <div className="h-[3px] bg-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: `${progress}%`, transition: 'width 100ms linear' }}
          />
        </div>
      </footer>
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

function NocAuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [checked, setChecked] = React.useState(false)
  const [allowed, setAllowed] = React.useState(false)

  React.useEffect(() => {
    api.auth.check()
      .then(() => setAllowed(true))
      .catch(() => navigate('/', { replace: true }))
      .finally(() => setChecked(true))
  }, [navigate])

  if (!checked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  return allowed ? <>{children}</> : null
}

export default function NocPage() {
  return (
    <NocAuthGuard>
      <OSDataProvider>
        <NocInner />
      </OSDataProvider>
    </NocAuthGuard>
  )
}
