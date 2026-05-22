import { useMemo } from 'react'
import { useAlertStore } from '../store/alertStore'
import type { AlertRule } from '../store/alertStore'
import { isCOPE, isReagend } from '../lib/transform'
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

    const isAtivo = (r: OSRow) => ['Pendente', 'Atendimento'].includes(r.descsituacao as string)
    const active  = (allRows ?? []).filter(
      r => !isCOPE(r) && !isReagend(r) && isAtivo(r) && r._tipo !== 'REDE'
    )
    const periodo = (rows ?? []).filter(r => !isCOPE(r) && !isReagend(r) && r._tipo !== 'REDE')
    const concl   = periodo.filter(r => r.descsituacao === 'Concluída').length

    const metrics: Record<string, number> = {
      total:     active.length,
      criticas:  active.filter(r => r._slaCritico).length,
      semEquipe: active.filter(r => !(r.nomedaequipe as string | undefined)?.trim()).length,
      taxa:      periodo.length > 0 ? Math.round(concl / periodo.length * 100) : 0,
    }

    return rules
      .filter(r => r.enabled)
      .reduce<FiredAlert[]>((acc, rule) => {
        const val = metrics[rule.metric] ?? 0
        const hit =
          rule.operator === '>'  ? val >  rule.threshold :
          rule.operator === '<'  ? val <  rule.threshold :
          rule.operator === '>=' ? val >= rule.threshold :
          rule.operator === '<=' ? val <= rule.threshold :
          val === rule.threshold
        if (hit) acc.push({ ...rule, currentValue: val })
        return acc
      }, [])
  }, [rows, allRows, rules])
}
