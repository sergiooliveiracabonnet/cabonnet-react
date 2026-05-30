/* eslint-disable react-hooks/refs */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Network, ZoomIn, ZoomOut, Maximize2, RotateCcw, X } from 'lucide-react'
import { useOSDerived } from '../../contexts/OSDataContext'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
import { isCOPE, isReagend } from '../../lib/transform'

// ── City config ───────────────────────────────────────────────────────────────
const CITIES = [
  { key: 'SAO JOSE DOS CAMPOS', label: 'SJC',      full: 'São José dos Campos', color: '#3b82f6' },
  { key: 'CACAPAVA',            label: 'Caçapava', full: 'Caçapava',            color: '#00d2c8' },
  { key: 'TAUBATE',             label: 'Taubaté',  full: 'Taubaté',             color: '#c4b5fd' },
  { key: 'TREMEMBE',            label: 'Tremembé', full: 'Tremembé',            color: '#34d399' },
  { key: 'PINDAMONHANGABA',     label: 'Pinda',    full: 'Pindamonhangaba',     color: '#fbbf24' },
] as const
type CityKey = typeof CITIES[number]['key']

// ── Operator detection & colors ───────────────────────────────────────────────
const INST_CODES = new Set([1, 4, 5, 7, 20, 45, 46, 47, 48, 49, 50])
const WES_CODES  = new Set([8, 11, 23, 36, 44])
const THM_CODES  = new Set([12, 13, 14])

function teamOperator(nome: string): string {
  const u = nome.toUpperCase()
  if (/^REDE\b/.test(u))   return 'REDE'
  if (/^MANUTENC/.test(u)) return 'MANUT'
  const m = u.match(/\bF(\d+)\b/)
  if (!m) return 'OUTRO'
  const n = parseInt(m[1])
  if (INST_CODES.has(n)) return 'INSTACABLE'
  if (WES_CODES.has(n))  return 'WES'
  if (THM_CODES.has(n))  return 'THM'
  return 'OUTRO'
}

