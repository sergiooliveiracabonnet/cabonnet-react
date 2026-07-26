import type { EvolucaoData } from '../types'

export function buildTendenciaSummary(evolucao?: EvolucaoData) {
  const labels = evolucao?.labels ?? []
  const abertasSerie = evolucao?.abertas ?? []
  const concluidasSerie = evolucao?.concluidas ?? []
  const abertas = abertasSerie.reduce((total, value) => total + value, 0)
  const concluidas = concluidasSerie.reduce((total, value) => total + value, 0)
  const picoValor = abertasSerie.length ? Math.max(...abertasSerie) : 0
  const picoIndex = abertasSerie.indexOf(picoValor)

  return {
    abertas,
    concluidas,
    saldo: concluidas - abertas,
    mediaAbertas: labels.length ? Math.round(abertas / labels.length * 10) / 10 : 0,
    pico: picoIndex >= 0 && labels[picoIndex] ? { data: labels[picoIndex], valor: picoValor } : null,
    dias: labels.length,
  }
}
