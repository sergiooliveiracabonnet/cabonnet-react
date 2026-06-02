import { useState, useMemo, type ComponentType } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { shortEquipe } from '../../lib/osFormat'
import type { OSRow } from '../../lib/types'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type IconComp = ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>
export type PanelId  = 'atend' | 'pend' | 'concl' | 'futuro' | 'fila' | 'amanha'
export interface CityEntry   { cidade: string; tipos: Record<string, number>; total: number }
export interface FuturoGroup { label: string; rows: OSRow[]; highlight: boolean }

// ─── Constantes ───────────────────────────────────────────────────────────────

export const TIPO_LABEL: Record<string, string> = { INSTALACAO: 'Instalação', MANUTENCAO: 'Manutenção', OUTRO: 'Serviço' }
export const TIPO_COLOR: Record<string, string> = { INSTALACAO: 'text-cyan', MANUTENCAO: 'text-orange', OUTRO: 'text-muted' }
export const TIPO_ORDER = ['INSTALACAO', 'MANUTENCAO', 'OUTRO']

export const CITY_OS_COLS = [
  { key: 'numos',           label: 'Nº OS'    },
  { key: 'nomecliente',     label: 'Cliente'  },
  { key: 'tiposervico',     label: 'Tipo'     },
  { key: 'nomedaequipe',    label: 'Equipe'   },
  { key: 'descsituacao',    label: 'Situação' },
  { key: '_aging',          label: 'Aging'    },
  { key: 'dataagendamento', label: 'Agend.'   },
]