const OP_COLOR: Record<string, string> = {
  INSTACABLE: '#3b82f6',
  WES:        '#4ade80',
  THM:        '#a855f7',
  REDE:       '#64748b',
  MANUT:      '#f59e0b',
  OUTRO:      '#475569',
}
const OP_LABEL: Record<string, string> = {
  INSTACABLE: 'Instacable', WES: 'WES', THM: 'THM',
  REDE: 'Rede', MANUT: 'Manutenção', OUTRO: 'Outro',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const normCity = (c: string): CityKey | '' => {
  const n = c.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (n === 'SAO JOSE' || n === 'SAO JOSE DOS CAMPOS') return 'SAO JOSE DOS CAMPOS'
  if (n === 'CACAPAVA')        return 'CACAPAVA'
  if (n === 'TAUBATE')         return 'TAUBATE'
  if (n === 'TREMEMBE')        return 'TREMEMBE'
  if (n === 'PINDAMONHANGABA') return 'PINDAMONHANGABA'
  return ''
}

const FONT    = 'Inter,system-ui,sans-serif'
const EXCLUIR = new Set(['TESTE DIEGO', 'TESTE INTERFOCUS'])
const STORAGE = 'cabonnet:mapaMental:cityAssignments'
const trunc   = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s
const treeLabel = (nome: string) =>
  shortEquipe(nome).replace(/^(INST|MANUT|REDE)\s+/i, '')
const slaColor  = (s: number) => s >= 85 ? '#34d399' : s >= 70 ? '#fbbf24' : '#f87171'

const VARIANT_COLOR: Record<string, string> = {
  green: '#34d399', red: '#f87171', cyan: '#00d2c8',
  orange: '#fb923c', yellow: '#fbbf24', secondary: '#94a3b8',
}

// ── Layout constants ──────────────────────────────────────────────────────────
const SVG_W    = 700
const PAD_TOP  = 52
const PAD_BOT  = 52
const ROW_H    = 46
const CITY_GAP = 32

const ROOT_X  = 36, ROOT_W  = 110, ROOT_H  = 58
const ROOT_CX = ROOT_X + ROOT_W / 2

const CITY_X  = ROOT_X + ROOT_W + 80   // 226
const CITY_W  = 114, CITY_H = 36

const TEAM_X  = CITY_X + CITY_W + 72   // 412
const TEAM_H  = 32

const TRUNK1_X = CITY_X - 32           // 194
const TRUNK2_X = TEAM_X - 26           // 386

const LINE_C = 'rgba(59,130,246,0.40)'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TeamNode { nome: string; total: number; active: number; sla: number; cityFull: string }
interface CityNode {
  key: CityKey; label: string; full: string; color: string
  total: number; active: number; teams: TeamNode[]
}
interface TeamRow  { node: TeamNode; y: number; color: string; op: string; label: string; tw: number }
interface CityRow  { city: CityNode; yCenter: number; yTop: number; yBot: number; teams: TeamRow[] }
interface DragInfo { nome: string; label: string; color: string }

// ── Persisted assignments ─────────────────────────────────────────────────────
function loadAssignments(): Map<string, CityKey> {
  try {
    const s = localStorage.getItem(STORAGE)
    if (s) return new Map(JSON.parse(s) as [string, CityKey][])
  } catch { /* ignore */ }
  return new Map()
}

// ── Layout builder ────────────────────────────────────────────────────────────
function buildLayout(cities: CityNode[]): { rows: CityRow[]; totalH: number } {
  let y = PAD_TOP
  const rows: CityRow[] = []
  for (const city of cities) {
    const N      = city.teams.length
    const blockH = Math.max(CITY_H, N * ROW_H)
    const yTop   = y
    const yBot   = y + blockH
    const teams: TeamRow[] = city.teams.map((t, i) => {
      const op  = teamOperator(t.nome)
      const lbl = treeLabel(t.nome)
      const sub = `${t.sla}% SLA · ${t.total} OS`
      const tw  = Math.max(178, Math.round(Math.max(lbl.length, sub.length) * 6.1) + 32)
      return { node: t, y: yTop + i * ROW_H + ROW_H / 2, color: OP_COLOR[op] ?? OP_COLOR.OUTRO, op, label: lbl, tw }
    })
    rows.push({ city, yTop, yCenter: yTop + blockH / 2, yBot, teams })
    y = yBot + CITY_GAP
  }
  return { rows, totalH: y - CITY_GAP + PAD_BOT }
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MapaMentalPage() {
  const { rows, isLoading }   = useOSDerived()
  const [scale,             setScale]           = useState(1)
  const [selectedTeam,      setSelectedTeam]    = useState<string | null>(null)
  const [cityAssignments,   setCityAssignments] = useState<Map<string, CityKey>>(loadAssignments)
  const [teamDrag,          setTeamDrag]        = useState<DragInfo | null>(null)
  const [dropTarget,        setDropTarget]      = useState<CityKey | null>(null)
  const [mousePos,          setMousePos]        = useState({ x: 0, y: 0 })

  const scrollRef  = useRef<HTMLDivElement>(null)
  const teamMoved  = useRef(false)
  const downPos    = useRef({ x: 0, y: 0 })
  const dragRef    = useRef<DragInfo | null>(null)
  const dropRef    = useRef<CityKey | null>(null)
  const layoutRef  = useRef<{ rows: CityRow[]; totalH: number }>({ rows: [], totalH: 0 })
  const scaleRef   = useRef(scale)

  dragRef.current  = teamDrag
  dropRef.current  = dropTarget
  scaleRef.current = scale

  // Persist assignments
  useEffect(() => {
    localStorage.setItem(STORAGE, JSON.stringify([...cityAssignments.entries()]))
  }, [cityAssignments])

  // Global mouse handlers during drag
  useEffect(() => {
    if (!teamDrag) return

    const onMove = (e: MouseEvent) => {
      const dist = Math.hypot(e.clientX - downPos.current.x, e.clientY - downPos.current.y)
      if (dist > 5) teamMoved.current = true
      setMousePos({ x: e.clientX, y: e.clientY })

      const el = scrollRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const s    = scaleRef.current
      const svgX = (e.clientX - rect.left  + el.scrollLeft) / s
      const svgY = (e.clientY - rect.top   + el.scrollTop)  / s

      const found = layoutRef.current.rows.find(r =>
        svgX >= CITY_X - 14 && svgX <= CITY_X + CITY_W + 14 &&
        svgY >= r.yCenter - CITY_H / 2 - 14 && svgY <= r.yCenter + CITY_H / 2 + 14
      )
      const dt = found?.city.key ?? null
      dropRef.current = dt
      setDropTarget(dt)
    }

    const onUp = () => {
      const drag = dragRef.current
      const dt   = dropRef.current
      if (drag) {
        if (!teamMoved.current) {
          setSelectedTeam(drag.nome)
        } else if (dt) {
          const curCity = layoutRef.current.rows.find(r =>
            r.teams.some(t => t.node.nome === drag.nome))?.city.key
          if (dt !== curCity) {
            setCityAssignments(prev => { const n = new Map(prev); n.set(drag.nome, dt); return n })
          }
        }
      }
      setTeamDrag(null)
      setDropTarget(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [teamDrag])

  // ── Data ────────────────────────────────────────────────────────────────────
  const cityData = useMemo<CityNode[]>(() => {
    const metrics    = new Map<string, { total: number; active: number; slaOk: number }>()
    const cityCounts = new Map<string, Map<CityKey, number>>()

    rows.forEach(r => {
      if (isCOPE(r) || isReagend(r)) return
      const city = normCity(r.nomedacidade || '')
      const team = (r.nomedaequipe || '').trim()
      if (!city || !team || EXCLUIR.has(team.toUpperCase())) return
      if (!metrics.has(team)) metrics.set(team, { total: 0, active: 0, slaOk: 0 })
      const m = metrics.get(team)!
      m.total++
      if (r._aging !== null) { m.active++; if (!r._slaExcedido) m.slaOk++ }
      if (!cityCounts.has(team)) cityCounts.set(team, new Map())
      const cc = cityCounts.get(team)!
      cc.set(city, (cc.get(city) ?? 0) + 1)
    })

    const effectiveCity = new Map<string, CityKey>()
    cityCounts.forEach((cityMap, team) => {
      effectiveCity.set(team,
        cityAssignments.get(team) ??
        [...cityMap.entries()].sort((a, b) => b[1] - a[1])[0][0])
    })

    return CITIES.map(city => {
      const teams = [...effectiveCity.entries()]
        .filter(([, ck]) => ck === city.key)
        .map(([nome]) => {
          const m = metrics.get(nome)!
          return { nome, total: m.total, active: m.active,
            sla: m.active > 0 ? Math.round(m.slaOk / m.active * 100) : 100,
            cityFull: city.full }
        })
        .sort((a, b) => {
          const fNum = (n: string) => { const m = n.match(/\bF(\d+)\b/i); return m ? parseInt(m[1]) : 9999 }
          return fNum(a.nome) - fNum(b.nome)
        })
        .slice(0, 15)
      const tot = teams.reduce((s, t) => ({ total: s.total + t.total, active: s.active + t.active }), { total: 0, active: 0 })
      return { key: city.key as CityKey, label: city.label, full: city.full, color: city.color, ...tot, teams }
    })
  }, [rows, cityAssignments])

  const layout     = useMemo(() => buildLayout(cityData), [cityData])
  layoutRef.current = layout

  const totalOS    = useMemo(() => cityData.reduce((s, c) => s + c.total, 0), [cityData])
  const uniqueEq   = useMemo(() => new Set(cityData.flatMap(c => c.teams.map(t => t.nome))).size, [cityData])
  const presentOps = useMemo(() => {
    const ops = new Set<string>()
    cityData.forEach(c => c.teams.forEach(t => { const o = teamOperator(t.nome); if (o !== 'OUTRO') ops.add(o) }))
    return [...ops]
  }, [cityData])

  const modalRows = useMemo(() => {
    if (!selectedTeam) return []
    return rows
      .filter(r => r.nomedaequipe === selectedTeam)
      .sort((a, b) => {
        const aA = a._aging !== null ? 1 : 0, bA = b._aging !== null ? 1 : 0
        if (aA !== bA) return bA - aA
        return (b._aging ?? -1) - (a._aging ?? -1)
      })
  }, [rows, selectedTeam])

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const { rows: cityRows, totalH } = layout
  const rootY = totalH / 2

  return (
    <div className="flex-1 flex flex-col gap-3 p-6 min-h-0 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
        <Network size={16} style={{ color: '#3b82f6' }} />
        <h1 className="text-[15px] font-headline font-bold text-text">Mapa Mental · Equipes por Cidade</h1>
        <div className="flex-1" />
        <span className="text-[10.5px] text-muted">{uniqueEq} equipes · {totalOS} OS</span>
        <div className="flex gap-1.5 items-center flex-wrap">
          {presentOps.map(op => (
            <span key={op}
              className="flex items-center gap-1.5 px-2.5 py-[5px] rounded-md text-[9.5px] font-bold uppercase tracking-wide border"
              style={{ borderColor: OP_COLOR[op] + '55', color: OP_COLOR[op], background: OP_COLOR[op] + '14' }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: OP_COLOR[op] }} />
              {OP_LABEL[op]}
            </span>
          ))}
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="flex-1 rounded-xl border min-h-0 relative flex flex-col overflow-hidden"
           style={{ borderColor: 'rgba(59,130,246,0.12)', background: 'rgba(6,12,32,0.90)' }}>

        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'radial-gradient(ellipse at 25% 50%, rgba(59,130,246,0.04) 0%, transparent 65%)' }} />

        {/* Legend bar */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 border-b text-[9.5px] text-muted/60"
             style={{ borderColor: 'rgba(59,130,246,0.08)' }}>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: '#34d399' }} />≥ 85% SLA
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: '#fbbf24' }} />70–84%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: '#f87171' }} />{'< 70%'}
          </span>
          <span className="ml-auto opacity-50">Clique → ver OS · Arraste sobre cidade → trocar</span>
        </div>

        {/* Scrollable SVG area */}
        <div ref={scrollRef} className="flex-1 overflow-auto"
             style={{ cursor: teamDrag ? (dropTarget ? 'copy' : 'grabbing') : 'default' }}>
          <div style={{
            transform: `scale(${scale})`, transformOrigin: 'top left',
            width: SVG_W, height: totalH, minWidth: SVG_W,
          }}>
            <svg width={SVG_W} height={totalH} viewBox={`0 0 ${SVG_W} ${totalH}`}
                 style={{ display: 'block', userSelect: 'none' }}>

              <defs>
                {CITIES.map(c => (
                  <linearGradient key={c.key} id={`lg-${c.key}`} x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%"   stopColor={c.color} stopOpacity="0.30" />
                    <stop offset="100%" stopColor={c.color} stopOpacity="0.10" />
                  </linearGradient>
                ))}
                <linearGradient id="lg-root" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#00d2c8" stopOpacity="0.15" />
                </linearGradient>
              </defs>

              {/* ── Root node ── */}
              <g>
                <rect x={ROOT_X} y={rootY - ROOT_H / 2} width={ROOT_W} height={ROOT_H} rx={10}
                      fill="url(#lg-root)" stroke="rgba(59,130,246,0.60)" strokeWidth={1.5} />
                <rect x={ROOT_X} y={rootY - ROOT_H / 2} width={ROOT_W} height={ROOT_H} rx={10}
                      fill="none" stroke="rgba(59,130,246,0.15)" strokeWidth={5} />
                <text x={ROOT_CX} y={rootY - 8} textAnchor="middle"
                      fill="white" fontSize={13.5} fontWeight="800" fontFamily={FONT} letterSpacing="1.5">
                  CABONNET
                </text>
                <text x={ROOT_CX} y={rootY + 7} textAnchor="middle"
                      fill="rgba(59,130,246,0.65)" fontSize={8.5} fontFamily={FONT} letterSpacing="0.6">
                  VALE DO PARAÍBA
                </text>
                <text x={ROOT_CX} y={rootY + 20} textAnchor="middle"
                      fill="rgba(255,255,255,0.28)" fontSize={8} fontFamily={FONT}>
                  {uniqueEq} equipes · {totalOS} OS
                </text>
              </g>

              {/* ── Trunk 1 ── */}
              {cityRows.length > 0 && (
                <>
                  <line x1={ROOT_X + ROOT_W} y1={rootY} x2={TRUNK1_X} y2={rootY}
                        stroke={LINE_C} strokeWidth={1.5} />
                  <line x1={TRUNK1_X} y1={cityRows[0].yCenter}
                        x2={TRUNK1_X} y2={cityRows[cityRows.length - 1].yCenter}
                        stroke={LINE_C} strokeWidth={1.5} />
                </>
              )}

              {/* ── Cities & teams ── */}
              {cityRows.map(({ city, yCenter, teams }) => {
                const cc       = city.color
                const cly      = yCenter - CITY_H / 2
                const isTarget = dropTarget === city.key

                return (
                  <g key={city.key}>

                    {/* dot + branch */}
                    <circle cx={TRUNK1_X} cy={yCenter} r={4.5} fill="#3b82f6" fillOpacity={0.75} />
                    <line x1={TRUNK1_X} y1={yCenter} x2={CITY_X} y2={yCenter}
                          stroke={LINE_C} strokeWidth={1.5} />

                    {/* ── City node ── */}
                    <g>
                      {isTarget && (
                        <rect x={CITY_X - 6} y={cly - 6} width={CITY_W + 12} height={CITY_H + 12} rx={12}
                              fill={cc + '22'} stroke={cc} strokeWidth={2} strokeOpacity={0.9} />
                      )}
                      <rect x={CITY_X} y={cly} width={CITY_W} height={CITY_H} rx={8}
                            fill={`url(#lg-${city.key})`}
                            stroke={cc} strokeWidth={isTarget ? 2.5 : 1.5}
                            strokeOpacity={isTarget ? 1 : 0.75} />
                      <text x={CITY_X + CITY_W / 2} y={yCenter - 4} textAnchor="middle"
                            fill={cc} fontSize={12} fontWeight="800" fontFamily={FONT} letterSpacing="0.5">
                        {city.label}
                      </text>
                      <text x={CITY_X + CITY_W / 2} y={yCenter + 9} textAnchor="middle"
                            fill="rgba(255,255,255,0.35)" fontSize={8} fontFamily={FONT}>
                        {teams.length} eq · {city.total} OS
                      </text>
                    </g>

                    {/* Trunk 2 */}
                    {teams.length > 0 && (
                      <>
                        <line x1={CITY_X + CITY_W} y1={yCenter} x2={TRUNK2_X} y2={yCenter}
                              stroke={cc} strokeWidth={1} strokeOpacity={0.30} />
                        <line x1={TRUNK2_X} y1={teams[0].y}
                              x2={TRUNK2_X} y2={teams[teams.length - 1].y}
                              stroke={cc} strokeWidth={1} strokeOpacity={0.30} />
                      </>
                    )}

                    {/* ── Team nodes ── */}
                    {teams.map(({ node: t, y, color, label, tw }) => {
                      const sub     = `${t.sla}% SLA · ${t.total} OS`
                      const sc      = slaColor(t.sla)
                      const isDragging = teamDrag?.nome === t.nome && teamMoved.current

                      return (
                        <g key={t.nome}
                           style={{ cursor: teamDrag ? 'default' : 'grab', opacity: isDragging ? 0.3 : 1 }}
                           onMouseDown={e => {
                             e.preventDefault()
                             downPos.current  = { x: e.clientX, y: e.clientY }
                             teamMoved.current = false
                             const op = teamOperator(t.nome)
                             setTeamDrag({ nome: t.nome, label: treeLabel(t.nome), color: OP_COLOR[op] ?? OP_COLOR.OUTRO })
                             setMousePos({ x: e.clientX, y: e.clientY })
                           }}>

                          <circle cx={TRUNK2_X} cy={y} r={3.5} fill={cc} fillOpacity={0.55} />
                          <line x1={TRUNK2_X} y1={y} x2={TEAM_X} y2={y}
                                stroke={cc} strokeWidth={1} strokeOpacity={0.25} />

                          <rect x={TEAM_X} y={y - TEAM_H / 2} width={tw} height={TEAM_H} rx={6}
                                fill={color + '20'} stroke={color} strokeWidth={1} strokeOpacity={0.65} />
                          <rect x={TEAM_X} y={y - TEAM_H / 2} width={3.5} height={TEAM_H} rx={2}
                                fill={sc} fillOpacity={0.88} />
                          <text x={TEAM_X + 12} y={y - 4}
                                fill={color} fontSize={9.5} fontWeight="700" fontFamily={FONT}>
                            {label}
                          </text>
                          <text x={TEAM_X + 12} y={y + 8}
                                fill="rgba(255,255,255,0.40)" fontSize={8} fontFamily={FONT}>
                            {sub}
                          </text>
                        </g>
                      )
                    })}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        {/* Ghost card during drag */}
        {teamDrag && teamMoved.current && (
          <div className="fixed z-[210] pointer-events-none"
               style={{ left: mousePos.x + 14, top: mousePos.y - 16 }}>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-semibold shadow-xl"
                 style={{ background: 'rgba(8,18,44,0.97)', borderColor: teamDrag.color,
                          color: 'rgba(255,255,255,0.92)', boxShadow: `0 0 14px ${teamDrag.color}55` }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: teamDrag.color }} />
              {teamDrag.label}
              {dropTarget && (
                <span className="opacity-60 ml-1">
                  → {CITIES.find(c => c.key === dropTarget)?.label}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Controls ── */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1">
          <button onClick={() => { setCityAssignments(new Map()); localStorage.removeItem(STORAGE) }}
            title="Resetar associações"
            className="w-7 h-7 rounded-md border flex items-center justify-center hover:text-yellow-400 mr-0.5"
            style={{ background: 'rgba(6,12,32,0.92)', borderColor: 'rgba(59,130,246,0.22)', color: 'rgba(255,255,255,0.4)' }}>
            <RotateCcw size={11} />
          </button>
          <button onClick={() => setScale(s => Math.max(0.4, s / 1.2))} title="Reduzir"
            className="w-7 h-7 rounded-md border flex items-center justify-center hover:text-primary"
            style={{ background: 'rgba(6,12,32,0.92)', borderColor: 'rgba(59,130,246,0.22)', color: 'rgba(255,255,255,0.55)' }}>
            <ZoomOut size={13} />
          </button>
          <div className="h-7 px-2.5 rounded-md border flex items-center text-[10px] font-mono font-semibold"
               style={{ background: 'rgba(6,12,32,0.92)', borderColor: 'rgba(59,130,246,0.22)', color: 'rgba(59,130,246,0.80)', minWidth: 46, justifyContent: 'center' }}>
            {Math.round(scale * 100)}%
          </div>
          <button onClick={() => setScale(s => Math.min(2.5, s * 1.2))} title="Ampliar"
            className="w-7 h-7 rounded-md border flex items-center justify-center hover:text-primary"
            style={{ background: 'rgba(6,12,32,0.92)', borderColor: 'rgba(59,130,246,0.22)', color: 'rgba(255,255,255,0.55)' }}>
            <ZoomIn size={13} />
          </button>
          <button onClick={() => setScale(1)} title="Resetar zoom"
            className="w-7 h-7 rounded-md border flex items-center justify-center hover:text-primary ml-0.5"
            style={{ background: 'rgba(6,12,32,0.92)', borderColor: 'rgba(59,130,246,0.22)', color: 'rgba(255,255,255,0.55)' }}>
            <Maximize2 size={12} />
          </button>
        </div>
      </div>

      {/* ── Modal OS ── */}
      {selectedTeam && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6"
             style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)' }}
             onClick={e => { if (e.target === e.currentTarget) setSelectedTeam(null) }}>
          <div className="flex flex-col rounded-xl border shadow-2xl w-full"
               style={{ background: 'rgba(6,12,32,0.98)', borderColor: 'rgba(59,130,246,0.22)',
                        maxWidth: 760, maxHeight: '82vh' }}>

            <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0 border-b"
                 style={{ borderColor: 'rgba(59,130,246,0.12)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-text leading-none">{treeLabel(selectedTeam)}</p>
                <p className="text-[10px] text-muted mt-1 truncate">{selectedTeam}</p>
              </div>
              <span className="text-[11px] text-muted px-2 py-0.5 rounded border"
                    style={{ borderColor: 'rgba(255,255,255,0.1)' }}>{modalRows.length} OS</span>
              <button onClick={() => setSelectedTeam(null)}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-surface/20 transition-all">
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {modalRows.length === 0 ? (
                <p className="text-center text-muted text-[11px] py-8">Nenhuma OS no período.</p>
              ) : (
                <table className="w-full text-[10.5px]">
                  <thead className="sticky top-0"
                         style={{ background: 'rgba(6,12,32,0.98)', borderBottom: '1px solid rgba(59,130,246,0.1)' }}>
                    <tr>
                      {['OS','Cliente','Cidade','Serviço','Situação','Aging'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-semibold"
                            style={{ color: 'rgba(255,255,255,0.45)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modalRows.map((r, i) => {
                      const aging  = r._aging ?? null
                      const sc     = r._slaCritico ? '#f87171' : r._slaExcedido ? '#fbbf24' : '#34d399'
                      const stCol  = VARIANT_COLOR[situacaoVariant(r.descsituacao)] ?? '#94a3b8'
                      const ck     = normCity(r.nomedacidade || '')
                      const cl     = CITIES.find(c => c.key === ck)?.label ?? r.nomedacidade ?? '—'
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                            className="hover:bg-surface/30 transition-colors">
                          <td className="px-4 py-2.5 font-mono font-semibold"
                              style={{ color: 'rgba(59,130,246,0.85)' }}>{r.numos}</td>
                          <td className="px-4 py-2.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
                            {trunc(r.nomecliente || '—', 22)}</td>
                          <td className="px-4 py-2.5" style={{ color: 'rgba(255,255,255,0.55)' }}>{cl}</td>
                          <td className="px-4 py-2.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                            {trunc(r.tiposervico || '—', 16)}</td>
                          <td className="px-4 py-2.5">
                            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold"
                                  style={{ background: stCol + '22', color: stCol }}>
                              {trunc(r.descsituacao || '—', 14)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono font-semibold"
                              style={{ color: aging !== null ? sc : 'rgba(255,255,255,0.3)' }}>
                            {aging !== null ? `${aging}d` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
