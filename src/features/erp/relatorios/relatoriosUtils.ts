export function exportCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const header = Object.keys(rows[0]).join(';')
  const body   = rows.map(r => Object.values(r).join(';')).join('\n')
  const blob   = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = filename
  a.click()
  URL.revokeObjectURL(url)
}
