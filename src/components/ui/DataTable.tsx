import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { ChevronUp, ChevronDown, Inbox } from 'lucide-react'
import { EmptyState } from './EmptyState'

interface Column<T = Record<string, unknown>> {
  key?:       string
  label:      string
  align?:     'right' | 'left'
  className?: string
  render?:    (value: unknown, row: T) => ReactNode
}

type Density = 'normal' | 'compact' | 'mini'

interface DataTableProps<T extends Record<string, unknown>> {
  columns:              Column<T>[]
  rows:                 T[]
  onRowClick?:          (row: T) => void
  onRowHover?:          (row: T, rect: DOMRect) => void
  onRowLeave?:          () => void
  density?:             Density
  className?:           string
  /** Modo controlado: o pai ordena o CONJUNTO COMPLETO (antes de paginar) e a
   *  tabela só exibe. Sem isso, o sort interno ordenaria apenas a página atual. */
  sort?:                { key: string | null; dir: 'asc' | 'desc' }
  onSort?:              (key: string) => void
  emptyTitle?:          string
  emptyDescription?:    string
  /** Sticky no header — offset padrão assume navbar + barra de filtro acima. Default false. */
  stickyHeader?:        boolean
}

const rowHeight: Record<Density, string> = { normal: 'h-9', compact: 'h-7', mini: 'h-5' }
const textSize:  Record<Density, string> = { normal: 'text-label', compact: 'text-caption', mini: 'text-caption' }

// Acima disso, renderizar todas as linhas no DOM pesa demais — passa a virtualizar por janela.
const VIRTUALIZE_MIN = 100
const ROW_PX: Record<Density, number> = { normal: 36, compact: 28, mini: 20 }

export function DataTable<T extends Record<string, unknown>>({
  columns, rows, onRowClick, onRowHover, onRowLeave, density = 'normal', className = '',
  sort, onSort, emptyTitle, emptyDescription, stickyHeader = false,
}: DataTableProps<T>) {
  const controlled = !!onSort
  const [sortKeyLocal, setSortKey] = useState<string | null>(null)
  const [sortDirLocal, setSortDir] = useState<'asc' | 'desc'>('asc')
  const sortKey = controlled ? (sort?.key ?? null) : sortKeyLocal
  const sortDir = controlled ? (sort?.dir ?? 'asc') : sortDirLocal

  const handleSort = (key: string | undefined) => {
    if (!key) return
    if (controlled) { onSort!(key); return }
    setSortDir(sortKeyLocal === key && sortDirLocal === 'asc' ? 'desc' : 'asc')
    setSortKey(key)
  }

  const sorted = !controlled && sortKey
    ? [...rows].sort((a, b) => {
        const av = a[sortKey] ?? ''
        const bv = b[sortKey] ?? ''
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv), undefined, { numeric: true })
          : String(bv).localeCompare(String(av), undefined, { numeric: true })
      })
    : rows

  const wrapRef = useRef<HTMLDivElement>(null)
  // Offset medido via effect (nunca lido de ref durante o render) — usado como scrollMargin
  // para o virtualizador saber a posição real da tabela dentro do scroll da página.
  // Sem array de dependências: um layout effect roda após TODO commit, então o offset
  // se auto-corrige caso algo acima da tabela mude de altura após o mount (filtro
  // expandindo/recolhendo, banner sumindo, resize) — sem precisar ler ref.current no render.
  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => {
    setScrollMargin(wrapRef.current?.offsetTop ?? 0)
  })

  const virtual = sorted.length > VIRTUALIZE_MIN
  const virtualizer = useWindowVirtualizer({
    count: virtual ? sorted.length : 0,
    estimateSize: () => ROW_PX[density],
    overscan: 15,
    scrollMargin,
  })
  const virtualItems = virtual ? virtualizer.getVirtualItems() : null
  const padTop = virtualItems?.length ? virtualItems[0].start - scrollMargin : 0
  const padBottom = virtualItems?.length ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0
  const visible = virtualItems ? virtualItems.map((v) => sorted[v.index]) : sorted

  return (
    <div ref={wrapRef} className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead className={stickyHeader ? 'sticky top-24 z-sticky bg-card' : undefined}>
          <tr className="border-b-2 border-white/[0.08]">
            {columns.map((col) => (
              <th
                key={col.key ?? col.label}
                scope="col"
                aria-sort={col.key && sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                className={`px-3 py-2 text-left text-caption font-bold uppercase tracking-[0.6px] text-muted
                            whitespace-nowrap select-none
                            ${col.align === 'right' ? 'text-right' : ''}
                            ${col.className ?? ''}`}
              >
                {col.key ? (
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="inline-flex items-center gap-1 uppercase tracking-[0.6px] font-bold
                               hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
                  >
                    {col.label}
                    {sortKey === col.key && (sortDir === 'asc' ? <ChevronUp size={9} /> : <ChevronDown size={9} />)}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1">{col.label}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 && <tr aria-hidden="true" style={{ height: padTop }} />}
          {visible.map((row, i) => (
            <tr
              key={(row._id as string | number) ?? (virtualItems ? virtualItems[i].index : i)}
              onClick={() => onRowClick?.(row)}
              onMouseEnter={(e) => onRowHover?.(row, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => onRowLeave?.()}
              className={`border-b border-white/[0.04] ${textSize[density]}
                          transition-colors duration-fast text-secondary
                          hover:bg-primary/[0.07] hover:text-text
                          ${onRowClick ? 'cursor-pointer' : ''}
                          ${row._critical ? 'bg-red/[0.04]' : ''}`}
            >
              {columns.map((col) => (
                <td
                  key={col.key ?? col.label}
                  className={`px-3 ${rowHeight[density]}
                              ${col.align === 'right' ? 'text-right' : ''}
                              ${col.className ?? ''}`}
                >
                  {col.render
                    ? col.render(col.key ? row[col.key] : undefined, row)
                    : (col.key ? (row[col.key] as ReactNode) ?? '—' : '—')}
                </td>
              ))}
            </tr>
          ))}
          {padBottom > 0 && <tr aria-hidden="true" style={{ height: padBottom }} />}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState icon={Inbox}
                            title={emptyTitle ?? 'Nenhum resultado encontrado'}
                            description={emptyDescription} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
