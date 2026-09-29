import { severityFromRx, type SignalSeverity } from './nivelSinal'
import type { TreatedPon } from './ponTreatments'

type Nivel = Exclude<SignalSeverity, '—'>
const NIVEIS: Nivel[] = ['Crítico', 'Atenção', 'Normal']

const round = (value: number, digits = 1) => Number(value.toFixed(digits))
const media = (values: number[]) => values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null
const mediana = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Clientes da PON com as duas leituras — ONU sem potência (antes ou depois) fica de fora. */
export function clientesMedidos(item: Pick<TreatedPon, 'medicoes'>) {
  return (item.medicoes ?? []).filter(m => m.rx_antes != null && m.rx_depois != null)
    .map(m => ({ ...m, rx_antes: m.rx_antes as number, rx_depois: m.rx_depois as number, ganho: (m.rx_depois as number) - (m.rx_antes as number) }))
}

/** Cliente com as duas leituras: só ele diz se a manutenção funcionou. */
interface Par { antes: number; depois: number; ganho: number }

function pares(item: Pick<TreatedPon, 'medicoes'>): Par[] {
  return clientesMedidos(item).map(m => ({ antes: m.rx_antes, depois: m.rx_depois, ganho: m.ganho }))
}

export interface PonEfetividade {
  pon_key: string
  pon: string
  olt: string
  cidade: string
  medidos: number
  ganhoMedio: number | null
  criticosAntes: number
  criticosDepois: number
}

export interface EfetividadeResumo {
  clientes: number
  medidos: number
  /** Medidos / cadastrados — quanto do resultado já é confiável. */
  cobertura: number
  ganhoMedio: number | null
  ganhoMediano: number | null
  melhoraram: number
  pioraram: number
  taxaMelhora: number
  criticosAntes: number
  criticosDepois: number
  recuperados: number
  taxaRecuperacao: number
  ponsAvaliadas: number
  ponsNormalizadas: number
}

export interface Transicao { de: Nivel; para: Nivel; total: number }
export interface GrupoEfetividade { nome: string; pons: number; medidos: number; ganhoMedio: number; taxaNormal: number }
export interface SemanaEfetividade { semana: string; inicio: string; tratadas: number; ganhoMedio: number | null }
export interface FaixaGanho { faixa: string; total: number; tom: 'ruim' | 'neutro' | 'bom' }

export const efetividadePons = (treated: TreatedPon[]): PonEfetividade[] => treated.map(item => {
  const lista = pares(item)
  const ganho = media(lista.map(p => p.ganho))
  return {
    pon_key: item.pon_key, pon: item.snapshot.pon, olt: item.snapshot.olt, cidade: item.snapshot.cidade,
    medidos: lista.length, ganhoMedio: ganho == null ? null : round(ganho, 2),
    criticosAntes: lista.filter(p => severityFromRx(p.antes) === 'Crítico').length,
    criticosDepois: lista.filter(p => severityFromRx(p.depois) === 'Crítico').length,
  }
})

export function efetividadeResumo(treated: TreatedPon[]): EfetividadeResumo {
  const todos = treated.flatMap(item => pares(item))
  const clientes = treated.reduce((sum, item) => sum + (item.medicoes?.length ?? 0), 0)
  const ganhos = todos.map(p => p.ganho)
  const criticosAntes = todos.filter(p => severityFromRx(p.antes) === 'Crítico')
  const recuperados = criticosAntes.filter(p => severityFromRx(p.depois) !== 'Crítico').length
  const melhoraram = todos.filter(p => p.ganho > 0).length
  const avaliadas = treated.filter(item => pares(item).length > 0)
  const gm = media(ganhos)
  const gmed = mediana(ganhos)
  return {
    clientes, medidos: todos.length, cobertura: clientes ? todos.length / clientes : 0,
    ganhoMedio: gm == null ? null : round(gm, 2), ganhoMediano: gmed == null ? null : round(gmed, 2),
    melhoraram, pioraram: todos.filter(p => p.ganho < 0).length,
    taxaMelhora: todos.length ? melhoraram / todos.length : 0,
    criticosAntes: criticosAntes.length,
    criticosDepois: todos.filter(p => severityFromRx(p.depois) === 'Crítico').length,
    recuperados, taxaRecuperacao: criticosAntes.length ? recuperados / criticosAntes.length : 0,
    ponsAvaliadas: avaliadas.length,
    ponsNormalizadas: avaliadas.filter(item => item.situacao === 'normalizada').length,
  }
}

