export interface DistributionSeries {
  labels?: string[]
  values?: number[]
}

export interface DistributionItem {
  name: string
  value: number
  pct: number
}

export function sortDistribution(series?: DistributionSeries | null): DistributionItem[] {
  const entries = (series?.labels ?? []).map((name, index) => ({
    name,
    value: Number(series?.values?.[index] ?? 0),
  }))
  const total = entries.reduce((sum, item) => sum + item.value, 0)
  return entries
    .map(item => ({ ...item, pct: total > 0 ? Math.round(item.value / total * 100) : 0 }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

export function buildDistribuicaoSummary(total: number, data: {
  status?: DistributionSeries
  tipo?: DistributionSeries
  cidade?: DistributionSeries
}) {
  return {
    total,
    status: sortDistribution(data.status)[0] ?? null,
    categoria: sortDistribution(data.tipo)[0] ?? null,
    cidade: sortDistribution(data.cidade)[0] ?? null,
  }
}
