import { useMemo } from 'react'
import {
  CheckCircle2, Package, Wrench, Radio, TrendingUp, TrendingDown, Gauge,
  ArrowDownRight, ArrowUpRight, Minus, AlertCircle,
} from 'lucide-react'
import type { OSRow, PulsoRitmoIntradiario } from '../../lib/types'
import { SectionLabel } from './DashboardKpiPrimitives'
import type { CatCfgItem, CampoProjecaoReal, FluxoHoje } from './DashboardTypes'

// Categorias de negócio do provedor — usa _categoria (calculado em enrichRows)
const CAT_CFG: CatCfgItem[] = [
  { cat: 'INSTALACAO',    label: 'Instalação',      icon: Package, color: '#3b82f6' },
  { cat: 'VT_MANUTENCAO', label: 'VT / Manutenção', icon: Wrench,  color: '#fb923c' },
  { cat: 'SERVICO',       label: 'Serviço',          icon: null,    color: '#c4b5fd' },
  { cat: 'REDE',          label: 'Rede',             icon: Radio,   color: '#71717a' },
]

function RitmoIndicator({ p }: { p: CampoProjecaoReal }) {
  const cor  = p.status === 'acima' ? '#4ade80' : p.status === 'abaixo' ? '#facc15' : '#94a3b8'
  const Icon = p.status === 'acima' ? TrendingUp : p.status === 'abaixo' ? TrendingDown : Gauge
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <Icon size={11} style={{ color: cor }} />
      <span className="font-semibold" style={{ color: cor }}>
        {p.status === 'acima' ? 'No ritmo' : p.status === 'abaixo' ? 'Abaixo do ritmo' : 'Início do dia'}
      </span>
      <span className="text-muted">· {p.label}</span>
    </div>
  )
}

function FluxoIndicator({ f }: { f: FluxoHoje }) {
  const crescendo = f.saldo > 0
  const cor  = crescendo ? '#fb923c' : f.saldo < 0 ? '#4ade80' : '#94a3b8'
  const Icon = crescendo ? ArrowUpRight : f.saldo < 0 ? ArrowDownRight : Minus
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <Icon size={11} style={{ color: cor }} />
      <span className="font-semibold" style={{ color: cor }}>
        Fila {crescendo ? `+${f.saldo}` : f.saldo} hoje
      </span>
      <span className="text-muted">· {f.entradas} entraram · {f.saidas} saíram</span>
      {f.mediaEntrada != null && f.mediaEntrada > 0 && (() => {
        const acima = f.entradas > f.mediaEntrada
        const igual = f.entradas === f.mediaEntrada
        return (
          <span className={`flex items-center gap-0.5 font-semibold ${igual ? 'text-muted' : acima ? 'text-orange' : 'text-green'}`}
                title={`Entradas hoje vs média diária do período (${f.mediaEntrada}/dia)`}>
            {igual ? <Minus size={10} /> : acima ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
            média {f.mediaEntrada}/d
          </span>
        )
      })()}
    </div>
  )
}

