export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function exportCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const keys   = Object.keys(rows[0])
  const header = keys.map(csvCell).join(';')
  const body   = rows.map(r => keys.map(key => csvCell(r[key])).join(';')).join('\n')
  const blob   = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = filename
  a.click()
  URL.revokeObjectURL(url)
}
