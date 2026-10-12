export type NivelStatus = 'ok' | 'atencao' | 'critico'

/** Nivel de uma metrica em que mais e melhor (SLA, cumprimento). */
export function nivelPorPiso(valor: number, okMin: number, atencaoMin: number): NivelStatus {
  if (valor >= okMin) return 'ok'
  if (valor >= atencaoMin) return 'atencao'
  return 'critico'
}

const TEXTO: Record<NivelStatus, string> = { ok: 'text-green', atencao: 'text-yellow', critico: 'text-red' }

export function statusTextClass(nivel: NivelStatus): string {
  return TEXTO[nivel]
}

/** Nivel de uma metrica em que menos e melhor (aging, MTTR, backlog, reincidencia). */
export function nivelPorTeto(valor: number, atencaoAcima: number, criticoAcima: number): NivelStatus {
  if (valor > criticoAcima) return 'critico'
  if (valor > atencaoAcima) return 'atencao'
  return 'ok'
}