function RitmoIntradiarioBar({ r }: { r: PulsoRitmoIntradiario }) {
  const tot = r.manha + r.tarde
  if (tot === 0) return null
  const pctManha = Math.round((r.manha / tot) * 100)
  const pctTarde = 100 - pctManha
  return (
    <div className="mt-4 pt-3 border-t border-white/[0.05]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted">Ritmo por turno hoje</span>
        {r.alerta && (
          <span className="text-[10px] font-semibold text-yellow flex items-center gap-1">
            <AlertCircle size={9} /> Queda no turno da tarde
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 mb-1.5">
        <span className="flex items-center gap-1.5 text-[11px]">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#f59e0b' }} />
          <span className="text-muted">Manhã</span>
          <span className="font-mono font-bold text-text">{r.manha}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[11px]">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#818cf8' }} />
          <span className="text-muted">Tarde</span>
          <span className={`font-mono font-bold ${r.alerta ? 'text-yellow' : 'text-text'}`}>
            {r.tardeIniciada ? r.tarde : '—'}
          </span>
        </span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-surface/30">
        <div className="h-full" style={{ width: `${pctManha}%`, background: '#f59e0b' }} />
        <div className="h-full" style={{ width: `${pctTarde}%`, background: '#818cf8' }} />
      </div>
    </div>
  )
}

export function ExecutadasHeroBlock({ rows, projecao, fluxo, ritmoIntradiario, onOpenModal }: {
  rows: OSRow[]
  projecao?: CampoProjecaoReal | null
  fluxo?:    FluxoHoje | null
  ritmoIntradiario?: PulsoRitmoIntradiario | null
  onOpenModal: (title: string, rows: OSRow[]) => void
}) {
  const hojeRows = useMemo(() => rows.filter(r => r._executadaHoje), [rows])
  const total    = hojeRows.length

  const grupos = useMemo(() => {
    const map: Record<string, OSRow[]> = {}
    for (const cfg of CAT_CFG) map[cfg.cat] = []
    for (const r of hojeRows) {
      const cat = r._categoria || 'SERVICO'
      if (map[cat]) map[cat].push(r)
      else map['SERVICO'].push(r)
    }
    return CAT_CFG.map(cfg => ({ ...cfg, rows: map[cfg.cat] })).filter(g => g.rows.length > 0)
  }, [hojeRows])

  return (
    <div className="rounded-lg border border-border border-l-2 border-l-green bg-card">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <SectionLabel icon={CheckCircle2} color="#4ade80">Executadas Hoje</SectionLabel>
          {total > 0 && (
            <button
              onClick={() => onOpenModal('Executadas Hoje', hojeRows)}
              className="text-[11px] text-muted hover:text-green border border-white/[0.08]
                         hover:border-green/30 rounded-lg px-2.5 py-1 transition-all duration-fast"
            >
              Ver todas →
            </button>
          )}
        </div>

        {(projecao || fluxo) && (
          <div className="flex items-center gap-4 flex-wrap mb-4 pb-3 border-b border-white/[0.05]">
            {projecao && <RitmoIndicator p={projecao} />}
            {fluxo && <FluxoIndicator f={fluxo} />}
          </div>
        )}

        {total === 0 ? (
          <div className="flex items-center gap-3 py-4">
            <p className="number-display text-[64px] leading-none text-muted/20">0</p>
            <p className="text-[13px] text-muted/60">Nenhuma OS concluída registrada ainda.</p>
          </div>
        ) : (
          <div className="flex items-end gap-6 flex-wrap">
            {/* Hero number */}
            <div className="flex items-end gap-2 flex-shrink-0">
              <span className="font-mono font-black leading-none tabular-nums text-green"
                    style={{ fontSize: 'clamp(44px, 5vw, 60px)' }}>
                {total}
              </span>
              <span className="text-[13px] text-muted mb-2">OS hoje</span>
            </div>

            {/* Type breakdown */}
            <div className="flex-1 min-w-[200px] grid grid-cols-2 sm:grid-cols-4 gap-2">
              {grupos.map(g => {
                const pct = Math.round(g.rows.length / total * 100)
                const GIcon = g.icon
                return (
                  <button
                    key={g.cat}
                    onClick={() => onOpenModal(`Hoje — ${g.label}`, g.rows)}
                    className="bg-surface/30 hover:bg-surface border border-white/[0.08]
                               hover:border-muted/30 rounded-md p-3 text-left
                               transition-all duration-150 cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      {GIcon
                        ? <GIcon size={12} style={{ color: g.color }} />
                        : <span className="w-3 h-3 rounded-full" style={{ background: g.color }} />
                      }
                      <span className="text-[10px] font-mono text-muted">{pct}%</span>
                    </div>
                    <p className="font-mono font-bold text-[26px] leading-none mb-1"
                       style={{ color: g.color }}>
                      {g.rows.length}
                    </p>
                    <p className="text-[11px] text-muted truncate">{g.label}</p>
                    <div className="mt-2 h-[3px] rounded-full bg-surface/40 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                           style={{ width: `${pct}%`, background: g.color }} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Composition bar */}
        {total > 0 && (
          <div className="mt-4 flex h-1 rounded-full overflow-hidden bg-surface/30">
            {grupos.map(g => (
              <div
                key={g.cat}
                title={`${g.label}: ${g.rows.length}`}
                className="h-full transition-all duration-700"
                style={{ width: `${Math.round(g.rows.length / total * 100)}%`, background: g.color }}
              />
            ))}
          </div>
        )}

        {ritmoIntradiario && <RitmoIntradiarioBar r={ritmoIntradiario} />}
      </div>
    </div>
  )
}
