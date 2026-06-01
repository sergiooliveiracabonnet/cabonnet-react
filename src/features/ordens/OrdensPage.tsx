import { useState, useRef, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BarChart2, ChevronUp, AlertTriangle, Download, Send, CheckCircle, CalendarClock, FileText, Router, Wrench, HardHat, Copy, Users } from 'lucide-react'
import type { OSRow } from '../../lib/types'
type ColRender = (value: unknown, row: OSRow) => React.ReactNode
import { useOrdens } from '../../hooks/useOrdens'
import { KPICard } from '../../components/ui/KPICard'
import { SearchBox } from '../../components/ui/SearchBox'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { DataTable } from '../../components/ui/DataTable'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
import { exportCSV } from '../../lib/export'
import { exportOrdensPDF } from '../../lib/exportOrdensPDF'
import { toBlob } from 'html-to-image'
import { useAuditStore } from '../../store/auditStore'
import OSDrawer from './OSDrawer'
import { OSHoverCard } from './OSHoverCard'
import { TelegramOrdensModal } from './TelegramOrdensModal'


const statusOptions = [
  { value: 'Pendente',                label: 'Pendente'             },
  { value: 'Atendimento',             label: 'Atendimento'          },
  { value: 'Reagendamento',           label: 'Reagendamento'        },
  { value: 'Atendimento/Finalizadas', label: 'Atend. Finalizada'    },
  { value: 'Concluída',               label: 'Concluída'            },
  { value: 'Concluída/Sem Execução',  label: 'Concluída/Sem Exec.'  },
]

const agingOptions = [
  { value: '1',  label: 'Hoje (0-1 dia)' },
  { value: '2',  label: 'Até 2 dias' },
  { value: '3',  label: '3-5 dias ⚠' },
  { value: '6',  label: '≥6 dias 🔴' },
  { value: '11', label: '11+ dias' },
]

const fornecedorOptions = [
  { value: 'WES',        label: 'WES' },
  { value: 'Instacable', label: 'Instacable' },
  { value: 'THM',        label: 'THM' },
  { value: 'REDE',       label: 'Rede' },
  { value: 'MANUTENCAO', label: 'Manutenção' },
  { value: 'INSTALACAO', label: 'Instalação' },
  { value: 'INTERNO',    label: 'COPE Interno' },
]

const densityOptions = [
  { value: 'normal',  label: 'Normal' },
  { value: 'compact', label: 'Compacto' },
  { value: 'mini',    label: 'Mini' },
]

const columns: { key?: string; label: string; render?: ColRender }[] = [
  { key: 'numos',           label: 'Nº OS' },
  { key: '_aging',          label: 'Aging',
    render: (v) => {
      const n = v as number
      const c = n >= 6 ? 'red' : n >= 3 ? 'yellow' : 'cyan'
      return <Badge variant={c}>{n ?? 0}d</Badge>
    }
  },
  { key: '_riskScore',      label: 'Risco',
    render: (v, row) => {
      const score = (v as number) ?? 0
      const [variant, label] =
        score >= 70 ? ['red',    'Crítico'] :
        score >= 40 ? ['orange', 'Alto']    :
        score >= 20 ? ['yellow', 'Médio']   :
                      ['green',  'Baixo']
      const dias = row?._diasAteViolacao
      const pulse = score >= 70
      const diasLabel = dias != null && dias <= 5 ? ` · ${dias}d` : ''
      return (
        <div className="relative inline-flex">
          {pulse && <span className="absolute inset-0 rounded-[10px] bg-red/20 animate-ping pointer-events-none" />}
          <Badge variant={variant as 'red' | 'orange' | 'yellow' | 'green'}>
            {label} {score}{diasLabel}
          </Badge>
        </div>
      )
    }
  },
  { key: 'nomecliente',     label: 'Cliente',
    render: (v, row) => v
      ? (v as string)
      : <span className="text-muted italic text-[11px]">
          {row?.codigocliente ? `Cód. ${row.codigocliente}` : '(Sem nome)'}
        </span>
  },
  { key: 'nomedacidade',    label: 'Cidade' },
  { key: 'bairro',          label: 'Bairro' },
  { key: 'logradouro',      label: 'Endereço' },
  { key: 'tiposervico',     label: 'Tipo' },
  { key: 'nomedaequipe',    label: 'Equipe', render: (v) => shortEquipe(v as string) },
  { key: '_situacaoEfetiva', label: 'Situação',
    render: (v) => <Badge variant={situacaoVariant(v as string)}>{v as string}</Badge>
  },
  { key: 'dataagendamento', label: 'Agend.',
    render: (v) => v ? (v as string).slice(0, 10) : '—'
  },
]


