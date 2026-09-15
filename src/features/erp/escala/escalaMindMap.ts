import { ESCALA_EQUIPES, STATUS_LOCAIS, STATUS_INDISPONIVEL, buildStatusMap, type CellValue, type Empresa } from './escalaConstants'
import type { EscalaItem } from '../../../lib/api'

export type GrupoKind = 'cidade' | 'atividade' | 'indisponivel'

export interface MindMapLeaf {
  codigo:  string
  tecnico: string
  empresa: Empresa
  /** true quando a equipe está aqui pelo Local 2 (segundo local do dia) — leaf
   *  fica com um traço visual diferente pra não confundir com o local principal. */
  segundoLocal: boolean
}

export interface MindMapGroup {
  key:      string
  label:    string
  kind:     GrupoKind
  color:    string
  equipes:  MindMapLeaf[]
}

// Paleta fixa por cidade — não existe em nenhum outro lugar do código (as
// cidades hoje só têm cor via empresa/operadora). Ordem casa com STATUS_LOCAIS.
const CIDADE_COLOR: Record<string, string> = {
  'Caçapava':  '#3b82f6',
  'Tremembé':  '#22d3ee',
  'São José':  '#a78bfa',
  'Taubaté':   '#4ade80',
  'Pinda':     '#f97316',
}
const COR_INDISPONIVEL = '#f87171'
const COR_ATIVIDADE    = '#facc15'

// A imagem mostra onde as equipes estão atendendo — quem não está atendendo
// (folga, férias, treinamento) fica de fora por completo, não só escondido
// num grupo à parte. Ausente/Plantão/Qualidade continuam aparecendo.
const STATUS_FORA_DO_MAPA = new Set(['Folga', 'Férias', 'Treinamento'])

function corDoGrupo(label: string, kind: GrupoKind): string {
  if (kind === 'cidade') return CIDADE_COLOR[label] ?? '#64748b'
  if (kind === 'indisponivel') return COR_INDISPONIVEL
  return COR_ATIVIDADE
}

function kindDoStatus(status: string): GrupoKind {
  if (STATUS_INDISPONIVEL.has(status)) return 'indisponivel'
  if (STATUS_LOCAIS.includes(status))  return 'cidade'
  return 'atividade'
}

/** Monta os grupos (cidade/atividade/indisponibilidade) do dia, cada um com as
 *  equipes que estão lá — via Local 1 ou Local 2. Grupos sem nenhuma equipe
 *  não aparecem: o mapa mental mostra só o que está de fato preenchido. */
export function buildMindMapGroups(items: EscalaItem[], dia: string): MindMapGroup[] {
  const statusMap = buildStatusMap(items.filter(it => it.dia === dia))
  const groups = new Map<string, MindMapGroup>()

  const add = (status: string, equipe: MindMapLeaf) => {
    const status_ = status.trim()
    if (!status_ || STATUS_FORA_DO_MAPA.has(status_)) return
    if (!groups.has(status_)) {
      const kind = kindDoStatus(status_)
      groups.set(status_, { key: status_, label: status_, kind, color: corDoGrupo(status_, kind), equipes: [] })
    }
    groups.get(status_)!.equipes.push(equipe)
  }

  for (const e of ESCALA_EQUIPES) {
    const v: CellValue | undefined = statusMap.get(`${e.codigo}|${dia}`)
    if (!v) continue
    if (v.local1) add(v.local1, { codigo: e.codigo, tecnico: e.tecnico, empresa: e.empresa, segundoLocal: false })
    if (v.local2) add(v.local2, { codigo: e.codigo, tecnico: e.tecnico, empresa: e.empresa, segundoLocal: true })
  }

  const ordemKind: Record<GrupoKind, number> = { cidade: 0, atividade: 1, indisponivel: 2 }
  return [...groups.values()].sort((a, b) =>
    ordemKind[a.kind] - ordemKind[b.kind] || b.equipes.length - a.equipes.length
  )
}
