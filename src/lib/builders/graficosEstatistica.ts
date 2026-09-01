import type { OSRow } from '../types'
import type { DistributionItem } from './graficosDistribuicao'

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function quantile(sorted: number[], percentile: number) {
  if (!sorted.length) return 0
  const index = (sorted.length - 1) * percentile
  const lower = Math.floor(index)
  const fraction = index - lower
  return round1(sorted[lower] + ((sorted[lower + 1] ?? sorted[lower]) - sorted[lower]) * fraction)
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    media: sorted.length ? round1(sorted.reduce((sum, value) => sum + value, 0) / sorted.length) : 0,
    mediana: quantile(sorted, 0.5),
  }
}

export function buildAgingStatistics(rows: OSRow[]) {
  const active = rows.filter(row => ['Pendente', 'Atendimento'].includes(row.descsituacao) && row._aging != null)
  const values = active.map(row => row._aging as number).sort((a, b) => a - b)
  const basic = summarize(values)
  const slaExcedido = active.filter(row => row._slaExcedido).length
  const bucketDefs = [
    { name: '0-1d', test: (value: number) => value <= 1 },
    { name: '2-3d', test: (value: number) => value >= 2 && value <= 3 },
    { name: '4-7d', test: (value: number) => value >= 4 && value <= 7 },
    { name: '8-14d', test: (value: number) => value >= 8 && value <= 14 },
    { name: '15+d', test: (value: number) => value >= 15 },
  ]
  const buckets: DistributionItem[] = bucketDefs.map(bucket => {
    const value = values.filter(bucket.test).length
    return { name: bucket.name, value, pct: values.length ? Math.round(value / values.length * 100) : 0 }
  })

  const cityValues = new Map<string, number[]>()
  active.forEach(row => {
    const city = (row.nomedacidade || 'Desconhecida').trim()
    cityValues.set(city, [...(cityValues.get(city) ?? []), row._aging as number])
  })
  const cidades = [...cityValues.entries()].map(([name, cityAging]) => ({
    name,
    total: cityAging.length,
    ...summarize(cityAging),
  })).sort((a, b) => b.media - a.media || b.total - a.total || a.name.localeCompare(b.name))

  return {
    summary: {
      total: values.length,
      ...basic,
      p75: quantile(values, 0.75),
      maximo: values.at(-1) ?? 0,
      slaExcedido,
      slaPct: values.length ? Math.round(slaExcedido / values.length * 100) : 0,
    },
    buckets,
    cidades,
  }
}
