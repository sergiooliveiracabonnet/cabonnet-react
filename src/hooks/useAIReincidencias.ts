import { ai } from '../lib/api'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReincidenciaPair } from '../features/reincidencias/reincidenciasReport'

// Dez pares mantêm a resposta JSON dentro do limite de tokens do endpoint.
export const AI_BATCH_SIZE = 10

const SEM_INFO = 'Sem Informação'

interface AIRawAnalise { par?: number; numos_orig?: string; numos_rev?: string; causa?: string; feito_primeira?: string; o_que_faltou?: string }
export interface AIReincidenciaBatch {
  cached?: boolean
  narrativa?: string
  analises?: AIRawAnalise[]
  causas_distribuicao?: Array<{ causa?: string; count?: number }>
}

export interface AIPairDiagnosis {
  chave: string
  cliente: string
  chaveCliente: string
  cidade: string
  equipe: string
  diasEntre: number
  numosOrig: string
  numosRev: string
  causa: string
  feitoPrimeira: string
  oQueFaltou: string
}

export interface AICausaGrupo { causa: string; count: number; pct: number; pares: AIPairDiagnosis[] }

export interface AIAcao { titulo: string; detalhe: string; causa: string }

export interface ReincidenciaContexto { janelaDias: number; filtros: string }

export interface AIReincidenciaAnalysis {
  ok: boolean
  cached: boolean
  /** Frase consolidada calculada dos diagnósticos — não é texto gerado por lote. */
  resumo: string
  /** Uma leitura da IA por lote enviado; ficam separadas porque cada lote só enxergou seus próprios pares. */
  notas: string[]
  paresAnalisados: number
  causas: AICausaGrupo[]
  porPar: Record<string, AIPairDiagnosis>
  /** Segundo passo: leitura unica sobre o conjunto ja consolidado. Vazia se a chamada falhar. */
  sintese: string
  acoes: AIAcao[]
  sinteseErro: boolean
}

export function aiPairKey(numosOrig: string, numosRev: string): string {
  return `${numosOrig}>${numosRev}`
}

