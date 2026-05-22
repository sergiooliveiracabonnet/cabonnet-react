// @ts-nocheck
import { useState, useRef, useEffect, useMemo } from 'react'
import { BarChart2, ChevronUp, AlertTriangle, Download, Send, CheckCircle, XCircle, CalendarClock, FileText, Router, Wrench, HardHat, Copy, Users } from 'lucide-react'
import { useOrdens } from '../../hooks/useOrdens'
import { KPICard } from '../../components/ui/KPICard'
import { SearchBox } from '../../components/ui/SearchBox'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { DataTable } from '../../components/ui/DataTable'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
import { exportCSV } from '../../lib/export'
import { exportOrdensPDF } from '../../lib/exportOrdensPDF'
import { captureOSPorEquipe, captureOSDetalhado, captureOSPorPeriodo } from '../../lib/captureOSTable'
import { telegram } from '../../lib/api'
import OSDrawer from './OSDrawer'
import { OSHoverCard } from './OSHoverCard'

const FORNECEDOR_OPTS = [
  { value: 'WES',        label: 'WES',          color: '#a78bfa' },
  { value: 'Instacable', label: 'Instacable',    color: '#eab308' },
  { value: 'THM',        label: 'THM',           color: '#06b6d4' },
  { value: 'REDE',       label: 'Rede',          color: '#22c55e' },
  { value: 'MANUTENCAO', label: 'Manutenção',    color: '#f97316' },
  { value: 'INSTALACAO', label: 'Instalação',    color: '#0ea5e9' },
  { value: 'INTERNO',    label: 'COPE Interno',  color: '#94a3b8' },
]

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

const columns = [
  { key: 'numos',           label: 'Nº OS' },
  { key: '_aging',          label: 'Aging',
    render: (v) => {
      const c = v >= 6 ? 'red' : v >= 3 ? 'yellow' : 'cyan'
      return <Badge variant={c}>{v ?? 0}d</Badge>
    }
  },
  { key: '_riskScore',      label: 'Risco',
    render: (v: number) => {
      const score = v ?? 0
      const [variant, label] =
        score >= 70 ? ['red',    'Crítico'] :
        score >= 40 ? ['orange', 'Alto']    :
        score >= 20 ? ['yellow', 'Médio']   :
                      ['green',  'Baixo']
      return <Badge variant={variant as 'red' | 'orange' | 'yellow' | 'green'}>{label} {score}</Badge>
    }
  },
  { key: 'nomecliente',     label: 'Cliente',
    render: (v, row) => v
      ? v
      : <span className="text-muted italic text-[11px]">
          {row?.codigocliente ? `Cód. ${row.codigocliente}` : '(Sem nome)'}
        </span>
  },
  { key: 'nomedacidade',    label: 'Cidade' },
  { key: 'bairro',          label: 'Bairro' },
  { key: 'logradouro',      label: 'Endereço' },
  { key: 'tiposervico',     label: 'Tipo' },
  { key: 'nomedaequipe',    label: 'Equipe', render: (v) => shortEquipe(v) },
  { key: '_situacaoEfetiva', label: 'Situação',
    render: (v) => <Badge variant={situacaoVariant(v)}>{v}</Badge>
  },
  { key: 'dataagendamento', label: 'Agend.',
    render: (v) => v ? v.slice(0, 10) : '—'
  },
]


// ── Ordenação de períodos ─────────────────────────────────────────────────────
const PERIOD_ORDER = ['manhã', 'tarde']

// ── Agrupamento por cliente — Timeline visual ─────────────────────────────────

