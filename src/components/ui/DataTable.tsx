import { useState, type ReactNode } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

interface Column<T = Record<string, unknown>> {
  key?:       string
  label:      string
  align?:     'right' | 'left'
  className?: string
  render?:    (value: unknown, row: T) => ReactNode
}

type Density = 'normal' | 'compact' | 'mini'

interface DataTableProps<T extends Record<string, unknown>> {
  columns:      Column<T>[]
  rows:         T[]
  onRowClick?:  (row: T) => void
  onRowHover?:  (row: T, rect: DOMRect) => void
  onRowLeave?:  () => void
  density?:     Density
  className?:   string
}

const rowHeight: Record<Density, string> = { normal: 'h-9', compact: 'h-7', mini: 'h-5' }
const textSize:  Record<Density, string> = { normal: 'text-[12px]', compact: 'text-[11px]', mini: 'text-[10px]' }

export function DataTable<T extends Record<string, unknown>>({
  columns, rows, onRowClick, onRowHover, onRowLeave, density = 'normal', className = '',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string | undefined) => {
    if (!key) return
    setSortDir(sortKey === key && sortDir === 'asc' ? 'desc' : 'asc')
    setSortKey(key)
  }

  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        const av = a[sortKey] ?? ''
        const bv = b[sortKey] ?? ''
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv), undefined, { numeric: true })
          : String(bv).localeCompare(String(av), undefined, { numeric: true })
      })
    : rows

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key ?? col.label}
                onClick={() => handleSort(col.key)}
                scope="col"
                className={`px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted
                            whitespace-nowrap select-none
                            ${col.key ? 'cursor-pointer hover:text-secondary' : ''}
                            ${col.align === 'right' ? 'text-right' : ''}
                            ${col.className ?? ''}`}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.key && sortKey === col.key && (
                    sortDir === 'asc' ? <ChevronUp size={9} /> : <ChevronDown size={9} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={(row._id as string | number) ?? i}
              onClick={() => onRowClick?.(row)}
              onMouseEnter={(e) => onRowHover?.(row, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => onRowLeave?.()}
              className={`border-b border-border/50 ${textSize[density]}
                          transition-colors duration-100 text-secondary
                          hover:bg-card-high hover:text-text
                          ${onRowClick ? 'cursor-pointer' : ''}
                          ${row._critical ? 'bg-red/[0.06]' : ''}`}
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
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-muted text-[11px]">
                Nenhum resultado encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