function firstSentence(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function buildResumo(total: number, causas: AICausaGrupo[]): string {
  if (!total) return 'A IA não conseguiu classificar nenhum par de revisita.'
  const [top, second] = causas
  const parte = `${total} ${total === 1 ? 'par de revisita classificado' : 'pares de revisita classificados'}.`
  if (!top) return parte
  const dominante = ` Causa dominante: ${top.causa} — ${top.count} ${top.count === 1 ? 'par' : 'pares'} (${top.pct}%).`
  const seguinte = second ? ` Em seguida: ${second.causa} — ${second.count} (${second.pct}%).` : ''
  return parte + dominante + seguinte
}

/**
 * Reancora cada diagnóstico no par real enviado (offset do lote + índice `par`), em vez de confiar
 * nos números de OS ecoados pelo modelo, e recalcula a distribuição a partir dos rótulos por par.
 */
export function mergeAIReincidenciaBatches(
  batches: AIReincidenciaBatch[],
  pares: ReincidenciaPair[],
  batchSize = AI_BATCH_SIZE,
): AIReincidenciaAnalysis {
  const porPar: Record<string, AIPairDiagnosis> = {}
  const byNumos = new Map(pares.map(par => [aiPairKey(par.numos_orig, par.numos_rev), par]))

  batches.forEach((batch, batchIndex) => {
    (batch.analises || []).forEach((item, itemIndex) => {
      const local = Number.isFinite(item.par) && Number(item.par) > 0 ? Number(item.par) - 1 : itemIndex
      const par = pares[batchIndex * batchSize + local]
        ?? byNumos.get(aiPairKey(String(item.numos_orig || ''), String(item.numos_rev || '')))
      if (!par) return
      const chave = aiPairKey(par.numos_orig, par.numos_rev)
      if (porPar[chave]) return
      porPar[chave] = {
        chave,
        cliente: par.nomecliente,
        chaveCliente: par.chave_cliente,
        cidade: par.nomedacidade,
        equipe: par.equipe_orig,
        diasEntre: par.dias_entre,
        numosOrig: par.numos_orig,
        numosRev: par.numos_rev,
        causa: firstSentence(item.causa || '') || SEM_INFO,
        feitoPrimeira: firstSentence(item.feito_primeira || ''),
        oQueFaltou: firstSentence(item.o_que_faltou || ''),
      }
    })
  })

  const diagnoses = Object.values(porPar)
  const grupos = new Map<string, AIPairDiagnosis[]>()
  diagnoses.forEach(item => {
    if (!grupos.has(item.causa)) grupos.set(item.causa, [])
    grupos.get(item.causa)!.push(item)
  })

  let total = diagnoses.length
  let causas: AICausaGrupo[] = [...grupos]
    .map(([causa, items]) => ({ causa, count: items.length, pct: Math.round(items.length / total * 100), pares: items }))

  // Sem diagnósticos aproveitáveis, ainda mostramos a distribuição declarada pelo modelo.
  if (!total) {
    const counts = new Map<string, number>()
    batches.flatMap(batch => batch.causas_distribuicao || []).forEach(item => {
      const causa = firstSentence(item.causa || '') || SEM_INFO
      counts.set(causa, (counts.get(causa) || 0) + (Number(item.count) || 0))
    })
    total = [...counts.values()].reduce((sum, count) => sum + count, 0)
    causas = [...counts].map(([causa, count]) => ({ causa, count, pct: total ? Math.round(count / total * 100) : 0, pares: [] }))
  }

  causas.sort((a, b) => b.count - a.count || a.causa.localeCompare(b.causa))

  return {
    ok: true,
    cached: batches.length > 0 && batches.every(batch => batch.cached),
    resumo: buildResumo(total, causas),
    notas: [...new Set(batches.map(batch => firstSentence(batch.narrativa || '')).filter(Boolean))],
    paresAnalisados: total,
    causas,
    porPar,
    sintese: '',
    acoes: [],
    sinteseErro: false,
  }
}

export interface AISintesePayload {
  total_pares: number
  total_clientes: number
  janela_dias: number
  intervalo_medio: number
  revisitas_rapidas: number
  filtros: string
  causas: Array<{ causa: string; count: number; pct: number; intervalo_medio: number; equipes: Array<{ equipe: string; count: number }>; exemplos: string[] }>
  notas: string[]
}

const REVISITA_RAPIDA_DIAS = 7

function media(values: number[]): number {
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10
}

/** Agregado enviado ao passo 2 — o unico ponto em que a IA enxerga todos os pares de uma vez. */
export function buildSintesePayload(analysis: AIReincidenciaAnalysis, contexto: ReincidenciaContexto): AISintesePayload {
  const diagnoses = Object.values(analysis.porPar)
  return {
    total_pares: analysis.paresAnalisados,
    total_clientes: new Set(diagnoses.map(item => item.chaveCliente)).size,
    janela_dias: contexto.janelaDias,
    intervalo_medio: media(diagnoses.map(item => item.diasEntre)),
    revisitas_rapidas: diagnoses.filter(item => item.diasEntre <= REVISITA_RAPIDA_DIAS).length,
    filtros: contexto.filtros,
    causas: analysis.causas.map(grupo => {
      const porEquipe = new Map<string, number>()
      grupo.pares.forEach(item => {
        if (!item.equipe || item.equipe === '—') return
        porEquipe.set(item.equipe, (porEquipe.get(item.equipe) || 0) + 1)
      })
      return {
        causa: grupo.causa,
        count: grupo.count,
        pct: grupo.pct,
        intervalo_medio: media(grupo.pares.map(item => item.diasEntre)),
        equipes: [...porEquipe].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([equipe, count]) => ({ equipe, count })),
        exemplos: grupo.pares.slice(0, 3).map(item =>
          `${item.cliente} (${item.cidade}, ${item.equipe}, ${item.diasEntre}d) - feito: ${item.feitoPrimeira || 'nao registrado'}; faltou: ${item.oQueFaltou || 'nao registrado'}`),
      }
    }),
    notas: analysis.notas,
  }
}

export function useAIReincidencias(pares: ReincidenciaPair[], enabled: boolean, contexto: ReincidenciaContexto) {
  const batches = useMemo(() => {
    const result: ReincidenciaPair[][] = []
    for (let i = 0; i < pares.length; i += AI_BATCH_SIZE) result.push(pares.slice(i, i + AI_BATCH_SIZE))
    return result
  }, [pares])
  const query = useQuery({
    queryKey: ['ai-reincidencias-relatorio', batches, contexto.janelaDias, contexto.filtros],
    queryFn: async () => {
      const results: AIReincidenciaBatch[] = []
      // Sequencial de propósito: evita bloquear o backend e atingir rate limit.
      for (const batch of batches) {
        results.push(await ai.revisitasCausa({ pares: batch }) as AIReincidenciaBatch)
      }
      const merged = mergeAIReincidenciaBatches(results, pares)
      if (!merged.paresAnalisados) return merged
      // Passo 2 — sintese do conjunto. Se falhar, o relatorio segue com a classificacao par a par.
      try {
        const sintese = await ai.revisitasSintese(buildSintesePayload(merged, contexto)) as { sintese?: string; acoes?: AIAcao[] }
        return { ...merged, sintese: String(sintese?.sintese || ''), acoes: sintese?.acoes || [] }
      } catch (error) {
        console.warn('[reincidencias] sintese do conjunto indisponivel:', error)
        return { ...merged, sinteseErro: true }
      }
    },
    enabled: enabled && batches.length > 0,
    staleTime: 10 * 60_000,
    retry: false,
  })
  return {
    data: query.data ?? null,
    isFetching: query.isFetching,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
  }
}
