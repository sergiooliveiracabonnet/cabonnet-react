import { isCOPE, isReagend } from '../../lib/transform'
import type { OSRow } from '../../lib/types'
import type { SignalRow } from './nivelSinal'

export interface BairroComparativo {
  bairro: string
  cidade: string
  /** OS de manutenção/assistência abertas pelo cliente no período — não conta
   *  instalação (agendada, não é reclamação) nem COPE/reagendamento. */
  osCount: number
  osCriticas: number
  sinalTotal: number
  sinalCriticos: number
  sinalAtencao: number
  rxMedio: number | null
}

// Bairro/cidade é o único campo em comum entre o CSV de OS (Grafana) e o CSV
// de sinal (fabricante da OLT) — nenhum dos dois traz PON/OLT nem coordenada
// confiável em massa. A grafia pode divergir entre os dois sistemas (abreviação,
// acento); normalizar reduz isso, mas não elimina — bairro sem match nos dois
// lados aparece com o outro lado zerado, não some da lista.
const chave = (cidade: string, bairro: string) => `${(cidade || '').trim().toUpperCase()}|${(bairro || '').trim().toUpperCase()}`

interface Acc {
  bairro: string; cidade: string
  osCount: number; osCriticas: number
  sinalTotal: number; sinalCriticos: number; sinalAtencao: number
  rxSoma: number; rxCount: number
}

/** Cruza ordens de manutenção (solicitadas pelo cliente) com o recorte de alerta
 *  de sinal, agrupados por bairro — a unidade que os dois datasets têm em comum.
 *  Ordenado pelo maior número de OS, como pedido: "maior número de OS por
 *  proximidade", para comparar contra o nível de sinal do mesmo bairro. */
export function buildBairroComparativo(osRows: OSRow[], signalRows: SignalRow[]): BairroComparativo[] {
  const map = new Map<string, Acc>()

  const acc = (cidade: string, bairro: string): Acc | null => {
    const b = (bairro || '').trim()
    const c = (cidade || '').trim()
    if (!b || !c || b === '—' || c === '—') return null
    const key = chave(c, b)
    if (!map.has(key)) map.set(key, { bairro: b, cidade: c, osCount: 0, osCriticas: 0, sinalTotal: 0, sinalCriticos: 0, sinalAtencao: 0, rxSoma: 0, rxCount: 0 })
    return map.get(key)!
  }

  for (const r of osRows) {
    if (isCOPE(r) || isReagend(r)) continue
    if (r._tipo !== 'MANUTENCAO') continue
    const entry = acc(r.nomedacidade || '', r.bairro || '')
    if (!entry) continue
    entry.osCount++
    if (r._slaCritico) entry.osCriticas++
  }

  for (const r of signalRows) {
    const entry = acc(r.cidade, r.bairro)
    if (!entry) continue
    entry.sinalTotal++
    if (r.classificacao === 'Crítico') entry.sinalCriticos++
    else if (r.classificacao === 'Atenção') entry.sinalAtencao++
    if (r.rx != null) { entry.rxSoma += r.rx; entry.rxCount++ }
  }

  return [...map.values()]
    .filter(a => a.osCount > 0 || a.sinalTotal > 0)
    .map(a => ({
      bairro: a.bairro, cidade: a.cidade,
      osCount: a.osCount, osCriticas: a.osCriticas,
      sinalTotal: a.sinalTotal, sinalCriticos: a.sinalCriticos, sinalAtencao: a.sinalAtencao,
      rxMedio: a.rxCount ? Math.round(a.rxSoma / a.rxCount * 10) / 10 : null,
    }))
    .sort((a, b) => b.osCount - a.osCount || b.sinalCriticos - a.sinalCriticos || b.sinalTotal - a.sinalTotal)
}
