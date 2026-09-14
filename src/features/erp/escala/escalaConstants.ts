import { TEAMS } from '../erpConstants'
import { INST_EQS, WES_EQS, THM_EQS } from '../../fechamento/fechamentoUtils'
import { CLUSTERS } from '../../../lib/clusters'
import type { EscalaItem } from '../../../lib/api'

export type Empresa = 'INSTACABLE' | 'THM' | 'WES' | 'PROPRIA'

export interface EscalaEquipe {
  /** Chave usada como team_code na API/DB — o número da frente (ex: 'F01'), ou o
   *  código da equipe própria (ex: 'M02'). Único dentro do roster. */
  codigo:      string
  tecnico:     string
  empresa:     Empresa
  clusterBase: string
}

// Base regional de cada frente — não existe em nenhum outro lugar do código
// (TEAMS só guarda código+líder, clusters.ts só sabe cidade atendida por OS).
// Vem da planilha operacional; ajustar aqui quando uma frente mudar de base.
const CLUSTER_BASE_POR_FRENTE: Record<string, string> = {
  F01: 'Caçapava', F04: 'Tremembé', F48: 'São José dos Campos',
  F20: 'Taubaté', F45: 'Taubaté', F47: 'Taubaté', F50: 'Taubaté',
  F12: 'Taubaté', F13: 'Taubaté', F14: 'Taubaté',
  F08: 'Pindamonhangaba', F11: 'Pindamonhangaba', F23: 'Pindamonhangaba',
  F36: 'Pindamonhangaba',
}

// Equipes que não abrem OS (por isso não existem em TEAMS) mas entram na escala
// — equipe própria de qualidade/VT/troca de equipamento. M04 e M77 aposentadas
// (confirmado 2026-09-14) — não reintroduzir.
const EQUIPES_PROPRIAS: EscalaEquipe[] = [
  { codigo: 'M01', tecnico: 'Sergio Oliveira', empresa: 'PROPRIA', clusterBase: 'Qualidade' },
  { codigo: 'M02', tecnico: 'Claudio Filho',   empresa: 'PROPRIA', clusterBase: 'Qualidade' },
  { codigo: 'M03', tecnico: 'Pedro Teixeira',  empresa: 'PROPRIA', clusterBase: 'Qualidade' },
]

const frenteDoCodigo = (code: string): string => code.split(' ').pop() ?? ''

function empresaDaFrente(frente: string): Empresa | null {
  if (INST_EQS.includes(frente)) return 'INSTACABLE'
  if (WES_EQS.includes(frente))  return 'WES'
  if (THM_EQS.includes(frente))  return 'THM'
  return null
}

// Roster fixo da escala — só as frentes de instalação (que atendem cidade por
// cidade) mais as equipes próprias acima. Manutenção/Rede não entram aqui: seu
// trabalho não é "qual cidade hoje", é infraestrutura/chamado técnico.
export const ESCALA_EQUIPES: EscalaEquipe[] = [
  ...TEAMS
    .filter(t => t.tipo === 'INSTALACAO')
    .map((t): EscalaEquipe | null => {
      const frente = frenteDoCodigo(t.code)
      const empresa = empresaDaFrente(frente)
      if (!empresa) return null
      return { codigo: frente, tecnico: t.leader, empresa, clusterBase: CLUSTER_BASE_POR_FRENTE[frente] ?? '—' }
    })
    .filter((e): e is EscalaEquipe => e !== null),
  ...EQUIPES_PROPRIAS,
]

export const EMPRESA_LABEL: Record<Empresa, string> = {
  INSTACABLE: 'Instacable', THM: 'THM', WES: 'WES', PROPRIA: 'Equipe Própria',
}

export const EMPRESA_COLOR: Record<Empresa, string> = {
  INSTACABLE: '#3b82f6', THM: '#a78bfa', WES: '#4ade80', PROPRIA: '#facc15',
}

// Nomes curtos só para o dropdown da escala — cabem melhor na célula. O nome
// completo (CLUSTERS.VALE.cidades) continua sendo o que casa com a cidade da OS
// em todo o resto do app; aqui é só rótulo, a escala não cruza com dado de OS.
const CIDADE_LABEL_CURTO: Record<string, string> = {
  'Pindamonhangaba':      'Pinda',
  'São José dos Campos':  'São José',
}

// Cidades atendidas (as 5 do cluster Vale) + atividades fixas do dropdown de status.
export const STATUS_LOCAIS      = Object.values(CLUSTERS.VALE.cidades).map(c => CIDADE_LABEL_CURTO[c] ?? c)
export const STATUS_ATIVIDADES  = ['Qualidade', 'Plantão', 'Treinamento', 'Folga', 'Férias', 'Ausente']
export const STATUS_OPTIONS     = [...STATUS_LOCAIS, ...STATUS_ATIVIDADES]

// Atividades que não são "estar numa cidade" — usadas para colorir a grade e
// para o painel de cobertura separar disponibilidade de indisponibilidade.
export const STATUS_INDISPONIVEL = new Set(['Folga', 'Férias', 'Ausente'])

export interface CellValue { local1: string; local2: string }

export function buildStatusMap(items: EscalaItem[]): Map<string, CellValue> {
  const map = new Map<string, CellValue>()
  for (const it of items) map.set(`${it.team_code}|${it.dia}`, { local1: it.local1, local2: it.local2 })
  return map
}

/** Conta EQUIPES distintas com `status` em pelo menos um dia da semana,
 *  separadas em próprias vs terceiras — não conta dias. Uma equipe de férias
 *  a semana toda tem 7 células "Férias", mas continua sendo 1 equipe de
 *  férias, não 7. */
export function contarEquipesComStatus(
  status:    string,
  statusMap: Map<string, CellValue>,
  days:      { key: string }[],
): { propria: number; terceira: number } {
  let propria = 0, terceira = 0
  for (const e of ESCALA_EQUIPES) {
    const temStatus = days.some(d => {
      const v = statusMap.get(`${e.codigo}|${d.key}`)
      return !!v && (v.local1 === status || v.local2 === status)
    })
    if (!temStatus) continue
    if (e.empresa === 'PROPRIA') propria += 1; else terceira += 1
  }
  return { propria, terceira }
}