// ── Ordenação de períodos ─────────────────────────────────────────────────────
const PERIOD_ORDER = ['manhã', 'tarde']

// ── Agrupamento por cliente — Timeline visual ─────────────────────────────────

function _parseDateStr(s: string | null | undefined): Date | null {
  if (!s) return null
  const p = s.split(' ')[0].split(/[/-]/)
  if (p.length < 3) return null
  // Suporta DD/MM/YYYY e YYYY-MM-DD
  const [a, b, c] = p
  const dt = a.length === 4
    ? new Date(+a, +b - 1, +c)        // YYYY-MM-DD
    : new Date(+c, +b - 1, +a)        // DD/MM/YYYY
  return isNaN(dt.getTime()) ? null : dt
}

function _computeGap(prev: OSRow | null, curr: OSRow): number | null {
  if (!prev) return null
  const prevClose = _parseDateStr(prev.dataexecucao || prev.databaixa)
  const currOpen  = _parseDateStr(curr.datacadastro)
  if (!prevClose || !currOpen) return null
  const dias = Math.floor((currOpen.getTime() - prevClose.getTime()) / 86400000)
  return dias >= 0 ? dias : null
}

function _dotColor(situacao: string | null | undefined): string {
  if (!situacao) return 'bg-muted/40'
  if (situacao === 'Concluída') return 'bg-green'
  if (situacao === 'Atendimento' || situacao === 'Reagendamento') return 'bg-cyan'
  return 'bg-yellow'
}

function _revisitaBadge(gapDias: number | null): { variant: string; label: string } | null {
  if (gapDias == null || gapDias > 30) return null
  if (gapDias < 7)  return { variant: 'red',    label: `Revisita ${gapDias}d` }
  if (gapDias < 15) return { variant: 'orange',  label: `Revisita ${gapDias}d` }
  return               { variant: 'yellow',  label: `Revisita ${gapDias}d` }
}

