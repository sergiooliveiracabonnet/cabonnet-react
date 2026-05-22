import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUIStore, PRESETS } from '../store/uiStore'

const VALID_PRESETS = new Set(PRESETS.map(p => p.id))

function toYMD(d: Date | null): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : ''
}

function fromYMD(s: string | null, eod = false): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (eod) dt.setHours(23, 59, 59, 999)
  return dt
}

export function useFilterURL(): void {
  const [searchParams, setSearchParams] = useSearchParams()
  const { dateFilter, setPreset, setCustomRange } = useUIStore()
  const initialized = useRef(false)

  // Leitura inicial da URL → store (executa uma única vez)
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const preset = searchParams.get('preset')
    const fromS  = searchParams.get('from')
    const toS    = searchParams.get('to')
    if (!preset || !VALID_PRESETS.has(preset)) return
    if (preset === 'custom') {
      const from = fromYMD(fromS)
      const to   = fromYMD(toS, true)
      if (from && to) setCustomRange(from, to)
    } else {
      setPreset(preset)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Escrita: store → URL
  useEffect(() => {
    const { preset, from, to } = dateFilter
    const p = new URLSearchParams()
    p.set('preset', preset)
    if (preset === 'custom') {
      if (from) p.set('from', toYMD(from))
      if (to)   p.set('to',   toYMD(to))
    }
    setSearchParams(p, { replace: true })
  }, [dateFilter, setSearchParams])
}