function _parseDateStr(s) {
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

function _computeGap(prev, curr) {
  if (!prev) return null
  const prevClose = _parseDateStr(prev.dataexecucao || prev.databaixa)
  const currOpen  = _parseDateStr(curr.datacadastro)
  if (!prevClose || !currOpen) return null
  const dias = Math.floor((currOpen - prevClose) / 86400000)
  return dias >= 0 ? dias : null
}

function _dotColor(situacao) {
  if (!situacao) return 'bg-muted/40'
  if (situacao === 'Concluída') return 'bg-green'
  if (situacao === 'Atendimento' || situacao === 'Reagendamento') return 'bg-cyan'
  return 'bg-yellow'
}

function _revisitaBadge(gapDias) {
  if (gapDias == null || gapDias > 30) return null
  if (gapDias < 7)  return { variant: 'red',    label: `Revisita ${gapDias}d` }
  if (gapDias < 15) return { variant: 'orange',  label: `Revisita ${gapDias}d` }
  return               { variant: 'yellow',  label: `Revisita ${gapDias}d` }
}

function ClienteGroupedTable({ rows, density, onRowClick }) {
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
                onClick={() => onRowClick(g.sorted[0])}
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
                <div className="absolute left-[22px] top-0 bottom-0 w-px bg-white/[0.08]" />

                {g.sorted.map((r, i) => {
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
                        onClick={() => onRowClick(r)}
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

function PeriodoGroupedTable({ rows, density, onRowClick, equipe }) {
  const groups = useMemo(() => {
    const map = {}
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
            <span className="text-[10px] font-black uppercase tracking-wider text-muted">Equipe</span>
            <span className="text-[12px] font-bold text-primary">{shortEquipe(equipe)}</span>
            <span className="text-[11px] text-muted">— {rows.length} OS</span>
          </div>
        )}

        {/* Cabeçalho de colunas */}
        <div className="flex items-center gap-3 px-4 py-2 bg-elevated/40 border-b border-white/[0.07]
                        text-[10px] font-black uppercase tracking-wide text-muted">
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
          const color   = isManha ? 'text-amber-400'          : isTarde ? 'text-indigo-400'          : 'text-secondary'
          const bg      = isManha ? 'bg-amber-400/[0.06]'     : isTarde ? 'bg-indigo-400/[0.06]'     : 'bg-white/[0.03]'
          const dot     = isManha ? 'bg-amber-400'            : isTarde ? 'bg-indigo-400'            : 'bg-secondary'
          const border  = isManha ? 'border-amber-400/[0.25]' : isTarde ? 'border-indigo-400/[0.25]' : 'border-white/[0.08]'

          return (
            <div key={periodo}>
              {/* Cabeçalho do período */}
              {(() => {
                const inst  = periodoRows.filter(r => r._tipo === 'INSTALACAO').length
                const manut = periodoRows.filter(r => r._tipo === 'MANUTENCAO').length
                const serv  = periodoRows.length - inst - manut
                const tipoItems = [
                  inst  > 0 && { n: inst,  label: inst  === 1 ? 'Instalação'  : 'Instalações' },
                  manut > 0 && { n: manut, label: manut === 1 ? 'Manutenção'  : 'Manutenções' },
                  serv  > 0 && { n: serv,  label: serv  === 1 ? 'Serviço'     : 'Serviços'    },
                ].filter(Boolean)
                return (
                  <div className={`flex items-center gap-2.5 px-4 py-2.5 border-b ${border}
                                  ${gi > 0 ? 'border-t border-white/[0.08]' : ''} ${bg}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                    <span className={`text-[11px] font-black uppercase tracking-[1.4px] ${color}`}>
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
              {periodoRows.map((row, i) => {
                const aging      = row._aging ?? 0
                const agingColor = aging >= 6 ? 'text-red'   : aging >= 3 ? 'text-yellow'  : 'text-cyan'
                const agingBg    = aging >= 6 ? 'bg-red/10'  : aging >= 3 ? 'bg-yellow/10' : 'bg-cyan/10'
                return (
                  <div
                    key={row.numos || i}
                    onClick={() => onRowClick?.(row)}
                    className={`flex items-center gap-3 px-4 ${rowPy} cursor-pointer
                                hover:bg-white/[0.035] transition-all border-b border-white/[0.03]`}
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
                      title={row.nomecliente || row.codigocliente || 'Sem nome no cadastro'}
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
  const os = useOrdens()
  const [drawerOS,        setDrawerOS]        = useState(null)
  const [kpiVisible,      setKpiVisible]      = useState(true)
  const [groupBy,         setGroupBy]         = useState('none')  // 'none' | 'cliente'
  const [hoverOS,         setHoverOS]         = useState(null)
  const [hoverRect,       setHoverRect]       = useState(null)
  const [tgModal,         setTgModal]         = useState(false)
  const [tgFornecedor,    setTgFornecedor]    = useState('WES')
  const [tgSending,       setTgSending]       = useState(null)    // null | 'resumo' | 'detalhado'
  const [tgResult,        setTgResult]        = useState(null)   // 'ok' | 'error'
  const [copied,          setCopied]          = useState(false)
  const hoverTimer = useRef(null)
  const tableRef   = useRef(null)

  // Recebe equipe pré-selecionada vinda do OSDrawer ("Ver Equipe")
  useEffect(() => {
    const eq = sessionStorage.getItem('pendingEquipe')
    if (eq) {
      sessionStorage.removeItem('pendingEquipe')
      os.setEquipe(eq)
      setTimeout(scrollToTable, 150)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scrollToTable() {
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleRowHover(row, rect) {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => {
      setHoverOS(row)
      setHoverRect(rect)
    }, 180)
  }

  function handleRowLeave() {
    clearTimeout(hoverTimer.current)
    setHoverOS(null)
    setHoverRect(null)
  }

  function handleRowClick(row) {
    clearTimeout(hoverTimer.current)
    setHoverOS(null)
    setHoverRect(null)
    setDrawerOS(row)
  }

  async function handleCopyImage() {
    try {
      const canvas = captureOSPorPeriodo(os.filtered, shortEquipe(os.equipe))
      canvas.toBlob(async (blob) => {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }, 'image/png')
    } catch (e) {
      console.error('Clipboard error:', e)
    }
  }

  function handleExport() {
    const date = new Date().toISOString().slice(0, 10)
    exportCSV(os.filtered, `ordens_${date}.csv`)
  }

  function handleExportPDF() {
    const date = new Date().toISOString().slice(0, 10)
    exportOrdensPDF(os.filtered, `ordens_${date}.pdf`)
  }

  async function handleSendTelegram(modo) {
    setTgSending(modo)
    setTgResult(null)
    try {
      const opt    = FORNECEDOR_OPTS.find(f => f.value === tgFornecedor)
      const label  = opt?.label ?? tgFornecedor
      const color  = opt?.color ?? '#0ea5e9'
      const date   = new Date().toLocaleDateString('pt-BR')

      const isFornecedorGrupo = tgFornecedor === 'WES' || tgFornecedor === 'Instacable'

      let rows = os.ordens.filter(r => r._fornecedor === tgFornecedor)

      // Para WES e Instacable: filtrar apenas OS agendadas para hoje (suporta DD/MM/YYYY e ISO YYYY-MM-DD)
      if (isFornecedorGrupo) {
        const t  = new Date()
        const dd = String(t.getDate()).padStart(2, '0')
        const mm = String(t.getMonth() + 1).padStart(2, '0')
        const yyyy = String(t.getFullYear())
        const hojeDMY = `${dd}/${mm}/${yyyy}`
        const hojeISO = `${yyyy}-${mm}-${dd}`
        rows = rows.filter(r => {
          const ag = (r.dataagendamento ?? '').trim()
          return ag.startsWith(hojeDMY) || ag.startsWith(hojeISO)
        })
      }

      if (modo === 'resumo') {
        const png     = captureOSPorEquipe(rows, label, color)
        const caption = isFornecedorGrupo
          ? `<b>Cabonnet · ${label} — Resumo</b>\nOS agendadas para hoje — ${date}\n${rows.length} OS · ordenado menor → maior`
          : `<b>Cabonnet · ${label} — Resumo</b>\nOS por equipe — ${date}\n${rows.length} OS · ordenado menor → maior`
        await telegram.sendPhoto(png, caption, 'alertas')
      } else {
        const png     = captureOSDetalhado(rows, label, color)
        const caption = isFornecedorGrupo
          ? `<b>Cabonnet · ${label} — Relatório Detalhado</b>\nOS agendadas para hoje — ${date}\n${rows.length} OS · aging desc dentro de cada equipe`
          : `<b>Cabonnet · ${label} — Relatório Detalhado</b>\nTodas as OS por equipe — ${date}\n${rows.length} OS · aging desc dentro de cada equipe`
        await telegram.sendPhoto(png, caption, 'alertas', true)   // as_document=true → sem compressão
      }

      setTgResult('ok')
      setTimeout(() => { setTgModal(false); setTgResult(null) }, 1800)
    } catch {
      setTgResult('error')
    } finally {
      setTgSending(null)
    }
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
                     border border-white/[0.07] rounded-xl px-3 py-1.5 transition-all duration-fast"
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
                       : 'border-white/[0.07] text-secondary hover:text-text'}`}
        >
          <Users size={12} /> Por Cliente
        </button>

        {/* Density toggle */}
        <div className="flex items-center gap-0.5 bg-card border border-white/[0.07] rounded-xl p-1">
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
          {os.equipe && (
            <Button
              variant="outline" size="sm"
              className={`gap-1.5 transition-all duration-300
                ${copied
                  ? 'border-green-500/50 text-green-400 bg-green-500/10'
                  : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'}`}
              onClick={handleCopyImage}
            >
              {copied
                ? <><CheckCircle size={11} /> Copiado!</>
                : <><Copy size={11} /> Copiar Imagem</>}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download size={11} /> CSV ({os.filtered.length})
          </Button>
          <Button
            variant="outline" size="sm"
            className="gap-1.5 border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
            onClick={handleExportPDF}
          >
            <FileText size={11} /> PDF
          </Button>
          <Button
            variant="outline" size="sm"
            className="gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            onClick={() => { setTgResult(null); setTgModal(true) }}
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
      <div className="bg-card border border-white/[0.07] rounded-xl p-3 flex flex-wrap gap-2 items-center">
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
      <div ref={tableRef} className="bg-card border border-white/[0.07] rounded-xl overflow-hidden">
        {os.isLoading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={8} /></div>
        ) : os.equipe ? (
          /* ── Vista agrupada por período (quando equipe está selecionada) ── */
          <PeriodoGroupedTable
            rows={os.filtered}
            density={os.density}
            onRowClick={handleRowClick}
            equipe={os.equipe}
          />
        ) : groupBy === 'cliente' ? (
          /* ── Vista agrupada por cliente ── */
          <ClienteGroupedTable
            rows={os.filtered}
            density={os.density}
            onRowClick={handleRowClick}
          />
        ) : (
          /* ── Tabela flat padrão ── */
          <DataTable
            columns={columns}
            rows={os.paginated}
            density={os.density}
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
      <Modal
        open={tgModal}
        onClose={() => { if (!tgSending) setTgModal(false) }}
        title="Enviar via Telegram"
        subtitle="Captura OS por equipe e envia para Alertas | Cabonnet"
        maxWidth="480px"
      >
        <div className="p-6 space-y-5">

          {/* Seletor de fornecedor */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-muted uppercase tracking-wide">Fornecedor</p>
            <div className="flex flex-wrap gap-2">
              {FORNECEDOR_OPTS.map(opt => {
                const rows  = os.ordens.filter(r => r._fornecedor === opt.value)
                const active = tgFornecedor === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTgFornecedor(opt.value)}
                    disabled={!!tgSending}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] font-semibold
                                transition-all duration-fast
                                ${active
                                  ? 'border-white/20 bg-white/[0.08] text-text'
                                  : 'border-white/[0.06] text-muted hover:text-secondary hover:border-white/10'}`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.color }} />
                    {opt.label}
                    <span className={`text-[10px] font-normal ${active ? 'text-secondary' : 'text-muted'}`}>
                      {rows.length}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Preview */}
          {(() => {
            const opt    = FORNECEDOR_OPTS.find(f => f.value === tgFornecedor)
            const isForn = tgFornecedor === 'WES' || tgFornecedor === 'Instacable'
            const t      = new Date()
            const dd     = String(t.getDate()).padStart(2, '0')
            const mm     = String(t.getMonth() + 1).padStart(2, '0')
            const yyyy   = String(t.getFullYear())
            const hojeDMY = `${dd}/${mm}/${yyyy}`
            const hojeISO = `${yyyy}-${mm}-${dd}`
            const allRows = os.ordens.filter(r => r._fornecedor === tgFornecedor)
            const rows    = isForn
              ? allRows.filter(r => { const ag = (r.dataagendamento ?? '').trim(); return ag.startsWith(hojeDMY) || ag.startsWith(hojeISO) })
              : allRows
            const equipes = new Set(rows.map(r => r.nomedaequipe?.trim() || '(Sem Equipe)')).size
            const scopeLabel = isForn ? `agendadas hoje · ${hojeDMY.slice(0,5)}` : 'todas do período'
            return (
              <div className="rounded-lg bg-elevated border border-white/[0.06] px-4 py-3 text-[12px] space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-text">{opt?.label}</p>
                  <span className="text-[10px] text-muted">Alertas | Cabonnet</span>
                </div>
                {isForn && (
                  <p className="text-[10px] text-cyan font-semibold">
                    📅 Somente OS agendadas para hoje ({rows.length} de {allRows.length} total)
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/[0.03] rounded px-3 py-2 space-y-0.5">
                    <p className="text-[11px] font-bold text-muted uppercase tracking-wide">Resumo</p>
                    <p className="text-secondary text-[12px]">{equipes} equipes · {rows.length} OS</p>
                    <p className="text-muted text-[11px]">Imagem · {scopeLabel}</p>
                  </div>
                  <div className="bg-white/[0.03] rounded px-3 py-2 space-y-0.5">
                    <p className="text-[11px] font-bold text-muted uppercase tracking-wide">Detalhado</p>
                    <p className="text-secondary text-[12px]">{rows.length} OS individualmente</p>
                    <p className="text-muted text-[11px]">Documento · {scopeLabel}</p>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Feedback */}
          {tgResult === 'ok' && (
            <div className="flex items-center gap-2 text-green text-[13px] font-semibold">
              <CheckCircle size={16} /> Enviado com sucesso!
            </div>
          )}
          {tgResult === 'error' && (
            <div className="flex items-center gap-2 text-red text-[13px] font-semibold">
              <XCircle size={16} /> Falha ao enviar. Verifique o servidor.
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={() => setTgModal(false)} disabled={!!tgSending}>
              Cancelar
            </Button>
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => handleSendTelegram('resumo')}
              disabled={!!tgSending}
            >
              {tgSending === 'resumo'
                ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Gerando…</>
                : <><Send size={11} /> Resumo</>
              }
            </Button>
            <Button
              size="sm" className="gap-1.5"
              onClick={() => handleSendTelegram('detalhado')}
              disabled={!!tgSending}
            >
              {tgSending === 'detalhado'
                ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Gerando…</>
                : <><Send size={11} /> Detalhado</>
              }
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
