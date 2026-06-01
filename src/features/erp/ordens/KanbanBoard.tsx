import { useMemo, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import type { OSRow, TipoEquipe } from '../../../lib/types'
import {
  Clock, AlertTriangle, CheckCircle2, XCircle, Zap, Plus,
  User, MapPin, Package, Wrench, Network, GripVertical,
  Sun, Sunset, Sunrise, X, Info, Calendar, Building2,
  FileText, ShieldAlert,
} from 'lucide-react'
import { useERPRows } from '../useERPRows'
import { useERPStore, getKanbanColumn, type KanbanColumnId } from '../../../store/erpStore'
import { useAuditStore } from '../../../store/auditStore'
import { shortEquipe } from '../../../lib/osFormat'
import { useIsOperador } from '../../../hooks/useRole'

// ─── Tipos locais ────────────────────────────────────────────────────────────

type IconComp = ComponentType<{ size?: number; className?: string }>

interface ColDef {
  id:      string; label: string; Icon: IconComp
  iconCls: string; border: string; bg: string; badge: string; dot: string
}

interface SlaBadge { label: string; cls: string }

const COLS: ColDef[] = [
  { id: 'nova',        label: 'Nova',          Icon: Plus,         iconCls: 'text-primary', border: 'border-primary/30', bg: 'bg-primary/[0.04]', badge: 'bg-primary/20 text-primary',  dot: 'bg-primary' },
  { id: 'agendada',    label: 'Agendada',       Icon: Clock,        iconCls: 'text-yellow',  border: 'border-yellow/30',  bg: 'bg-yellow/[0.04]',  badge: 'bg-yellow/20 text-yellow',    dot: 'bg-yellow'  },
  { id: 'atendimento', label: 'Em Atendimento', Icon: Zap,          iconCls: 'text-purple',  border: 'border-purple/30',  bg: 'bg-purple/[0.04]',  badge: 'bg-purple/20 text-purple',    dot: 'bg-purple'  },
  { id: 'concluida',   label: 'Concluída',      Icon: CheckCircle2, iconCls: 'text-green',   border: 'border-green/30',   bg: 'bg-green/[0.04]',   badge: 'bg-green/20 text-green',      dot: 'bg-green'   },
  { id: 'cancelada',   label: 'Cancelada',      Icon: XCircle,      iconCls: 'text-red',     border: 'border-red/30',     bg: 'bg-red/[0.04]',     badge: 'bg-red/20 text-red',          dot: 'bg-red'     },
]

// ── Period grouping ───────────────────────────────────────────────────────────
const PERIOD_ORDER = ['manhã', 'tarde']

function groupCardsByPeriodo(cards: OSRow[]): [string, OSRow[]][] {
  const map: Record<string, OSRow[]> = {}
  for (const row of cards) {
    const p = (row.periodo || '').trim() || 'Sem período'
    ;(map[p] = map[p] || []).push(row)
  }
  return Object.entries(map).sort(([a], [b]) => {
    const ia = PERIOD_ORDER.indexOf(a.toLowerCase())
    const ib = PERIOD_ORDER.indexOf(b.toLowerCase())
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
}

function PeriodoSeparator({ periodo, count }: { periodo: string; count: number }) {
  const lc = periodo.toLowerCase()
  const isManha = lc.includes('manh')
  const isTarde = lc.includes('tarde')

  const PIcon   = isManha ? Sunrise : isTarde ? Sunset : Sun
  const iconCls = isManha ? 'text-yellow'   : isTarde ? 'text-purple'   : 'text-muted'
  const lineCls = isManha ? 'bg-yellow/30'  : isTarde ? 'bg-purple/30'  : 'bg-surface'
  const textCls = isManha ? 'text-yellow'   : isTarde ? 'text-purple'   : 'text-muted'

  return (
    <div className="flex items-center gap-1.5 pt-3 pb-1 first:pt-0">
      <PIcon size={10} className={iconCls} />
      <span className={`text-[10px] font-bold uppercase tracking-[0.04em] ${textCls}`}>
        {periodo}
      </span>
      <div className={`flex-1 h-px ${lineCls}`} />
      <span className="text-[10px] text-muted tabular-nums">{count}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

// (TIPO_ICONS now defined after slaBadge as a typed partial record)

function slaBadge(row: OSRow): SlaBadge {
  if (row._slaCritico)  return { label: 'Crítico',  cls: 'bg-red/20 text-red border border-red/30'          }
  if (row._slaExcedido) return { label: 'Excedido', cls: 'bg-orange/20 text-orange border border-orange/30'  }
  if (row._slaSemAgend) return { label: 'S/Agend',  cls: 'bg-yellow/20 text-yellow border border-yellow/30'  }
  return { label: 'OK',   cls: 'bg-green/20 text-green border border-green/30' }
}

const TIPO_ICONS: Partial<Record<TipoEquipe, { Icon: IconComp; cls: string }>> = {
  INSTALACAO: { Icon: Package, cls: 'text-primary' },
  MANUTENCAO: { Icon: Wrench,  cls: 'text-orange'  },
  REDE:       { Icon: Network, cls: 'text-green'    },
}

interface OSCardProps {
  row:          OSRow
  onDragStart:  (e: React.DragEvent, numos: string) => void
  onInfo:       (row: OSRow) => void
  isGrabbed:    boolean
  onKeyGrab:    (numos: string) => void
  onKeyMove:    (dir: 'left' | 'right') => void
  onKeyRelease: () => void
}

function OSCard({ row, onDragStart, onInfo, isGrabbed, onKeyGrab, onKeyMove, onKeyRelease }: OSCardProps) {
  const sla = slaBadge(row)
  const tipoEntry = TIPO_ICONS[row._tipo as TipoEquipe]
  const TipoIcon  = tipoEntry?.Icon ?? AlertTriangle
  const tipoCls   = tipoEntry?.cls  ?? 'text-muted'
  const aging  = row._aging ?? row._agingAbertura ?? 0
  const eq     = shortEquipe(row.nomedaequipe)
  const eqCode = eq.includes(' - ') ? eq.split(' - ')[0] : eq

  return (
    <div
      draggable
      tabIndex={0}
      role="article"
      aria-label={`OS ${row.numos} — ${row.nomecliente || 'Cliente não informado'} — SLA ${sla.label}${isGrabbed ? ' — capturada, use setas para mover' : ''}`}
      aria-grabbed={isGrabbed || undefined}
      onDragStart={e => onDragStart(e, row.numos)}
      onKeyDown={e => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onKeyGrab(row.numos) }
        if (e.key === 'ArrowRight') { e.preventDefault(); onKeyMove('right') }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); onKeyMove('left')  }
        if (e.key === 'Escape')     { e.preventDefault(); onKeyRelease()     }
        if (e.key === 'i' || e.key === 'I') { e.preventDefault(); onInfo(row) }
      }}
      className={`group relative bg-elevated border rounded-lg p-3
                 cursor-grab active:cursor-grabbing select-none
                 hover:border-muted/40 hover:shadow-lg hover:shadow-black/25
                 transition-all duration-150
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60
                 ${isGrabbed
                   ? 'border-primary/60 ring-2 ring-primary/40 shadow-lg shadow-primary/10'
                   : 'border-white/[0.08]'}`}
    >
      <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-20 transition-opacity pointer-events-none">
        <GripVertical size={11} className="text-muted" />
      </div>

      {/* numos + SLA badge + info button */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] font-semibold text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">
          #{row.numos}
        </span>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sla.cls}`}>
            {sla.label}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onInfo(row) }}
            onMouseDown={e => e.stopPropagation()}
            className="w-5 h-5 rounded flex items-center justify-center
                       opacity-0 group-hover:opacity-100 transition-opacity
                       text-muted hover:text-primary hover:bg-primary/10 cursor-pointer"
            aria-label="Ver detalhes"
          >
            <Info size={11} />
          </button>
        </div>
      </div>

      {/* Cliente — clicável */}
      <p
        onClick={e => { e.stopPropagation(); onInfo(row) }}
        className="text-[12px] font-medium text-text leading-snug mb-1.5 truncate pr-1
                   cursor-pointer hover:text-primary transition-colors"
      >
        {row.nomecliente || 'Cliente não informado'}
      </p>

      {/* Tipo */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <TipoIcon size={10} className={tipoCls} />
        <span className="text-[10px] text-secondary truncate">{row.tiposervico || row._tipo || '—'}</span>
      </div>

      {/* Chips: equipe · aging · cidade */}
      <div className="flex items-center flex-wrap gap-1">
        {row.nomedaequipe ? (
          <span className="text-[10px] font-semibold bg-surface/40 border border-white/[0.08] px-1.5 py-0.5 rounded text-secondary">
            {eqCode}
          </span>
        ) : (
          <span className="flex items-center gap-0.5 text-[10px] font-semibold bg-red/10 border border-red/20 px-1.5 py-0.5 rounded text-red">
            <User size={8} />Sem equipe
          </span>
        )}
        {aging > 0 && (
          <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded
            ${aging > 7 ? 'text-red bg-red/10' : aging > 3 ? 'text-orange bg-orange/10' : 'text-secondary bg-surface/30'}`}>
            <Clock size={8} />{aging}d
          </span>
        )}
        {row.nomedacidade && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted">
            <MapPin size={8} />{row.nomedacidade}
          </span>
        )}
      </div>
    </div>
  )
}