/** Matriz antes → depois: de onde cada cliente saiu e onde chegou. */
export function matrizTransicao(treated: TreatedPon[]): Transicao[] {
  const contagem = new Map<string, number>()
  for (const p of treated.flatMap(item => pares(item))) {
    const chave = `${severityFromRx(p.antes)}|${severityFromRx(p.depois)}`
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }
  return NIVEIS.flatMap(de => NIVEIS.map(para => ({ de, para, total: contagem.get(`${de}|${para}`) ?? 0 })))
}

export function distribuicaoGanho(treated: TreatedPon[]): FaixaGanho[] {
  const faixas: FaixaGanho[] = [
    { faixa: 'Piorou', total: 0, tom: 'ruim' }, { faixa: '0 a 2 dB', total: 0, tom: 'neutro' },
    { faixa: '2 a 5 dB', total: 0, tom: 'bom' }, { faixa: '5 a 10 dB', total: 0, tom: 'bom' },
    { faixa: '+10 dB', total: 0, tom: 'bom' },
  ]
  for (const { ganho } of treated.flatMap(item => pares(item))) {
    faixas[ganho < 0 ? 0 : ganho < 2 ? 1 : ganho < 5 ? 2 : ganho < 10 ? 3 : 4].total++
  }
  return faixas
}

/** Agrupa por OLT ou cidade; só entra quem tem ao menos um cliente medido. */
export function efetividadePor(treated: TreatedPon[], campo: 'olt' | 'cidade'): GrupoEfetividade[] {
  const grupos = new Map<string, TreatedPon[]>()
  for (const item of treated) {
    const nome = item.snapshot[campo]
    grupos.set(nome, [...(grupos.get(nome) ?? []), item])
  }
  return [...grupos.entries()].flatMap(([nome, itens]) => {
    const lista = itens.flatMap(item => pares(item))
    const ganho = media(lista.map(p => p.ganho))
    if (ganho == null) return []
    return [{
      nome, pons: itens.length, medidos: lista.length, ganhoMedio: round(ganho, 2),
      taxaNormal: lista.filter(p => severityFromRx(p.depois) === 'Normal').length / lista.length,
    }]
  }).sort((a, b) => b.ganhoMedio - a.ganhoMedio)
}

const inicioSemana = (value: string): Date | null => {
  const data = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(data.getTime())) return null
  const inicio = new Date(data.getFullYear(), data.getMonth(), data.getDate())
  inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7)) // segunda-feira
  return inicio
}

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Tratativas por semana (pela data do OK) e o ganho médio das PONs daquela semana. */
export function evolucaoSemanal(treated: TreatedPon[]): SemanaEfetividade[] {
  const semanas = new Map<string, { data: Date; itens: TreatedPon[] }>()
  for (const item of treated) {
    const inicio = inicioSemana(item.created_at)
    if (!inicio) continue
    const chave = isoDia(inicio)
    const atual = semanas.get(chave) ?? { data: inicio, itens: [] }
    atual.itens.push(item)
    semanas.set(chave, atual)
  }
  return [...semanas.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([inicio, { data, itens }]) => {
    const ganho = media(itens.flatMap(item => pares(item)).map(p => p.ganho))
    return {
      semana: data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), inicio,
      tratadas: itens.length, ganhoMedio: ganho == null ? null : round(ganho, 2),
    }
  })
}

/** PONs onde a manutenção menos ajudou: menor ganho médio primeiro. Só as já medidas. */
export function ponsQueMenosMelhoraram(treated: TreatedPon[], limite = 5): PonEfetividade[] {
  return efetividadePons(treated)
    .filter(item => item.ganhoMedio != null)
    .sort((a, b) => (a.ganhoMedio as number) - (b.ganhoMedio as number) || b.criticosDepois - a.criticosDepois)
    .slice(0, limite)
}
