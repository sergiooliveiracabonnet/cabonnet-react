import type { AlertRule } from '../store/alertStore'
import type { OSRow } from './types'
import { isCOPE, isReagend } from './transform'

export interface AlertMetrics {
  total: number
  criticas: number
  semEquipe: number
  semEquipe4h: number
  taxa: number
}

export interface EvaluatedAlertRule extends AlertRule {
  currentValue: number
}

export function operationalActiveRows(rows: OSRow[] | null | undefined): OSRow[] {
  return (rows ?? []).filter(row =>
    row._tipo !== 'REDE' &&
    !isCOPE(row) &&
    !isReagend(row) &&
    ['Pendente', 'Atendimento'].includes(String(row.descsituacao ?? '')),
  )
}

export function buildAlertMetrics(
  allRows: OSRow[] | null | undefined,
  periodRows: OSRow[] | null | undefined,
): AlertMetrics {
  const active = operationalActiveRows(allRows)
  const period = (periodRows ?? []).filter(row => row._tipo !== 'REDE' && !isCOPE(row) && !isReagend(row))
  const concluded = period.filter(row => row.descsituacao === 'Concluída').length

  return {
    total: active.length,
    criticas: active.filter(row => row._slaCritico || row._slaExcedido).length,
    semEquipe: active.filter(row => !row.nomedaequipe?.trim()).length,
    semEquipe4h: active.filter(row => !row.nomedaequipe?.trim() && (row._agingHoras ?? 0) > 4).length,
    taxa: period.length > 0 ? Math.round(concluded / period.length * 100) : 100,
  }
}

export function evaluateAlertRules(rules: AlertRule[], metrics: AlertMetrics): EvaluatedAlertRule[] {
  return rules.filter(rule => rule.enabled).reduce<EvaluatedAlertRule[]>((alerts, rule) => {
    const currentValue = metrics[rule.metric as keyof AlertMetrics] ?? 0
    const hit = rule.operator === '>' ? currentValue > rule.threshold
      : rule.operator === '<' ? currentValue < rule.threshold
      : rule.operator === '>=' ? currentValue >= rule.threshold
      : rule.operator === '<=' ? currentValue <= rule.threshold
      : currentValue === rule.threshold
    if (hit) alerts.push({ ...rule, currentValue })
    return alerts
  }, [])
}

export function summarizeAlerts(
  operational: Array<{ id: string; severity: string; count: number }>,
  rules: Array<{ severity: string }>,
  acknowledgedIds: Set<string>,
) {
  return {
    rulesTriggered: operational.length + rules.length,
    occurrences: operational.reduce((total, alert) => total + alert.count, 0),
    criticalOccurrences: operational
      .filter(alert => alert.severity === 'CRITICO')
      .reduce((total, alert) => total + alert.count, 0),
    acknowledged: acknowledgedIds.size,
  }
}
