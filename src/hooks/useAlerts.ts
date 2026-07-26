import { useMemo } from 'react'
import { useAlertStore } from '../store/alertStore'
import type { AlertRule } from '../store/alertStore'
import { buildAlertMetrics, evaluateAlertRules } from '../lib/alertEngine'
import type { OSRow } from '../lib/types'

export interface FiredAlert extends AlertRule {
  currentValue: number
}

export function useAlerts(
  rows:    OSRow[] | null | undefined,
  allRows: OSRow[] | null | undefined,
): FiredAlert[] {
  const { rules } = useAlertStore()

  return useMemo(() => {
    if (!allRows?.length && !rows?.length) return []

    return evaluateAlertRules(rules, buildAlertMetrics(allRows, rows))
  }, [rows, allRows, rules])
}