export const PANEL_FROM: Record<string, string>  = { cyan: 'from-cyan/[0.07]', yellow: 'from-yellow/[0.07]', green: 'from-green/[0.07]', purple: 'from-purple/[0.07]', red: 'from-red/[0.07]', orange: 'from-orange/[0.07]' }
export const PANEL_HOVER: Record<string, string> = { cyan: 'hover:border-cyan/[0.30]', yellow: 'hover:border-yellow/[0.30]', green: 'hover:border-green/[0.30]', purple: 'hover:border-purple/[0.30]', red: 'hover:border-red/[0.30]', orange: 'hover:border-orange/[0.30]' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function hojeLocal() {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

export function amanhaLocal() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

export function datePart(raw: string | null | undefined): string {
  return (raw || '').trim().split(' ')[0]
}

export function tipoBreakdown(rows: OSRow[]): { inst: number; manut: number; serv: number } {
  let inst = 0, manut = 0, serv = 0
  for (const r of rows) {
    if      (r._tipo === 'INSTALACAO') inst++
    else if (r._tipo === 'MANUTENCAO') manut++
    else                               serv++
  }
  return { inst, manut, serv }
}

export function buildMatrix(rows: OSRow[]): { cities: CityEntry[]; tipos: string[] } {
  const cityMap = new Map<string, CityEntry>()
  const tipoSet = new Set<string>()
  for (const r of rows) {
    const cidade = (r.nomedacidade || '').trim() || 'Não informada'
    const t = (r.tiposervico || '').toUpperCase()
    const tipo = t.includes('INSTALAC') ? 'INSTALACAO' : t.includes('MANUTENC') ? 'MANUTENCAO' : 'OUTRO'
    tipoSet.add(tipo)
    if (!cityMap.has(cidade)) cityMap.set(cidade, { cidade, tipos: {}, total: 0 })
    const e = cityMap.get(cidade)!
    e.tipos[tipo] = (e.tipos[tipo] ?? 0) + 1
    e.total++
  }
  const tipos  = TIPO_ORDER.filter(t => tipoSet.has(t))
  const cities = [...cityMap.values()].sort((a, b) => b.total - a.total)
  return { cities, tipos }
}

export function tipoFromServico(tiposervico: string | null | undefined): string {
  const t = (tiposervico || '').toUpperCase()
  if (t.includes('INSTALAC')) return 'INSTALACAO'
  if (t.includes('MANUTENC')) return 'MANUTENCAO'
  return 'OUTRO'
}

export function cityOSSortValue(r: OSRow, key: string): string | number {
  if (key === 'numos')  return parseInt(r.numos) || 0
  if (key === '_aging') return r._aging ?? -1
  if (key === 'dataagendamento') {
    const s = (r.dataagendamento || '').split(' ')[0]
    const p = s.split('/')
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : s
  }
  return (r[key] ?? '').toString().toLowerCase()
}

// ─── PainelCidade ─────────────────────────────────────────────────────────────

export function PainelCidade({ id, title, subtitle, icon: Icon, color, rows, groups, semEquipe, isLoading, onOS, open, onToggle }: {
  id: string; title: string; subtitle?: string; icon: IconComp; color: string; rows: OSRow[]
  groups?: FuturoGroup[]; semEquipe?: number; isLoading: boolean
  onOS: (os: OSRow) => void; open: boolean; onToggle: () => void
}) {
  const [expandedCity, setExpandedCity] = useState<string | null>(null)
  const { cities, tipos } = useMemo(() => buildMatrix(rows), [rows])
  const maxTotal = cities[0]?.total ?? 1

  const isEmpty = groups
    ? groups.every(g => g.rows.length === 0)
    : cities.length === 0

  return (
    <div id={`panel-${id}`} className="bg-card border border-white/[0.08] rounded-xl overflow-hidden">

      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface/20 transition-colors text-left"
      >
        <Icon size={14} className={`text-${color} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <span className="font-bold text-[14px] text-text">{title}</span>
          {subtitle && <p className="text-[11px] text-muted mt-0.5 truncate">{subtitle}</p>}
        </div>
        <Badge variant={color}>{rows.length} OS</Badge>
        {(semEquipe ?? 0) > 0 && (
          <Badge variant="orange">{semEquipe} sem equipe</Badge>
        )}
        {open
          ? <ChevronUp   size={13} className="text-muted flex-shrink-0" />
          : <ChevronDown size={13} className="text-muted flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-white/[0.08]">
          {isLoading || isEmpty ? (
            <p className="text-center text-muted text-[12px] py-8">Nenhuma OS nesta categoria.</p>
          ) : groups ? (
            groups.map(g => g.rows.length > 0 && (
              <GrupoFuturo key={g.label} group={g} color={color} onOS={onOS} />
            ))
          ) : (
            <CidadeTable
              cities={cities} tipos={tipos} maxTotal={maxTotal} color={color}
              expandedCity={expandedCity} setExpandedCity={setExpandedCity}
              rows={rows} onOS={onOS}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── GrupoFuturo ──────────────────────────────────────────────────────────────

function GrupoFuturo({ group, color, onOS }: { group: FuturoGroup; color: string; onOS: (os: OSRow) => void }) {
  const [expandedCity, setExpandedCity] = useState<string | null>(null)
  const { cities, tipos } = useMemo(() => buildMatrix(group.rows), [group.rows])
  const maxTotal = cities[0]?.total ?? 1

  return (
    <div>
      <div className={`flex items-center gap-2 px-5 py-2 border-y border-white/[0.08]
                       ${group.highlight ? 'bg-cyan/[0.06]' : 'bg-surface/40'}`}>
        <span className={`text-[11px] font-bold uppercase tracking-[0.05em]
                          ${group.highlight ? 'text-cyan' : 'text-muted'}`}>
          {group.label}
        </span>
        <span className="text-[11px] text-muted">· {group.rows.length} OS</span>
      </div>
      <CidadeTable
        cities={cities} tipos={tipos} maxTotal={maxTotal} color={color}
        expandedCity={expandedCity} setExpandedCity={setExpandedCity}
        rows={group.rows} onOS={onOS}
      />
    </div>
  )
}

// ─── CidadeTable ──────────────────────────────────────────────────────────────

function CidadeTable({ cities, tipos, maxTotal, color, expandedCity, setExpandedCity, rows, onOS }: {
  cities: CityEntry[]; tipos: string[]; maxTotal: number; color: string
  expandedCity: string | null; setExpandedCity: (c: string | null) => void
  rows: OSRow[]; onOS: (os: OSRow) => void
}) {
  const [expandedTipo, setExpandedTipo] = useState<string | null>(null)

  const handleCityToggle = (cidade: string) => {
    if (expandedCity === cidade) { setExpandedCity(null); setExpandedTipo(null) }
    else { setExpandedCity(cidade); setExpandedTipo(null) }
  }

  const handleTipoClick = (cidade: string, tipo: string) => {
    if (expandedCity === cidade && expandedTipo === tipo) { setExpandedCity(null); setExpandedTipo(null) }
    else { setExpandedCity(cidade); setExpandedTipo(tipo) }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-white/[0.08] bg-surface">
            <th className="px-4 py-2.5 text-left text-[11px] font-bold text-muted uppercase tracking-[0.04em]">
              Cidade
            </th>
            {tipos.map(t => (
              <th key={t} className="px-4 py-2.5 text-center text-[11px] font-bold text-muted uppercase tracking-[0.04em]">
                {TIPO_LABEL[t]}
              </th>
            ))}
            <th className="px-4 py-2.5 text-right text-[11px] font-bold text-muted uppercase tracking-[0.04em]">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {cities.map(c => (
            <CidadeRows
              key={c.cidade}
              c={c}
              tipos={tipos}
              color={color}
              maxTotal={maxTotal}
              expanded={expandedCity === c.cidade}
              tipoFilter={expandedCity === c.cidade ? expandedTipo : null}
              onToggle={() => handleCityToggle(c.cidade)}
              onTipoClick={(tipo) => handleTipoClick(c.cidade, tipo)}
              rows={rows}
              onOS={onOS}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── CidadeRows ───────────────────────────────────────────────────────────────

function CidadeRows({ c, tipos, color, maxTotal, expanded, tipoFilter, onToggle, onTipoClick, rows, onOS }: {
  c: CityEntry; tipos: string[]; color: string; maxTotal: number
  expanded: boolean; tipoFilter: string | null
  onToggle: () => void; onTipoClick: (tipo: string) => void
  rows: OSRow[]; onOS: (os: OSRow) => void
}) {
  const cityRows = useMemo(
    () => rows.filter(r => (r.nomedacidade || '').trim() === c.cidade),
    [rows, c.cidade]
  )
  const barPct = `${Math.round((c.total / maxTotal) * 100)}%`

  return (
    <>
      <tr className="border-b border-white/[0.04] transition-colors">
        <td
          onClick={onToggle}
          className="px-4 py-2.5 min-w-[160px] cursor-pointer hover:bg-primary/[0.04]"
        >
          <p className="font-semibold text-text">{c.cidade}</p>
          <div className="mt-1.5 h-0.5 rounded-full bg-surface/40 overflow-hidden w-full">
            <div
              className={`h-full bg-${color}/50 rounded-full transition-all`}
              style={{ width: barPct }}
            />
          </div>
        </td>
        {tipos.map(t => {
          const count = c.tipos[t]
          const isActive = expanded && tipoFilter === t
          return (
            <td key={t} className="px-4 py-2.5 text-center">
              {count
                ? <span
                    onClick={e => { e.stopPropagation(); onTipoClick(t) }}
                    title={`Ver apenas ${TIPO_LABEL[t]}`}
                    className={`font-mono font-semibold cursor-pointer px-1.5 py-0.5 rounded transition-colors
                      ${TIPO_COLOR[t]}
                      ${isActive ? 'bg-surface underline underline-offset-2' : 'hover:bg-surface'}`}
                  >
                    {count}
                  </span>
                : <span className="text-white/20">—</span>}
            </td>
          )
        })}
        <td
          onClick={onToggle}
          className={`px-4 py-2.5 text-right font-mono font-bold cursor-pointer hover:bg-primary/[0.04]
            ${expanded && !tipoFilter ? 'text-primary' : 'text-text'}`}
        >
          {c.total}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={tipos.length + 2} className="p-0">
            <CityOSMini rows={cityRows} tipoFilter={tipoFilter} onOS={onOS} />
          </td>
        </tr>
      )}
    </>
  )
}

// ─── CityOSMini ───────────────────────────────────────────────────────────────

function CityOSMini({ rows, tipoFilter, onOS }: {
  rows: OSRow[]; tipoFilter: string | null; onOS: (os: OSRow) => void
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: '_aging', dir: 'desc' })

  function toggleSort(key: string) {
    setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))
  }

  const sorted = useMemo(() => {
    const base = tipoFilter
      ? rows.filter(r => tipoFromServico(r.tiposervico) === tipoFilter)
      : rows
    return [...base].sort((a, b) => {
      const av = cityOSSortValue(a, sort.key)
      const bv = cityOSSortValue(b, sort.key)
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, tipoFilter, sort])

  return (
    <div className="max-h-72 overflow-y-auto bg-surface/60 border-y border-white/[0.05]">
      {tipoFilter && (
        <div className="px-4 py-1.5 border-b border-white/[0.04] flex items-center gap-2 bg-surface/30">
          <span className={`text-[11px] font-bold uppercase tracking-[0.05em] ${TIPO_COLOR[tipoFilter]}`}>
            {TIPO_LABEL[tipoFilter]}
          </span>
          <span className="text-[11px] text-muted">· {sorted.length} OS · clique no número da coluna para mudar filtro</span>
        </div>
      )}
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-elevated z-10">
          <tr className="border-b border-white/[0.08]">
            {CITY_OS_COLS.map(col => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className="px-4 py-2 text-left text-[11px] font-bold text-muted uppercase tracking-[0.03em]
                           cursor-pointer select-none hover:text-secondary transition-colors whitespace-nowrap"
              >
                <span className="flex items-center gap-1">
                  {col.label}
                  {sort.key !== col.key
                    ? <ChevronDown size={9} className="opacity-20 flex-shrink-0" />
                    : sort.dir === 'asc'
                      ? <ChevronUp   size={9} className="text-primary flex-shrink-0" />
                      : <ChevronDown size={9} className="text-primary flex-shrink-0" />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.03]">
          {sorted.map(os => {
            const aging  = os._aging ?? 0
            const agVar  = aging >= 6 ? 'red' : aging >= 3 ? 'yellow' : 'cyan'
            const sit    = os._situacaoEfetiva ?? os.descsituacao ?? '—'
            const sVar   = sit.includes('Conclu')  ? 'green'
                         : sit === 'Atendimento'   ? 'cyan'
                         : sit === 'Pendente'      ? 'yellow'
                         : sit === 'Reagendamento' ? 'orange'
                         : 'secondary'
            const semEquipe = !os.nomedaequipe?.trim()
            const tipoLabel = TIPO_LABEL[tipoFromServico(os.tiposervico)] ?? '—'
            return (
              <tr key={os.numos} onClick={() => onOS(os)}
                  className={`cursor-pointer transition-colors
                    ${semEquipe ? 'bg-orange/[0.04] hover:bg-orange/[0.08]' : 'hover:bg-primary/[0.04]'}`}>
                <td className="px-4 py-1.5 font-mono text-primary">{os.numos}</td>
                <td className="px-4 py-1.5 text-text max-w-[140px] truncate">{os.nomecliente ?? '—'}</td>
                <td className="px-4 py-1.5 text-muted">{tipoLabel}</td>
                <td className="px-4 py-1.5 max-w-[130px]">
                  {semEquipe
                    ? <Badge variant="orange">Sem equipe</Badge>
                    : <span className="text-secondary truncate block">{shortEquipe(os.nomedaequipe)}</span>}
                </td>
                <td className="px-4 py-1.5"><Badge variant={sVar}>{sit}</Badge></td>
                <td className="px-4 py-1.5">
                  {os._aging != null
                    ? <Badge variant={agVar}>{aging}d</Badge>
                    : <span className="text-muted">—</span>}
                </td>
                <td className="px-4 py-1.5 font-mono text-muted">
                  {os.dataagendamento ? os.dataagendamento.slice(0, 10) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
