export type CauseLevel = 'confirmed' | 'probable' | 'undetermined'

export interface RevisitCauseInput { manualReason?: string | null; texts: string[] }
export interface RevisitCauseResult {
  category: string
  level: CauseLevel
  confidence: number
  evidence: string[]
}

const RULES: Array<{ category: string; pattern: RegExp }> = [
  { category: 'Conectorização/Sinal', pattern: /conector|sinal|pot[eê]ncia|atenua|fibra|cto|dbm/i },
  { category: 'Equipamento', pattern: /onu|ont|roteador|equipamento|fonte|defeito|substitu/i },
  { category: 'Configuração', pattern: /pppoe|vlan|senha|configura|perfil|firmware|provision/i },
  { category: 'Rede/Infraestrutura', pattern: /rompimento|cabo|poste|splitter|rede externa|infraestrutura/i },
  { category: 'Execução incompleta', pattern: /retornar|pendente|n[aã]o conclu|faltou|incomplet/i },
  { category: 'Cliente/Uso', pattern: /cliente ausente|sem acesso|equipamento do cliente|uso incorreto/i },
  { category: 'Reagendamento', pattern: /reagend|remarc|alterou data|nova data/i },
]

export function inferRevisitCause(input: RevisitCauseInput): RevisitCauseResult {
  const manual = input.manualReason?.trim()
  if (manual) return { category: manual, level: 'confirmed', confidence: 100, evidence: [manual] }

  const texts = input.texts.map(t => t.trim()).filter(Boolean)
  for (const rule of RULES) {
    const evidence = texts.filter(text => rule.pattern.test(text)).slice(0, 3)
    if (evidence.length) {
      return { category: rule.category, level: 'probable', confidence: evidence.length > 1 ? 80 : 65, evidence }
    }
  }
  return { category: 'Sem informação', level: 'undetermined', confidence: 0, evidence: [] }
}