function ClienteGroupedTable({ rows, density, onRowClick }: {
  rows: OSRow[]; density: string; onRowClick?: (r: OSRow) => void
}) {
  const showGap = density !== 'mini'

  const groups = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      const key = r.codigocliente || r.nomecliente || '(Sem cliente)'
      if (!map.has(key)) map.set(key, { nome: r.nomecliente || key, codigo: r.codigocliente, rows: [] })
      map.get(key).rows.push(r)
    }
    return [...map.values()]
      .map(g => {
        // Ordenar cronologicamente por datacadastro asc
        const sorted = [...g.rows].sort((a, b) => {
          const da = _parseDateStr(a.datacadastro)?.getTime() ?? 0
          const db = _parseDateStr(b.datacadastro)?.getTime() ?? 0
          return da - db
        })
        // Contar revisitas (gap < 30d)
        let nRevisitas = 0
        for (let i = 1; i < sorted.length; i++) {
          const gap = _computeGap(sorted[i - 1], sorted[i])
          if (gap != null && gap < 30) nRevisitas++
        }
        return { ...g, sorted, nRevisitas }
      })
      .sort((a, b) => b.rows.length - a.rows.length)
  }, [rows])

  if (groups.length === 0) {
    return <p className="px-6 py-10 text-center text-[12px] text-muted italic">Nenhuma OS encontrada.</p>
  }

  return (
    <div className="divide-y divide-white/[0.04]">
      {groups.map((g) => {
        const primeiraData = g.sorted[0]?.datacadastro?.split(' ')[0] ?? '—'
        const ultimaData   = g.sorted[g.sorted.length - 1]?.datacadastro?.split(' ')[0] ?? '—'

        return (
          <div key={g.codigo || g.nome}>
            {/* Header do grupo */}
            <div className="flex items-center gap-2 px-4 py-2 bg-elevated/40 border-b border-white/[0.05]">
              <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                <span className="text-[12px] font-bold text-text truncate">{g.nome}</span>
                {g.codigo && (
                  <span className="text-[10px] text-muted font-mono flex-shrink-0">#{g.codigo}</span>
                )}
                {g.rows.length > 1 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full badge-orange flex-shrink-0">
                    {g.rows.length} OS
                  </span>
                )}
                {g.nRevisitas > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full badge-red flex-shrink-0">
                    {g.nRevisitas} revisita{g.nRevisitas > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted flex-shrink-0">
                {primeiraData}{primeiraData !== ultimaData ? ` → ${ultimaData}` : ''}
              </span>
            </div>

            {/* Timeline */}
            {g.sorted.length === 1 ? (
              /* Caso simples: 1 OS — linha plana sem rail */
              <button
                key={g.sorted[0].numos}
                className="w-full text-left flex items-center gap-3 px-4 py-2.5
                           hover:bg-primary/[0.04] border-b border-white/[0.03]
                           transition-colors text-[11px] cursor-pointer"
                onClick={() => onRowClick?.(g.sorted[0])}
              >
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${_dotColor(g.sorted[0]._situacaoEfetiva)}`} />
                <span className="font-mono text-primary w-20 flex-shrink-0">{g.sorted[0].numos}</span>
                <span className="text-muted w-28 flex-shrink-0">{g.sorted[0].datacadastro?.split(' ')[0] ?? '—'}</span>
                <span className="text-secondary truncate flex-1 min-w-0">{g.sorted[0].tiposervico ?? '—'}</span>
                <span className="text-muted flex-shrink-0">{shortEquipe(g.sorted[0].nomedaequipe) || '—'}</span>
                <Badge variant={situacaoVariant(g.sorted[0]._situacaoEfetiva)} className="flex-shrink-0">
                  {g.sorted[0]._situacaoEfetiva}
                </Badge>
              </button>
            ) : (
              /* Timeline com rail vertical */
              <div className="relative pl-[46px] pr-4">
                {/* Rail vertical */}
                <div className="absolute left-[22px] top-0 bottom-0 w-px bg-surface" />

                {g.sorted.map((r: OSRow, i: number) => {
                  const gap    = _computeGap(g.sorted[i - 1], r)
                  const badge  = _revisitaBadge(gap)
                  const isLast = i === g.sorted.length - 1
                  const ativo  = r._situacaoEfetiva !== 'Concluída'
                  const dotCls = _dotColor(r._situacaoEfetiva)

                  return (
                    <div key={r.numos}>
                      {/* Conector de gap entre OS */}
                      {i > 0 && showGap && (
                        <div className="flex items-center gap-2 py-1 text-[9px] text-muted/50">
                          {gap != null ? `${gap}d depois` : ''}
                          {badge && (
                            <Badge variant={badge.variant} className="text-[9px] px-1 py-px">
                              {badge.label}
                            </Badge>
                          )}
                        </div>
                      )}
                      {i > 0 && !showGap && badge && (
                        <div className="py-0.5">
                          <Badge variant={badge.variant} className="text-[9px] px-1 py-px">{badge.label}</Badge>
                        </div>
                      )}

                      {/* Linha da OS */}
                      <button
                        className="relative w-full text-left flex items-center gap-3 py-2
                                   hover:bg-primary/[0.04] transition-colors text-[11px] cursor-pointer"
                        onClick={() => onRowClick?.(r)}
                      >
                        {/* Dot no rail */}
                        <span className={`absolute -left-[28px] top-1/2 -translate-y-1/2
                                          w-3 h-3 rounded-full ring-2 ring-card flex-shrink-0
                                          ${dotCls} ${isLast && ativo ? 'animate-pulse' : ''}`} />

                        <span className="font-mono text-primary w-20 flex-shrink-0">{r.numos}</span>
                        <span className="text-muted w-28 flex-shrink-0 text-[10px]">
                          {r.datacadastro?.split(' ')[0] ?? '—'}
                        </span>
                        <span className="text-secondary truncate flex-1 min-w-0">{r.tiposervico ?? '—'}</span>
                        <span className="text-muted text-[10px] flex-shrink-0 hidden sm:block">
                          {shortEquipe(r.nomedaequipe) || '—'}
                        </span>
                        <Badge variant={situacaoVariant(r._situacaoEfetiva)} className="flex-shrink-0 text-[9px]">
                          {r._situacaoEfetiva}
                        </Badge>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PeriodoGroupedTable({ rows, density, onRowClick, equipe }: {
  rows: OSRow[]; density: string; onRowClick?: (r: OSRow) => void; equipe?: string
}) {
  const groups = useMemo(() => {
    const map: Record<string, OSRow[]> = {}
    for (const r of rows) {
      const p = (r.periodo || '').trim() || 'Sem Período'
      ;(map[p] = map[p] || []).push(r)
    }
    for (const p of Object.keys(map)) {
      map[p].sort((a, b) => (a.bairro || '').localeCompare(b.bairro || '', 'pt-BR'))
    }
    return Object.entries(map).sort(([a], [b]) => {
      const ia = PERIOD_ORDER.indexOf(a.toLowerCase())
      const ib = PERIOD_ORDER.indexOf(b.toLowerCase())
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [rows])

  const rowPy = density === 'mini' ? 'py-1' : density === 'compact' ? 'py-1.5' : 'py-2.5'

  // Larguras fixas — mesma referência no header e nas linhas
  const C = {
    aging:   'w-14  flex-shrink-0',
    numos:   'w-28  flex-shrink-0',
    cliente: 'w-52  flex-shrink-0',
    cidade:  'w-40  flex-shrink-0',
    bairro:  'w-44  flex-shrink-0',
    logr:    'w-60  flex-shrink-0',
    tipo:    'w-36  flex-shrink-0',
    status:  'flex-shrink-0',
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1200px]">

        {/* Nome da equipe filtrada */}
        {equipe && (
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/[0.05] border-b border-primary/20">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Equipe</span>
            <span className="text-[12px] font-bold text-primary">{shortEquipe(equipe)}</span>
            <span className="text-[11px] text-muted">— {rows.length} OS</span>
          </div>
        )}

        {/* Cabeçalho de colunas */}
        <div className="flex items-center gap-3 px-4 py-2 bg-elevated/40 border-b border-white/[0.08]
                        text-[10px] font-bold uppercase tracking-wide text-muted">
          <span className={`${C.aging}  text-center`}>Aging</span>
          <span className={C.numos}>Nº OS</span>
          <span className={C.cliente}>Cliente</span>
          <span className={C.tipo}>Tipo</span>
          <span className={C.cidade}>Cidade</span>
          <span className={C.bairro}>Bairro</span>
          <span className={C.logr}>Endereço</span>
          <span className={C.status}>Situação</span>
        </div>

        {groups.length === 0 && (
          <p className="px-6 py-10 text-center text-[12px] text-muted italic">
            Nenhuma OS encontrada para esta equipe.
          </p>
        )}

        {groups.map(([periodo, periodoRows], gi) => {
          const isManha = periodo.toLowerCase().includes('manh')
          const isTarde = periodo.toLowerCase().includes('tarde')
          const color   = isManha ? 'text-yellow'          : isTarde ? 'text-indigo-400'          : 'text-secondary'
          const bg      = isManha ? 'bg-yellow/[0.06]'     : isTarde ? 'bg-purple/[0.06]'     : 'bg-surface/30'
          const dot     = isManha ? 'bg-yellow'            : isTarde ? 'bg-purple'            : 'bg-secondary'
          const border  = isManha ? 'border-amber-400/[0.25]' : isTarde ? 'border-indigo-400/[0.25]' : 'border-white/[0.08]'

          return (
            <div key={periodo}>
              {/* Cabeçalho do período */}
              {(() => {
                const inst  = periodoRows.filter(r => r._tipo === 'INSTALACAO').length
                const manut = periodoRows.filter(r => r._tipo === 'MANUTENCAO').length
                const serv  = periodoRows.length - inst - manut
                const tipoItems: { n: number; label: string }[] = [
                  inst  > 0 ? { n: inst,  label: inst  === 1 ? 'Instalação'  : 'Instalações' } : null,
                  manut > 0 ? { n: manut, label: manut === 1 ? 'Manutenção'  : 'Manutenções' } : null,
                  serv  > 0 ? { n: serv,  label: serv  === 1 ? 'Serviço'     : 'Serviços'    } : null,
                ].filter(Boolean) as { n: number; label: string }[]
                return (
                  <div className={`flex items-center gap-2.5 px-4 py-2.5 border-b ${border}
                                  ${gi > 0 ? 'border-t border-white/[0.08]' : ''} ${bg}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                    <span className={`text-[11px] font-bold uppercase tracking-[0.06em] ${color}`}>
                      Período: {periodo}
                    </span>
                    <span className="text-[11px] font-mono text-muted ml-1">— {periodoRows.length} OS</span>
                    <div className="ml-auto flex items-center gap-2">
                      {tipoItems.map(({ n, label }, idx) => (
                        <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted">
                          {idx > 0 && <span className="text-white/20">|</span>}
                          <span className="font-mono font-bold text-secondary">{n}</span>
                          <span>{label}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()}


              {/* Linhas */}
              {(periodoRows as OSRow[]).map((row: OSRow, i: number) => {
                const aging      = row._aging ?? 0
                const agingColor = aging >= 6 ? 'text-red'   : aging >= 3 ? 'text-yellow'  : 'text-cyan'
                const agingBg    = aging >= 6 ? 'bg-red/10'  : aging >= 3 ? 'bg-yellow/10' : 'bg-cyan/10'
                return (
                  <div
                    key={row.numos || i}
                    onClick={() => onRowClick?.(row)}
                    className={`flex items-center gap-3 px-4 ${rowPy} cursor-pointer
                                hover:bg-surface/30 transition-all border-b border-white/[0.03]`}
                  >
                    <span className={`${C.aging} text-center`}>
                      <span className={`inline-block font-mono font-bold text-[11px] rounded-full px-2 py-0.5 ${agingColor} ${agingBg}`}>
                        {aging}d
                      </span>
                    </span>
                    <span className={`${C.numos} font-mono text-[11px] text-secondary`}>
                      {row.numos}
                    </span>
                    <span
                      className={`${C.cliente} text-[12px] ${row.nomecliente ? 'text-text font-medium' : 'text-muted italic'}`}
                      title={(row.nomecliente || row.codigocliente || 'Sem nome no cadastro') as string}
                    >
                      {row.nomecliente || (row.codigocliente ? `Cód. ${row.codigocliente}` : '(Sem nome)')}
                    </span>
                    <span className={`${C.tipo} text-[11px] text-muted`}>
                      {row.tiposervico || '—'}
                    </span>
                    <span className={`${C.cidade} text-[12px] text-muted`} title={row.nomedacidade}>
                      {(row.nomedacidade || '—').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <span className={`${C.bairro} text-[12px] text-secondary`} title={row.bairro}>
                      {(row.bairro || '—').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <span className={`${C.logr} text-[12px] text-muted`}
                          title={[row.logradouro, row.numero, row.complemento].filter(Boolean).join(', ') || '—'}>
                      {[row.logradouro, row.numero, row.complemento].filter(Boolean).join(', ') || '—'}
                    </span>
                    <div className={C.status}>
                      <Badge variant={situacaoVariant(row._situacaoEfetiva)}>
                        {row._situacaoEfetiva}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}

      </div>
    </div>
  )
}

export default function OrdensPage() {
  const os       = useOrdens()
  const logAudit = useAuditStore(s => s.log)
  const location = useLocation()
  const navigate = useNavigate()
  const [drawerOS,        setDrawerOS]        = useState<OSRow | null>(null)
  const [kpiVisible,      setKpiVisible]      = useState(true)
  const [groupBy,         setGroupBy]         = useState<'none' | 'cliente'>('none')
  const [hoverOS,         setHoverOS]         = useState<OSRow | null>(null)
  const [hoverRect,       setHoverRect]       = useState<DOMRect | null>(null)
  const [tgModal,         setTgModal]         = useState(false)
  const [copied,          setCopied]          = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tableRef   = useRef<HTMLDivElement>(null)

  // Recebe equipe pré-selecionada via React Router state (OSDrawer → "Ver Equipe")
  useEffect(() => {
    const eq = location.state?.filterEquipe
    if (eq) {
      os.setEquipe(eq)
      navigate(location.pathname, { replace: true, state: null })
      setTimeout(scrollToTable, 150)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  function scrollToTable() {
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleRowHover(row: OSRow, rect: DOMRect) {
    clearTimeout(hoverTimer.current ?? undefined)
    hoverTimer.current = setTimeout(() => {
      setHoverOS(row)
      setHoverRect(rect)
    }, 180)
  }

  function handleRowLeave() {
    clearTimeout(hoverTimer.current ?? undefined)
    setHoverOS(null)
    setHoverRect(null)
  }

  function handleRowClick(row: OSRow) {
    clearTimeout(hoverTimer.current ?? undefined)
    setHoverOS(null)
    setHoverRect(null)
    setDrawerOS(row)
  }

  async function handleCopyImage() {
    if (!tableRef.current) return
    try {
      const isDark    = !document.documentElement.classList.contains('light')
      const bg        = isDark ? '#0d1117' : '#ffffff'
      const bgHdr     = isDark ? '#111827' : '#f0f4ff'
      const colorText = isDark ? '#e2e8f0' : '#0f172a'
      const colorMuted= isDark ? '#94a3b8' : '#64748b'
      const borderClr = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'

      const now = new Date()
      const ts  = now.toLocaleDateString('pt-BR') + ' · ' +
                  now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      const equipeLabel = os.equipe ? shortEquipe(os.equipe) : 'Todas as Equipes'

      const tableEl = tableRef.current
      const capW    = Math.max(tableEl.scrollWidth, tableEl.offsetWidth)
      const capH    = tableEl.scrollHeight

      // Captura o elemento real com dimensões completas (sem modificar o DOM)
      const contentBlob = await toBlob(tableEl, {
        pixelRatio: 2,
        width:  capW,
        height: capH,
        backgroundColor: bg,
        style: { overflow: 'visible', borderRadius: '0' },
      })
      if (!contentBlob) return

      // Composita: cabeçalho Canvas + conteúdo capturado
      const SCALE  = 2
      const HDR_H  = 60   // altura lógica do cabeçalho em px
      const contentImg = await createImageBitmap(contentBlob)

      const canvas  = document.createElement('canvas')
      canvas.width  = contentImg.width            // já em 2×
      canvas.height = contentImg.height + HDR_H * SCALE
      const ctx = canvas.getContext('2d')!

      // Fundo geral
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Cabeçalho
      ctx.fillStyle = bgHdr
      ctx.fillRect(0, 0, canvas.width, HDR_H * SCALE)

      // Barra azul lateral
      ctx.fillStyle = '#3b82f6'
      ctx.fillRect(0, 0, 4 * SCALE, HDR_H * SCALE)

      // Linha separadora
      ctx.strokeStyle = borderClr
      ctx.lineWidth   = 1 * SCALE
      ctx.beginPath()
      ctx.moveTo(0, HDR_H * SCALE)
      ctx.lineTo(canvas.width, HDR_H * SCALE)
      ctx.stroke()

      // Textos do cabeçalho (esquerda)
      ctx.textBaseline = 'middle'
      ctx.fillStyle    = colorText
      ctx.font = `bold ${14 * SCALE}px system-ui,-apple-system,sans-serif`
      ctx.fillText('CABONNET · Ordens de Serviço', 18 * SCALE, 20 * SCALE)

      ctx.fillStyle = '#3b82f6'
      ctx.font = `600 ${11 * SCALE}px system-ui,-apple-system,sans-serif`
      ctx.fillText(equipeLabel, 18 * SCALE, 43 * SCALE)

      // Textos do cabeçalho (direita)
      ctx.textAlign = 'right'
      ctx.fillStyle = colorMuted
      ctx.font = `${10 * SCALE}px system-ui,-apple-system,sans-serif`
      ctx.fillText(ts, canvas.width - 16 * SCALE, 20 * SCALE)
      ctx.fillText(`${os.filtered.length} OS`, canvas.width - 16 * SCALE, 43 * SCALE)
      ctx.textAlign = 'left'

      // Conteúdo da tabela abaixo do cabeçalho
      ctx.drawImage(contentImg, 0, HDR_H * SCALE)

      const finalBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
      )

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': finalBlob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (e) {
      console.error('Clipboard error:', e)
    }
  }

  function handleExport() {
    const date = new Date().toISOString().slice(0, 10)
    logAudit('CSV exportado', `${os.filtered.length} OS · ordens_${date}.csv`, 'export')
    exportCSV(os.filtered, `ordens_${date}.csv`)
  }

  function handleExportPDF() {
    const date = new Date().toISOString().slice(0, 10)
    logAudit('PDF exportado', `${os.filtered.length} OS · ordens_${date}.pdf`, 'export')
    exportOrdensPDF(os.filtered, `ordens_${date}.pdf`)
  }


  const opts = os.options
  const tipoOpts    = (opts.tipos    ?? []).map(t => ({ value: t, label: t }))
  const cidadeOpts  = (opts.cidades  ?? []).map(c => ({ value: c, label: c }))
  const bairroOpts  = (opts.bairros  ?? []).map(b => ({ value: b, label: b }))
  const equipeOpts  = (opts.equipes  ?? []).map(e => ({ value: e, label: shortEquipe(e) }))
  const periodoOpts = (opts.periodos ?? []).map(p => ({ value: p, label: p }))

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Header: título + controles + ações ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-headline text-xl font-semibold text-text flex-1 min-w-0">
          Ordens de Serviço
        </h2>

        {/* KPI toggle */}
        <button
          onClick={() => setKpiVisible(v => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary hover:text-text
                     border border-white/[0.08] rounded-xl px-3 py-1.5 transition-all duration-fast"
        >
          <BarChart2 size={12} /> KPIs
          <ChevronUp size={11} className={`transition-transform ${kpiVisible ? '' : 'rotate-180'}`} />
        </button>

        {/* GroupBy toggle */}
        <button
          onClick={() => setGroupBy(g => g === 'cliente' ? 'none' : 'cliente')}
          className={`flex items-center gap-1.5 text-[11px] font-semibold
                     border rounded-xl px-3 py-1.5 transition-all duration-fast
                     ${groupBy === 'cliente'
                       ? 'bg-primary/15 border-primary/40 text-primary'
                       : 'border-white/[0.08] text-secondary hover:text-text'}`}
        >
          <Users size={12} /> Por Cliente
        </button>

        {/* Density toggle */}
        <div className="flex items-center gap-0.5 bg-card border border-white/[0.08] rounded-xl p-1">
          {densityOptions.map((d) => (
            <button
              key={d.value}
              onClick={() => os.setDensity(d.value)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all duration-fast
                          ${os.density === d.value
                            ? 'bg-primary/15 text-primary'
                            : 'text-muted hover:text-secondary'}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Ações */}
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            className={`gap-1.5 transition-all duration-300
              ${copied
                ? 'border-green-500/50 text-green bg-green-500/10'
                : 'border-green/30 text-green hover:bg-green/10'}`}
            onClick={handleCopyImage}
          >
            {copied
              ? <><CheckCircle size={11} /> Copiado!</>
              : <><Copy size={11} /> Copiar Imagem</>}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download size={11} /> CSV ({os.filtered.length})
          </Button>
          <Button
            variant="outline" size="sm"
            className="gap-1.5 border-cyan/30 text-cyan hover:bg-cyan/10"
            onClick={handleExportPDF}
          >
            <FileText size={11} /> PDF
          </Button>
          <Button
            variant="outline" size="sm"
            className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => setTgModal(true)}
          >
            <Send size={11} /> Telegram
          </Button>
        </div>
      </div>

      {/* ── KPI cards ── */}
      {kpiVisible && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 stagger">
          <KPICard
            title="Total OS" value={os.kpis.total} accent="primary"
            sub="ver todas"
            onClick={() => { os.clearFilters(); scrollToTable() }}
          />
          <KPICard
            title="Críticas ≥6d" value={os.kpis.criticas} accent="red"
            sub="aging ≥ 6 dias"
            onClick={() => { os.clearFilters(); os.setAging('6'); scrollToTable() }}
          />
          <KPICard
            title="Sem equipe" value={os.kpis.semEquipe} accent="yellow" icon={AlertTriangle}
            sub="sem alocação"
            onClick={() => { os.clearFilters(); os.setSemEquipe(true); scrollToTable() }}
          />
          <KPICard
            title="Agend. hoje" value={os.kpis.agendHoje} accent="green"
            sub="para hoje"
            onClick={() => { os.clearFilters(); os.setAgendHoje(true); scrollToTable() }}
          />
          <KPICard
            title="Amanhã" value={os.kpis.agendAmanha} accent="cyan" icon={CalendarClock}
            sub="agendadas p/ amanhã"
            onClick={() => { os.clearFilters(); os.setAgendAmanha(true); scrollToTable() }}
          />
          <KPICard
            title="Agend. Futuro" value={os.kpis.agendFuturo} accent="orange" icon={CalendarClock}
            sub="amanhã em diante"
            onClick={() => { os.clearFilters(); os.setAgendFuturo(true); scrollToTable() }}
          />
        </div>
      )}

      {/* ── Resumo por Tipo ── */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button
          onClick={() => { os.clearFilters(); os.setTipoOs('INSTALACAO'); scrollToTable() }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full
                     bg-cyan/10 border border-cyan/20 text-cyan
                     text-[12px] font-semibold hover:bg-cyan/20 transition-all duration-fast"
        >
          <Router size={12} /> Instalação
          <span className="bg-cyan/20 text-cyan rounded-full px-1.5 py-0 text-[11px] font-bold tabular-nums">
            {os.kpis.instalacao}
          </span>
        </button>
        <button
          onClick={() => { os.clearFilters(); os.setTipoOs('MANUTENCAO'); scrollToTable() }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full
                     bg-orange/10 border border-orange/20 text-orange
                     text-[12px] font-semibold hover:bg-orange/20 transition-all duration-fast"
        >
          <Wrench size={12} /> Manutenção
          <span className="bg-orange/20 text-orange rounded-full px-1.5 py-0 text-[11px] font-bold tabular-nums">
            {os.kpis.manutencao}
          </span>
        </button>
        <button
          onClick={() => { os.clearFilters(); scrollToTable() }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full
                     bg-purple/10 border border-purple/20 text-purple
                     text-[12px] font-semibold hover:bg-purple/20 transition-all duration-fast"
        >
          <HardHat size={12} /> Serviço
          <span className="bg-purple/20 text-purple rounded-full px-1.5 py-0 text-[11px] font-bold tabular-nums">
            {os.kpis.servico}
          </span>
        </button>
      </div>

      {/* ── Barra de filtros ── */}
      <div className="bg-card border border-white/[0.08] rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <SearchBox
          value={os.search}
          onChange={os.setSearch}
          placeholder="Buscar cliente, nº OS, cidade…"
          className="w-64"
        />
        <FilterSelect value={os.status}     onChange={os.setStatus}     options={statusOptions}     placeholder="Status"      className="w-44" />
        <FilterSelect value={os.tipo}       onChange={os.setTipo}       options={tipoOpts}          placeholder="Tipo"        className="w-36" />
        <FilterSelect value={os.cidade}     onChange={os.setCidade}     options={cidadeOpts}        placeholder="Cidade"      className="w-36" />
        <FilterSelect value={os.bairro}     onChange={os.setBairro}     options={bairroOpts}        placeholder="Bairro"      className="w-32" />
        <FilterSelect value={os.equipe}     onChange={os.setEquipe}     options={equipeOpts}        placeholder="Equipe"      className="w-36" />
        <FilterSelect value={os.aging}      onChange={os.setAging}      options={agingOptions}      placeholder="Aging"       className="w-32" />
        <FilterSelect value={os.fornecedor} onChange={os.setFornecedor} options={fornecedorOptions} placeholder="Fornecedor"  className="w-36" />
        <FilterSelect value={os.periodo}   onChange={os.setPeriodo}   options={periodoOpts}       placeholder="Período"     className="w-32" />

        {/* Toggle Rede */}
        <button
          onClick={() => os.setHideRede(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold
                      border transition-all duration-fast flex-shrink-0
                      ${os.hideRede
                        ? 'bg-red/[0.08] border-red/20 text-red/80 hover:bg-red/[0.14]'
                        : 'bg-green/[0.08] border-green/20 text-green hover:bg-green/[0.14]'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${os.hideRede ? 'bg-red/70' : 'bg-green'}`} />
          Rede {os.hideRede ? 'OFF' : 'ON'}
        </button>

        <Button variant="ghost" size="sm" onClick={os.clearFilters}>Limpar</Button>
      </div>

      {/* Banner filtros ativos */}
      {os.filtered.length !== os.ordens.length && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl
                        bg-primary/[0.06] border border-primary/20 text-[12px] text-secondary">
          <span className="flex items-center gap-2 flex-wrap">
            Exibindo <strong className="text-text">{os.filtered.length}</strong> de{' '}
            <strong className="text-text">{os.ordens.length}</strong> OS
            {os.semEquipe    && <span className="badge-yellow  rounded-full px-2 py-0.5 text-[11px] font-bold">Sem equipe</span>}
            {os.agendHoje    && <span className="badge-green   rounded-full px-2 py-0.5 text-[11px] font-bold">Agend. hoje</span>}
            {os.agendAmanha  && <span className="badge-cyan    rounded-full px-2 py-0.5 text-[11px] font-bold">Amanhã</span>}
            {os.agendFuturo  && <span className="badge-orange  rounded-full px-2 py-0.5 text-[11px] font-bold">Agend. Futuro</span>}
            {os.hideRede     && <span className="rounded-full px-2 py-0.5 text-[11px] font-bold bg-red/10 text-red/80 border border-red/20">Rede oculta</span>}
            {os.periodo      && <span className="badge-purple  rounded-full px-2 py-0.5 text-[11px] font-bold">{os.periodo}</span>}
          </span>
          <button onClick={os.clearFilters} className="text-muted hover:text-red transition-colors text-[11px] font-semibold">
            Limpar filtros
          </button>
        </div>
      )}

      {/* Tabela */}
      <div ref={tableRef} className="bg-card border border-white/[0.08] rounded-xl overflow-hidden">
        {os.isLoading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={8} /></div>
        ) : os.equipe ? (
          /* ── Vista agrupada por período (quando equipe está selecionada) ── */
          <PeriodoGroupedTable
            rows={os.filtered}
            density={os.density as "normal" | "compact" | "mini"}
            onRowClick={handleRowClick}
            equipe={os.equipe}
          />
        ) : groupBy === 'cliente' ? (
          /* ── Vista agrupada por cliente ── */
          <ClienteGroupedTable
            rows={os.filtered}
            density={os.density as "normal" | "compact" | "mini"}
            onRowClick={handleRowClick}
          />
        ) : (
          /* ── Tabela flat padrão ── */
          <DataTable
            columns={columns}
            rows={os.paginated}
            density={os.density as "normal" | "compact" | "mini"}
            onRowClick={handleRowClick}
            onRowHover={handleRowHover}
            onRowLeave={handleRowLeave}
          />
        )}

        {/* Paginação — apenas no modo flat */}
        {!os.equipe && os.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3
                          border-t border-white/[0.05] text-[11px] text-muted">
            <span>
              Página {os.page} de {os.totalPages} — {os.filtered.length} OS
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost" size="sm"
                onClick={() => os.setPage(p => Math.max(1, p - 1))}
                disabled={os.page === 1}
              >
                ‹
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => os.setPage(p => Math.min(os.totalPages, p + 1))}
                disabled={os.page === os.totalPages}
              >
                ›
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Hover card — only when drawer is closed */}
      {!drawerOS && <OSHoverCard os={hoverOS} anchorRect={hoverRect} />}

      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />

      {/* ── Modal Telegram ─────────────────────────────────────────── */}
      <TelegramOrdensModal
        open={tgModal}
        onClose={() => setTgModal(false)}
        ordens={os.ordens}
      />
    </div>
  )
}