// ── OS Detail Drawer ──────────────────────────────────────────────────────────

function DetailRow({ label, value, className = '' }: { label: string; value: string | null | undefined; className?: string }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <span className="text-[10px] text-muted w-28 flex-shrink-0 pt-px">{label}</span>
      <span className={`text-[11px] text-text font-medium flex-1 ${className}`}>{value}</span>
    </div>
  )
}

function OSDetailDrawer({ row, onClose }: { row: OSRow | null; onClose: () => void }) {
  if (!row) return null

  const sla      = slaBadge(row)
  const tipoE    = TIPO_ICONS[row._tipo as TipoEquipe]
  const TipoIcon = tipoE?.Icon ?? AlertTriangle
  const tipoCls  = tipoE?.cls  ?? 'text-muted'
  const aging     = row._aging ?? row._agingAbertura ?? 0
  const eq        = shortEquipe(row.nomedaequipe)
  const eqDisplay = eq || 'Sem equipe'

  const obs = (row.observacao || row.obs || row.descricao || row.complemento || '') as string

  const agingCls = aging > 7 ? 'text-red' : aging > 3 ? 'text-orange' : 'text-secondary'

  return (
    <div className="fixed inset-0 z-[300] flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-elevated border-l border-white/[0.08]
                      flex flex-col overflow-hidden shadow-2xl
                      animate-in slide-in-from-right-4 duration-200">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/[0.08] gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[11px] font-semibold text-primary/80 bg-primary/10 px-2 py-0.5 rounded">
                #{row.numos}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${sla.cls}`}>
                {sla.label}
              </span>
            </div>
            <h2 className="text-[15px] font-bold text-text leading-snug">
              {row.nomecliente || 'Cliente não informado'}
            </h2>
            <div className="flex items-center gap-1.5 mt-1">
              <TipoIcon size={11} className={tipoCls} />
              <span className="text-[11px] text-secondary">{row.tiposervico || row._tipo || '—'}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                       text-muted hover:text-text hover:bg-surface transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* SLA / Situação */}
          <div className="px-4 py-3 border-b border-white/[0.08]">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-surface/30 rounded-lg p-3 text-center">
                <p className={`text-xl font-headline font-bold leading-none ${agingCls}`}>
                  {aging > 0 ? `${aging}d` : '—'}
                </p>
                <p className="text-[10px] text-muted mt-1">Aging</p>
              </div>
              <div className="bg-surface/30 rounded-lg p-3 text-center">
                <p className="text-xl font-headline font-bold text-text leading-none">
                  {row._slaLimite ? `${row._slaLimite}d` : '—'}
                </p>
                <p className="text-[10px] text-muted mt-1">Limite SLA · {row._slaTipoLabel || ''}</p>
              </div>
            </div>
            {row._slaCritico && row._diasAcimaSLA > 0 && (
              <div className="mt-2 flex items-center gap-1.5 bg-red/10 border border-red/20
                              rounded-lg px-3 py-2">
                <ShieldAlert size={12} className="text-red flex-shrink-0" />
                <span className="text-[11px] text-red font-semibold">
                  {row._diasAcimaSLA} dias acima do SLA
                </span>
              </div>
            )}
          </div>

          {/* Agendamento */}
          <div className="border-b border-white/[0.08]">
            <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Calendar size={10} />Agendamento
            </p>
            <div className="divide-y divide-white/[0.04]">
              <DetailRow label="Situação"    value={row._situacaoEfetiva || row.descsituacao} />
              <DetailRow label="Equipe"      value={eqDisplay} className={!row.nomedaequipe ? 'text-red' : ''} />
              <DetailRow label="Data"        value={row.dataagendamento || '—'} />
              <DetailRow label="Período"     value={row.periodo} />
              <DetailRow label="Abertura"    value={row.datacadastro} />
            </div>
          </div>

          {/* Localização */}
          <div className="border-b border-white/[0.08]">
            <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <MapPin size={10} />Localização
            </p>
            <div className="divide-y divide-white/[0.04]">
              <DetailRow label="Cidade"     value={row.nomedacidade} />
              <DetailRow label="Bairro"     value={row.bairro} />
              <DetailRow label="Logradouro" value={row.logradouro} />
            </div>
          </div>

          {/* Serviço */}
          <div className="border-b border-white/[0.08]">
            <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Building2 size={10} />Serviço
            </p>
            <div className="divide-y divide-white/[0.04]">
              <DetailRow label="Tipo"    value={row.tiposervico} />
              <DetailRow label="Serviço" value={row.servico} />
              <DetailRow label="Empresa" value={row.empresa} />
            </div>
          </div>

          {/* Observação */}
          <div className="px-4 pt-3 pb-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 mb-2">
              <FileText size={10} />Observação
            </p>
            {obs ? (
              <p className="text-[12px] text-text leading-relaxed bg-surface/30 border border-white/[0.08] rounded-lg p-3">
                {obs}
              </p>
            ) : (
              <p className="text-[11px] text-muted/50 italic">Sem observação registrada</p>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

interface KanbanColProps {
  col: ColDef; cards: OSRow[]; dragOver: string | null; showPeriodos: boolean; grabbedNumos: string | null
  onDragStart:  (e: React.DragEvent, numos: string) => void
  onInfo:       (row: OSRow) => void
  onDrop:       (colId: string) => void
  onDragOver:   (colId: string) => void
  onDragLeave:  () => void
  onKeyGrab:    (numos: string) => void
  onKeyMove:    (dir: 'left' | 'right') => void
  onKeyRelease: () => void
}

function KanbanCol({ col, cards, dragOver, showPeriodos, grabbedNumos, onDragStart, onInfo, onDrop, onDragOver, onDragLeave, onKeyGrab, onKeyMove, onKeyRelease }: KanbanColProps) {
  const { Icon, iconCls, border, bg, badge, dot } = col
  const isOver = dragOver === col.id
  const groups = useMemo(
    () => showPeriodos ? groupCardsByPeriodo(cards) : null,
    [cards, showPeriodos]
  )

  return (
    <div
      role="group"
      aria-label={`${col.label} — ${cards.length} OS`}
      className={`flex flex-col flex-shrink-0 w-[268px] rounded-xl border overflow-hidden
                  transition-all duration-150
                  ${border} ${bg}
                  ${isOver ? 'ring-2 ring-white/[0.12] shadow-lg shadow-black/20' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver(col.id) }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop(col.id) }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
          <Icon size={13} className={iconCls} />
          <span className="text-[12px] font-semibold text-text">{col.label}</span>
          {showPeriodos && groups && (
            <span className="text-[10px] text-muted bg-surface/40 px-1.5 py-0.5 rounded">
              por período
            </span>
          )}
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badge}`}>
          {cards.length}
        </span>
      </div>

      {/* Cards list */}
      <div
        role="list"
        aria-label={`OS em ${col.label}`}
        className="flex-1 overflow-y-auto p-3 min-h-[140px]"
        style={{ maxHeight: 'calc(100vh - 336px)' }}
      >
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 opacity-30" aria-hidden="true">
            <Icon size={22} className={iconCls} />
            <p className="text-[10px] text-muted mt-2">Vazia</p>
          </div>
        ) : groups ? (
          /* Agrupado por período */
          <div className="space-y-1">
            {groups.map(([periodo, periodoCards]) => (
              <div key={periodo} role="listitem">
                <PeriodoSeparator periodo={periodo} count={periodoCards.length} />
                <div className="space-y-2">
                  {periodoCards.map(row => (
                    <OSCard key={row.numos} row={row} isGrabbed={grabbedNumos === row.numos}
                      onDragStart={onDragStart} onInfo={onInfo}
                      onKeyGrab={onKeyGrab} onKeyMove={onKeyMove} onKeyRelease={onKeyRelease} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Lista plana */
          <div className="space-y-2">
            {cards.map(row => (
              <div key={row.numos} role="listitem">
                <OSCard row={row} isGrabbed={grabbedNumos === row.numos}
                  onDragStart={onDragStart} onInfo={onInfo}
                  onKeyGrab={onKeyGrab} onKeyMove={onKeyMove} onKeyRelease={onKeyRelease} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function KanbanBoard({ equipeFilter, tipoFilter }: { equipeFilter?: string; tipoFilter?: string }) {
  const { rows }  = useERPRows()
  const { statusOverrides, setStatusOverride } = useERPStore()
  const isOperador = useIsOperador()
  const logAudit   = useAuditStore(s => s.log)
  const dragRef    = useRef<string | null>(null)
  const [dragOver,   setDragOver]   = useState<string | null>(null)
  const [detailOS,   setDetailOS]   = useState<OSRow | null>(null)
  const [keyGrabbed, setKeyGrabbed] = useState<string | null>(null)
  const liveRef = useRef<HTMLDivElement>(null)

  const columns = useMemo(() => {
    const filtered = rows.filter(r => {
      if (equipeFilter && !r.nomedaequipe?.includes(equipeFilter)) return false
      if (tipoFilter   && r._tipo !== tipoFilter) return false
      return true
    })
    const map: Record<string, OSRow[]> = {}
    COLS.forEach(c => { map[c.id] = [] })
    filtered.forEach(row => {
      const id = getKanbanColumn(row, statusOverrides)
      if (map[id]) map[id].push(row)
    })
    return map
  }, [rows, equipeFilter, tipoFilter, statusOverrides])

  function announce(msg: string) {
    if (liveRef.current) liveRef.current.textContent = msg
  }

  function handleDragStart(e: React.DragEvent, numos: string) {
    if (!isOperador) { e.preventDefault(); return }
    dragRef.current = numos
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDrop(colId: string) {
    if (!isOperador) return
    if (dragRef.current) {
      const colLabel = COLS.find(c => c.id === colId)?.label ?? colId
      logAudit(`OS movida → ${colLabel}`, `numos ${dragRef.current}`, 'kanban')
      setStatusOverride(dragRef.current, colId as KanbanColumnId)
      dragRef.current = null
    }
    setDragOver(null)
  }

  // Teclado: Space/Enter captura ou solta o card
  function handleKeyGrab(numos: string) {
    if (!isOperador) return
    setKeyGrabbed(prev => {
      if (prev === numos) {
        announce('Card solto.')
        return null
      }
      announce(`OS ${numos} capturada. Use ← → para mover entre colunas. Escape para cancelar.`)
      return numos
    })
  }

  // Teclado: mover card para coluna adjacente
  function handleKeyMove(direction: 'left' | 'right') {
    if (!isOperador || !keyGrabbed) return
    const curColIdx = COLS.findIndex(c => (columns[c.id] || []).some(r => r.numos === keyGrabbed))
    if (curColIdx === -1) return
    const targetIdx = direction === 'right' ? curColIdx + 1 : curColIdx - 1
    if (targetIdx < 0 || targetIdx >= COLS.length) {
      announce(`Já na ${direction === 'right' ? 'última' : 'primeira'} coluna.`)
      return
    }
    logAudit(`OS movida → ${COLS[targetIdx].label} (teclado)`, `numos ${keyGrabbed}`, 'kanban')
    setStatusOverride(keyGrabbed, COLS[targetIdx].id as KanbanColumnId)
    announce(`Movida para ${COLS[targetIdx].label}.`)
  }

  function handleKeyRelease() {
    setKeyGrabbed(null)
    announce('Operação cancelada.')
  }

  return (
    <>
      {/* Região aria-live para screen readers */}
      <div ref={liveRef} role="status" aria-live="polite" aria-atomic="true"
           className="sr-only" />

      {keyGrabbed && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 mb-1
                        bg-primary/10 border border-primary/30 rounded-lg text-[11px] text-primary">
          <kbd className="font-mono bg-primary/15 px-1 rounded">←</kbd>
          <kbd className="font-mono bg-primary/15 px-1 rounded">→</kbd>
          <span>para mover — </span>
          <kbd className="font-mono bg-primary/15 px-1 rounded">Esc</kbd>
          <span>para cancelar</span>
        </div>
      )}

      <div
        role="region"
        aria-label="Quadro Kanban de Ordens de Serviço"
        className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0"
      >
        {COLS.map(col => (
          <KanbanCol
            key={col.id}
            col={col}
            cards={columns[col.id] || []}
            dragOver={dragOver}
            grabbedNumos={keyGrabbed}
            showPeriodos={col.id === 'atendimento' && !!equipeFilter}
            onDragStart={handleDragStart}
            onInfo={setDetailOS}
            onDrop={handleDrop}
            onDragOver={setDragOver}
            onDragLeave={() => setDragOver(null)}
            onKeyGrab={handleKeyGrab}
            onKeyMove={handleKeyMove}
            onKeyRelease={handleKeyRelease}
          />
        ))}
      </div>

      <OSDetailDrawer row={detailOS} onClose={() => setDetailOS(null)} />
    </>
  )
}
