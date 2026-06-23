import { useQuery } from '@tanstack/react-query'
import { api, endpoints } from '../lib/api'

const REAGEND_RE = /ALTEROU\s+DATA|REAGEND|REMARCOU|REMARC|NOVA\s+DATA|MUDOU\s+DATA/i

export interface HistoricoEntry {
  texto:     string
  autor:     string | null
  data:      string | null
  hora:      string | null
  isReagend: boolean
}

interface ParsedObs {
  historico:   HistoricoEntry[]
  obsTecnico:  string | null
  nomeTecnico: string | null
}

function parseObs(raw: string): ParsedObs {
  if (!raw?.trim()) return { historico: [], obsTecnico: null, nomeTecnico: null }

  const execIdx = raw.search(/Informa[çc][oõ]es da Execu[çc][aã]o:/i)
  const locIdx  = raw.search(/\nLOCALIZA[ÇC][ÃA]O\b/i)
  const histRaw = execIdx >= 0 ? raw.slice(0, execIdx) : raw
  const execRaw = execIdx >= 0 ? raw.slice(execIdx, locIdx >= 0 ? locIdx : undefined) : ''

  const obsM  = execRaw.match(/\bObs:\s*(.+?)(?:\n|$)/i)
  const nomeM = execRaw.match(/Nome\s+Executante:\s*(.+?)(?:\n|$)/i)

  const blocos = histRaw
    .split(/\n-{10,}\n?/)
    .map(b => b.trim())
    .filter(Boolean)
    .reverse()

  const historico: HistoricoEntry[] = blocos.map(bloco => {
    const linhas  = bloco.split('\n')
    const ultima  = linhas[linhas.length - 1].trim()
    const autorRE = /^([A-ZÁÉÍÓÚÃÕÇÜA-Z][A-ZÁÉÍÓÚÃÕÇÜa-z0-9]+)\s*-\s*(\d{2}\/\d{2}(?:\/\d{4})?)\s*-\s*(\d{2}:\d{2})$/
    const m       = ultima.match(autorRE)
    const texto   = m ? linhas.slice(0, -1).join('\n').trim() : bloco
    return {
      texto,
      autor:     m ? m[1] : null,
      data:      m ? m[2] : null,
      hora:      m ? m[3] : null,
      isReagend: REAGEND_RE.test(texto),
    }
  }).filter(e => e.texto)

  return {
    historico,
    obsTecnico:  obsM  ? obsM[1].trim()  : null,
    nomeTecnico: nomeM ? nomeM[1].trim() : null,
  }
}

interface Material {
  nome:       string
  id:         string
  quantidade: unknown
}

interface OSDetailsResult {
  isLoading:          boolean
  error:              Error | null
  details: {
    historico:         HistoricoEntry[]
    obsTecnico:        string | null
    nomeTecnico:       string | null
    reagendada:        boolean
    equipeAgendada:    string | null
    equipeExecutou:    string | null
    equipeReagend:     string | null
    materiais:         Material[]
    materiaisRetirados:Material[]
    datacontratacao:   string | null
    datainstalacao:    string | null
    situacaocontrato:  number | null
    valorcontrato:     number | null
  } | null
}

// Transforma a resposta crua de /detalhes em details parseado. Exportado para
// reuso fora do hook (ex.: copiar OS com histórico via queryClient.fetchQuery).
export function parseOSDetails(data: unknown): OSDetailsResult['details'] {
  if (!data) return null

  const raw = data as Record<string, unknown>
  const rawOs = raw.os
  const osObj: Record<string, unknown> = (typeof rawOs === 'object' && rawOs !== null) ? rawOs as Record<string, unknown> : {}

  const { historico, obsTecnico, nomeTecnico } = parseObs((osObj.observacoes as string) || '')

  const mapMaterial = (m: Record<string, unknown>): Material => ({
    nome:       String(m.material || m.nome || m.descricao || '').trim(),
    id:         String(m.identificadorunico || '').trim(),
    quantidade: m.quantidade ?? m.qtd ?? '',
  })

  const materiais = Array.isArray(raw.materiais_utilizados)
    ? (raw.materiais_utilizados as Record<string, unknown>[]).map(mapMaterial).filter(m => m.nome)
    : []

  const materiaisRetirados = Array.isArray(raw.materiais_retirados)
    ? (raw.materiais_retirados as Record<string, unknown>[]).map(mapMaterial).filter(m => m.nome)
    : []

  return {
    historico,
    obsTecnico,
    nomeTecnico,
    reagendada:        raw.reagendada === true || raw.reagendada === 'true',
    equipeAgendada:    (osObj.nomedaequipe   as string) || null,
    equipeExecutou:    (osObj.equipeexecutou as string) || null,
    equipeReagend:     (raw.equipe_reagendou as string) || null,
    materiais,
    materiaisRetirados,
    datacontratacao:   (osObj.datacontratacao as string) || null,
    datainstalacao:    (osObj.datainstalacao  as string) || null,
    situacaocontrato:  typeof osObj.situacaocontrato === 'number' ? osObj.situacaocontrato : null,
    valorcontrato:     typeof osObj.valorcontrato    === 'number' ? osObj.valorcontrato    : null,
  }
}

// Query options compartilhadas — mesma queryKey usada pelo fetchQuery no copiar.
export function osDetailsQuery(numos: string) {
  return {
    queryKey: ['os-detalhes', numos] as const,
    queryFn:  () => api.get(`${endpoints.detalhes}?numos=${numos}`),
    staleTime: 1000 * 60 * 5,
  }
}

export function useOSDetails(numos: string | null | undefined): OSDetailsResult {
  const { data, isLoading, error } = useQuery({
    ...osDetailsQuery(numos as string),
    enabled:  !!numos,
    retry:    0,
  })

  if (!data) return { isLoading: !!(numos && isLoading), error: error as Error | null, details: null }

  return { isLoading: false, error: error as Error | null, details: parseOSDetails(data) }
}
