// @ts-nocheck
import { useMemo, useState } from 'react'
import {
  Send, AlertTriangle, Clock, Users, CheckCircle2,
  Package, Wrench, Network, MapPin, Undo2, Star, Truck,
} from 'lucide-react'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { useERPStore }    from '../../../store/erpStore'
import { useIsOperador }  from '../../../hooks/useRole'
import { TEAMS }        from '../erpConstants'
import { shortEquipe }  from '../../../lib/osFormat'
import { isCOPE, isReagend } from '../../../lib/transform'

// Códigos de equipes de campo reais (INSTALACAO / MANUTENCAO / REDE)
const TEAM_CODE_SET = new Set(TEAMS.map(t => t.code))
// Distribuição interna — não são equipes de campo
const isInternal = r => /COPE|REAGEND|INVIAB/i.test(r.nomedaequipe ?? '')

function hasRealTeam(row) {
  if (!row.nomedaequipe?.trim()) return false
  const code = shortEquipe(row.nomedaequipe).split(' - ')[0].trim()
  return TEAM_CODE_SET.has(code)
}

// ── Tipo config ───────────────────────────────────────────────────────────────

const TIPO_CFG = {
  INSTALACAO: { Icon: Package, cls: 'text-blue-400',    badge: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',    maxQueue: 18 },
  MANUTENCAO: { Icon: Wrench,  cls: 'text-orange-400',  badge: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',  maxQueue: 12 },
  REDE:       { Icon: Network, cls: 'text-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20', maxQueue: 10 },
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function osRisk(row) {
  let s = 0
  if (row._slaCritico)  s += 50
  else if (row._slaExcedido) s += 30
  const aging = row._aging ?? 0
  if (aging > 14) s += 30
  else if (aging > 7)  s += 20
  else if (aging > 3)  s += 10
  return s
}

function slaBadge(row) {
  if (row._slaCritico)  return { label: 'Crítico', cls: 'bg-red-500/20 text-red-400 border border-red-500/30' }
  if (row._slaExcedido) return { label: 'SLA+',    cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' }
  return                       { label: 'OK',       cls: 'bg-white/[0.05] text-muted border border-white/[0.08]' }
}

function rankTeams(os, metricsByCode, slaByCode) {
  return TEAMS
    .filter(t => t.tipo === os._tipo)
    .map(team => {
      const m   = metricsByCode[team.code] || { queue: 0, criticas: 0 }
      const sla = slaByCode[team.code]?.sla ?? 75
      const cfg = TIPO_CFG[team.tipo]
      const pct = Math.min((m.queue / cfg.maxQueue) * 100, 100)
      // capacity: lower queue → higher score (0–50)
      const capacityScore = Math.round((1 - pct / 100) * 50)
      // SLA performance (0–30)
      const slaScore      = Math.round((sla / 100) * 30)
      // overload penalty
      const penalty       = pct > 85 ? -20 : pct > 70 ? -10 : 0
      const total         = Math.max(0, capacityScore + slaScore + penalty)
      return { team, total, capacityScore, slaScore, pct, sla, queue: m.queue }
    })
    .sort((a, b) => b.total - a.total)
}

// ── OS card (left panel) ──────────────────────────────────────────────────────

function OSQueueCard({ row, isSelected, onClick }) {
  const sla = slaBadge(row)
  const cfg = TIPO_CFG[row._tipo] || {}
  const TIcon = cfg.Icon || AlertTriangle
  const aging = row._aging ?? 0

  return (
    <div
      onClick={() => onClick(row)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick(row)}
      className={`p-3 rounded-lg cursor-pointer border transition-all duration-150 outline-none
        focus-visible:ring-1 focus-visible:ring-primary/50
        ${isSelected
          ? 'bg-primary/10 border-primary/30'
          : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.14] hover:bg-white/[0.04]'}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[10px] font-semibold text-primary/80">#{row.numos}</span>
        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${sla.cls}`}>{sla.label}</span>
      </div>
      <p className="text-[11px] font-medium text-text truncate mb-1">{row.nomecliente || '—'}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {cfg.Icon && <TIcon size={8} className={cfg.cls} />}
        {aging > 0 && (
          <span className={`flex items-center gap-0.5 text-[9px]
            ${aging > 7 ? 'text-red-400' : aging > 3 ? 'text-orange-400' : 'text-muted'}`}>
            <Clock size={8} />{aging}d
          </span>
        )}
        {row.nomedacidade && (
          <span className="flex items-center gap-0.5 text-[9px] text-muted ml-auto">
            <MapPin size={8} />{row.nomedacidade}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Team suggestion card (right panel) ───────────────────────────────────────

function TeamSuggestionCard({ entry, rank, onConfirm, isConfirming }) {
  const { team, total, pct, sla, queue } = entry
  const isBest = rank === 0

  const scoreCls = total >= 60
    ? 'bg-emerald-500/15 text-emerald-400'
    : total >= 35
    ? 'bg-amber-500/15 text-amber-400'
    : 'bg-white/[0.05] text-muted'

  return (
    <div className={`rounded-xl border p-4 transition-all duration-150
      ${isBest
        ? 'bg-primary/[0.05] border-primary/20'
        : 'bg-white/[0.02] border-white/[0.06]'}`}>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isBest && <Star size={11} className="text-primary fill-primary/30" />}
          <div>
            <p className="text-[13px] font-bold text-text leading-none">{team.code}</p>
            <p className="text-[10px] text-secondary mt-0.5 capitalize">
              {team.leader.charAt(0) + team.leader.slice(1).toLowerCase()}
            </p>
          </div>
        </div>
        <span className={`text-[12px] font-bold px-2.5 py-1 rounded-lg ${scoreCls}`}>
          {total} pts
        </span>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="bg-white/[0.03] rounded-lg py-2">
          <p className={`text-[15px] font-bold leading-none
            ${pct > 85 ? 'text-red-400' : pct > 60 ? 'text-orange-400' : 'text-emerald-400'}`}>
            {Math.round(100 - pct)}%
          </p>
          <p className="text-[9px] text-muted mt-0.5">Livre</p>
        </div>
        <div className="bg-white/[0.03] rounded-lg py-2">
          <p className="text-[15px] font-bold text-text leading-none">{queue}</p>
          <p className="text-[9px] text-muted mt-0.5">Na fila</p>
        </div>
        <div className="bg-white/[0.03] rounded-lg py-2">
          <p className={`text-[15px] font-bold leading-none
            ${sla >= 90 ? 'text-emerald-400' : sla >= 75 ? 'text-orange-400' : 'text-red-400'}`}>
            {sla > 0 ? `${Math.round(sla)}%` : '—'}
          </p>
          <p className="text-[9px] text-muted mt-0.5">SLA</p>
        </div>
      </div>

      {/* Barra de capacidade */}
      <div className="mb-3">
        <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500
              ${pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-orange-500' : 'bg-emerald-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[9px] text-muted mt-1">{queue} / {TIPO_CFG[team.tipo]?.maxQueue} slots</p>
      </div>

      {/* Botão */}
      {isBest ? (
        <button
          onClick={onConfirm}
          disabled={isConfirming || !isOperador}
          title={!isOperador ? 'Apenas operadores e gestores podem fazer dispatch' : undefined}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg
                     bg-primary text-white text-[12px] font-semibold
                     hover:bg-primary/90 active:scale-[0.98] transition-all duration-150
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={13} />
          {isConfirming ? 'Despachando…' : 'Confirmar Dispatch'}
        </button>
      ) : (
        <button
          onClick={onConfirm}
          disabled={isConfirming}
          className="w-full py-2 rounded-lg border border-white/[0.08]
                     text-[11px] text-secondary hover:text-text hover:border-white/[0.18]
                     transition-colors disabled:opacity-40"
        >
          Usar esta equipe
        </button>
      )}
    </div>
  )
}

// ── DispatchPage ──────────────────────────────────────────────────────────────

export default function DispatchPage() {
  const { rows, isLoading, derived } = useOSDerived()
  const { dispatchedAssignments, setDispatch, undoDispatch } = useERPStore()
  const isOperador = useIsOperador()
  const [selectedOS, setSelectedOS]   = useState(null)
  const [confirming, setConfirming]   = useState(null)
  const [filterTipo, setFilterTipo]   = useState('')

  const semaforo = useMemo(() => derived?.sla?.semaforo ?? [], [derived])

  const slaByCode = useMemo(() => {
    const map = {}
    semaforo.forEach(s => {
      const code = shortEquipe(s.nome).split(' - ')[0].trim()
      map[code] = s
    })
    return map
  }, [semaforo])

  // Conta apenas OS em equipes de campo reais (ignora COPE/reagend/inviab)
  const metricsByCode = useMemo(() => {
    const map = {}
    rows.forEach(row => {
      if (!hasRealTeam(row)) return
      const code = shortEquipe(row.nomedaequipe).split(' - ')[0].trim()
      if (!map[code]) map[code] = { queue: 0, criticas: 0 }
      map[code].queue++
      if (row._slaCritico) map[code].criticas++
    })
    return map
  }, [rows])

  // OS pendentes de dispatch: tipo de campo real, sem equipe real, não é distribuição interna
  const pendingOS = useMemo(() =>
    rows
      .filter(r =>
        ['INSTALACAO', 'MANUTENCAO', 'REDE'].includes(r._tipo) &&
        !hasRealTeam(r) &&
        !isInternal(r) &&
        !isCOPE(r) &&
        !isReagend(r) &&
        !dispatchedAssignments[r.numos]
      )
      .filter(r => !filterTipo || r._tipo === filterTipo)
      .sort((a, b) => osRisk(b) - osRisk(a)),
    [rows, dispatchedAssignments, filterTipo]
  )

  // OS despachadas nesta sessão via UI
  const dispatchedOS = useMemo(() =>
    rows
      .filter(r => dispatchedAssignments[r.numos])
      .filter(r => !filterTipo || r._tipo === filterTipo),
    [rows, dispatchedAssignments, filterTipo]
  )

  // Ranking de equipes para a OS selecionada
  const teamRanking = useMemo(() => {
    if (!selectedOS) return []
    return rankTeams(selectedOS, metricsByCode, slaByCode)
  }, [selectedOS, metricsByCode, slaByCode])

  function handleConfirm(teamCode) {
    if (!selectedOS) return
    setConfirming(selectedOS.numos)
    setTimeout(() => {
      setDispatch(selectedOS.numos, teamCode)
      setSelectedOS(null)
      setConfirming(null)
    }, 350)
  }

  const critical = pendingOS.filter(r => r._slaCritico).length

  return (
    <div className="flex flex-col h-full gap-4 p-6 min-h-0 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-headline font-bold text-text">Dispatch Inteligente</h1>
          <p className="text-[12px] text-secondary mt-0.5">Atribuição de equipes · ERP</p>
        </div>

        <div className="flex gap-1 bg-elevated border border-white/[0.07] rounded-lg p-0.5">
          {[
            { value: '',           label: 'Todos'     },
            { value: 'INSTALACAO', label: 'Instalação' },
            { value: 'MANUTENCAO', label: 'Manutenção' },
            { value: 'REDE',       label: 'Rede'       },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterTipo(opt.value)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150
                ${filterTipo === opt.value
                  ? 'bg-primary/20 text-primary'
                  : 'text-secondary hover:text-text hover:bg-white/[0.05]'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-3 gap-3 flex-shrink-0">
        {[
          { label: 'Aguardando Dispatch', value: pendingOS.length,       Icon: Truck,         colorCls: 'text-primary',     bgCls: 'bg-primary/10'     },
          { label: 'SLA Crítico',          value: critical,              Icon: AlertTriangle, colorCls: 'text-red-400',     bgCls: 'bg-red-500/10'     },
          { label: 'Despachadas',          value: dispatchedOS.length,   Icon: CheckCircle2,  colorCls: 'text-emerald-400', bgCls: 'bg-emerald-500/10' },
        ].map(k => {
          const KIcon = k.Icon
          return (
            <div key={k.label} className="bg-elevated border border-white/[0.07] rounded-xl px-4 py-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${k.bgCls} flex items-center justify-center flex-shrink-0`}>
                <KIcon size={16} className={k.colorCls} />
              </div>
              <div>
                <p className="text-2xl font-headline font-bold text-text leading-none">{k.value}</p>
                <p className="text-[11px] text-secondary mt-0.5">{k.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Main: two columns ── */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">

        {/* Left — OS queue */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-2 overflow-hidden">
          <div className="flex items-center justify-between flex-shrink-0">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">
              Fila · {pendingOS.length}
            </p>
            {dispatchedOS.length > 0 && (
              <span className="text-[10px] text-emerald-400 font-medium">
                {dispatchedOS.length} despachadas
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : pendingOS.length === 0 && dispatchedOS.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CheckCircle2 size={32} className="text-emerald-400/30 mb-2" />
                <p className="text-sm text-muted">Todas as OS têm equipe</p>
              </div>
            ) : (
              <>
                {pendingOS.map(row => (
                  <OSQueueCard
                    key={row.numos}
                    row={row}
                    isSelected={selectedOS?.numos === row.numos}
                    onClick={setSelectedOS}
                  />
                ))}

                {dispatchedOS.length > 0 && (
                  <>
                    <div className="pt-3 pb-1 flex items-center gap-2">
                      <div className="flex-1 h-px bg-emerald-500/20" />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400/60">
                        Despachadas · {dispatchedOS.length}
                      </span>
                      <div className="flex-1 h-px bg-emerald-500/20" />
                    </div>
                    {dispatchedOS.map(row => (
                      <div key={row.numos}
                           className="flex items-center gap-2 p-2.5 rounded-lg
                                      bg-emerald-500/[0.05] border border-emerald-500/15">
                        <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-[9px] text-primary/70">#{row.numos}</span>
                          <p className="text-[10px] text-text truncate">{row.nomecliente || '—'}</p>
                          <p className="text-[9px] text-emerald-400 font-semibold">
                            → {dispatchedAssignments[row.numos]}
                          </p>
                        </div>
                        <button
                          onClick={() => isOperador && undoDispatch(row.numos)}
                          disabled={!isOperador}
                          title={isOperador ? "Desfazer" : "Sem permissão"}
                          className="text-muted hover:text-red-400 transition-colors p-1 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Undo2 size={11} />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right — Suggestion panel */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {!selectedOS ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Truck size={28} className="text-primary/40" />
              </div>
              <p className="text-sm font-medium text-muted">Selecione uma OS na fila</p>
              <p className="text-[11px] text-muted/60 mt-1">
                O algoritmo vai sugerir a melhor equipe disponível
              </p>
            </div>
          ) : (
            <div className="h-full overflow-y-auto space-y-4 pr-1">

              {/* OS selecionada */}
              <div className="bg-elevated border border-white/[0.07] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[11px] font-semibold text-primary/80 bg-primary/10 px-2 py-0.5 rounded">
                    #{selectedOS.numos}
                  </span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${slaBadge(selectedOS).cls}`}>
                    {slaBadge(selectedOS).label}
                  </span>
                </div>
                <p className="text-[14px] font-semibold text-text mb-2">{selectedOS.nomecliente || '—'}</p>
                <div className="flex items-center gap-3 flex-wrap text-[11px] text-secondary">
                  {selectedOS._tipo && (
                    <span className={`font-medium ${TIPO_CFG[selectedOS._tipo]?.cls || ''}`}>
                      {selectedOS._tipo}
                    </span>
                  )}
                  {selectedOS.nomedacidade && (
                    <span className="flex items-center gap-0.5">
                      <MapPin size={10} />{selectedOS.nomedacidade}
                    </span>
                  )}
                  {selectedOS.bairro && (
                    <span className="text-muted">{selectedOS.bairro}</span>
                  )}
                  {(selectedOS._aging ?? 0) > 0 && (
                    <span className={`flex items-center gap-0.5
                      ${(selectedOS._aging ?? 0) > 7 ? 'text-red-400' : 'text-orange-400'}`}>
                      <Clock size={10} />{selectedOS._aging}d na fila
                    </span>
                  )}
                </div>
              </div>

              {/* Sugestões */}
              {teamRanking.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertTriangle size={28} className="text-orange-400/40 mb-2" />
                  <p className="text-sm text-muted">Nenhuma equipe compatível</p>
                  <p className="text-[11px] text-muted/60 mt-1">
                    Não há equipes do tipo {selectedOS._tipo} cadastradas
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                      Sugestões
                    </p>
                    <span className="text-[10px] text-muted bg-white/[0.05] px-1.5 py-0.5 rounded-full">
                      {teamRanking.length} equipes compatíveis
                    </span>
                  </div>

                  <div className="space-y-3">
                    {teamRanking.slice(0, 4).map((entry, i) => (
                      <TeamSuggestionCard
                        key={entry.team.code}
                        entry={entry}
                        rank={i}
                        onConfirm={() => handleConfirm(entry.team.code)}
                        isConfirming={confirming === selectedOS?.numos}
                      />
                    ))}
                  </div>

                  <p className="text-[10px] text-muted/50 text-center pb-2">
                    Score: capacidade disponível (0–50) + desempenho SLA (0–30)
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
