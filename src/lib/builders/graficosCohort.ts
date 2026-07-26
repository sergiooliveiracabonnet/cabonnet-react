export interface CohortSeries {
  labels?: string[]
  total?: number[]
  concluidas?: number[]
  mesmoMes?: number[]
  taxaResolucao?: number[]
  mttr?: number[]
}

export function buildCohortView(cohort?: CohortSeries, now = new Date()) {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const rows = (cohort?.labels ?? []).map((name, index) => {
    const total = Math.max(0, cohort?.total?.[index] ?? 0)
    const encerradas = Math.min(total, Math.max(0, cohort?.concluidas?.[index] ?? 0))
    const mesmoMes = Math.min(encerradas, Math.max(0, cohort?.mesmoMes?.[index] ?? 0))
    return {
      name,
      total,
      encerradas,
      abertas: total - encerradas,
      mesmoMes,
      taxa: total ? Math.round(encerradas / total * 100) : 0,
      mesmoMesPct: total ? Math.round(mesmoMes / total * 100) : 0,
      mttr: Math.max(0, cohort?.mttr?.[index] ?? 0),
      emFormacao: name === currentMonth,
    }
  })
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const encerradas = rows.reduce((sum, row) => sum + row.encerradas, 0)
  const mesmoMes = rows.reduce((sum, row) => sum + row.mesmoMes, 0)
  return {
    rows,
    summary: {
      coortes: rows.length,
      total,
      encerradas,
      abertas: total - encerradas,
      taxa: total ? Math.round(encerradas / total * 100) : 0,
      mesmoMesPct: total ? Math.round(mesmoMes / total * 100) : 0,
    },
  }
}
