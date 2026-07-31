// Régua ÚNICA de SLA da página de Fornecedor.
//
// Antes existiam três, divergentes, na mesma tela: o cabeçalho do painel cortava
// em 90/80/65, o Badge ao lado cortava em 90/75 e o card de KPI só distinguia
// 90. Um fornecedor com SLA 72% aparecia como "Regular" em amarelo e vermelho
// simultaneamente, a centímetros de distância — o que corrói a confiança no
// painel inteiro mais rápido do que um número errado.
//
// Faixas de SLA, não de score: 75% de cumprimento de prazo não é "Bom" para um
// fornecedor sob contrato, é problema.

export type SlaAccent = 'green' | 'primary' | 'yellow' | 'red'

export interface SlaEscala {
  text:   string
  bg:     string
  border: string
  label:  string
  accent: SlaAccent
  /** variant do componente Badge, para não recriar uma quarta régua lá dentro.
   *  Restrito às variantes que o Badge realmente conhece — nome fora da lista
   *  cai num `?? ''` silencioso e o badge sai sem cor. */
  badge:  'green' | 'cyan' | 'yellow' | 'red'
}

export const SLA_EXCELENTE = 90
export const SLA_BOM       = 80
export const SLA_REGULAR   = 65

export function slaEscala(s: number): SlaEscala {
  if (s >= SLA_EXCELENTE) {
    return { text: 'text-green', bg: 'bg-green/10', border: 'border-green/20', label: 'Excelente', accent: 'green', badge: 'green' }
  }
  if (s >= SLA_BOM) {
    return { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', label: 'Bom', accent: 'primary', badge: 'cyan' }
  }
  if (s >= SLA_REGULAR) {
    return { text: 'text-yellow', bg: 'bg-yellow/10', border: 'border-yellow/20', label: 'Regular', accent: 'yellow', badge: 'yellow' }
  }
  return { text: 'text-red', bg: 'bg-red/10', border: 'border-red/20', label: 'Crítico', accent: 'red', badge: 'red' }
}
