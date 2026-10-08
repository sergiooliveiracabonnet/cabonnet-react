import type { CelulaMes, Comparativo, LinhaComparativo } from './reincidenciasReport'

export type MetricaComparativo = 'os' | 'clientes' | 'taxa'

export const METRICAS: Array<{ id: MetricaComparativo; label: string; hint: string }> = [
  { id: 'os', label: 'OS envolvidas', hint: 'origem + retornos, a mesma contagem do relatório' },
  { id: 'clientes', label: 'Clientes reincidentes', hint: 'clientes distintos com revisita' },
  { id: 'taxa', label: 'Taxa de revisita', hint: 'reincidentes ÷ clientes atendidos no bairro' },
]

const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

export interface MesSelecionavel {
  /** '2026-09' */
  id: string
  /** 'SET/26' */
  label: string
  from: Date
  to: Date
  /** Mês ainda em curso: os números são parciais. */
  parcial: boolean
}

/** Os últimos `quantos` meses civis, do mais recente para o mais antigo, a partir de `hoje`. */
export function ultimosMeses(quantos: number, hoje: Date = new Date()): MesSelecionavel[] {
  return Array.from({ length: quantos }, (_, i) => {
    const primeiro = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    const ultimo = new Date(primeiro.getFullYear(), primeiro.getMonth() + 1, 0)
    const ano = primeiro.getFullYear()
    return {
      id: `${ano}-${String(primeiro.getMonth() + 1).padStart(2, '0')}`,
      label: `${MESES_ABREV[primeiro.getMonth()]}/${String(ano).slice(2)}`,
      from: primeiro, to: ultimo, parcial: i === 0,
    }
  })
}

/** Valor de uma célula na métrica escolhida; null quando não se aplica (taxa sem base). */
export function valorCelula(celula: CelulaMes, metrica: MetricaComparativo): number | null {
  if (metrica === 'os') return celula.nOS
  if (metrica === 'clientes') return celula.nClientes
  return celula.taxa
}

export interface LinhaTabela {
  key: string
  bairro: string
  cidade: string
  label: string
  /** Grafias do cadastro reunidas nesta linha, da mais usada à menos. */
  variantes: string[]
  /** Um valor por mês, na ordem das colunas. */
  valores: Array<number | null>
  /** Total dos meses; null na taxa (não se soma). */
  total: number | null
  /** Último mês − primeiro; na taxa, em pontos percentuais. null com um mês só. */
  variacao: number | null
  /** Para a dica ao passar o mouse: OS, clientes e taxa de cada mês. */
  detalhes: CelulaMes[]
}

export interface TabelaComparativo {
  colunas: Array<{ id: string; label: string }>
  linhas: LinhaTabela[]
  totais: Array<number | null>
  totalGeral: number | null
  variacaoGeral: number | null
  maximo: number
  metrica: MetricaComparativo
}

const arredondar = (n: number) => Math.round(n * 10) / 10

function variacaoDe(valores: Array<number | null>): number | null {
  if (valores.length < 2) return null
  const primeiro = valores[0], ultimo = valores[valores.length - 1]
  return primeiro === null || ultimo === null ? null : arredondar(ultimo - primeiro)
}

export function montarTabela(comp: Comparativo, metrica: MetricaComparativo): TabelaComparativo {
  const ids = comp.periodos.map(p => p.id)
  const linhas = comp.linhas.map((l: LinhaComparativo): LinhaTabela => {
    const valores = ids.map(id => valorCelula(l.meses[id], metrica))
    return {
      key: l.key, bairro: l.bairro, cidade: l.cidade, label: l.label, variantes: l.variantes, valores,
      total: metrica === 'os' ? l.totalOS : metrica === 'clientes' ? l.totalClientes : null,
      variacao: variacaoDe(valores),
      detalhes: ids.map(id => l.meses[id]),
    }
  })
  const totais = ids.map(id => valorCelula(comp.totais[id], metrica))
  const todos = linhas.flatMap(l => l.valores).filter((v): v is number => v !== null)
  return {
    colunas: comp.periodos, linhas, totais,
    totalGeral: metrica === 'taxa' ? null : totais.reduce<number>((s, v) => s + (v ?? 0), 0),
    variacaoGeral: variacaoDe(totais),
    maximo: todos.length ? Math.max(...todos) : 0,
    metrica,
  }
}

export const formatarValor = (valor: number | null, metrica: MetricaComparativo): string => {
  if (valor === null) return '—'
  return metrica === 'taxa' ? `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%` : String(valor)
}

/** "+3", "-2", "0"; na taxa em pontos percentuais ("+1,5 pp"). Vazio sem variação. */
export function formatarVariacao(variacao: number | null, metrica: MetricaComparativo): string {
  if (variacao === null) return ''
  const numero = Math.abs(variacao).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  const sinal = variacao > 0 ? '+' : variacao < 0 ? '-' : ''
  return `${sinal}${numero}${metrica === 'taxa' ? ' pp' : ''}`
}

/** Escape de CSV: aspas dobradas quando há ;, aspas ou quebra de linha. */
const campoCSV = (texto: string): string => (/[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto)

/** CSV para Excel em português: separador `;`, vírgula decimal e BOM para os acentos. */
export function tabelaParaCSV(tabela: TabelaComparativo, tipo: string): string {
  const { metrica } = tabela
  const numero = (v: number | null) => (v === null ? '' : String(v).replace('.', ','))
  const cabecalho = ['Bairro', 'Cidade', ...tabela.colunas.map(c => c.label), ...(metrica === 'taxa' ? [] : ['Total']), metrica === 'taxa' ? 'Variação (pp)' : 'Variação']
  const linhas = tabela.linhas.map(l => [l.bairro, l.cidade, ...l.valores.map(numero), ...(metrica === 'taxa' ? [] : [numero(l.total)]), numero(l.variacao)])
  const rodape = ['Total', '', ...tabela.totais.map(numero), ...(metrica === 'taxa' ? [] : [numero(tabela.totalGeral)]), numero(tabela.variacaoGeral)]
  const meta = [`${tipo} — comparativo mensal por bairro`, `Métrica: ${METRICAS.find(m => m.id === metrica)?.label ?? metrica}`]
  return `${String.fromCharCode(0xFEFF)}${[...meta.map(m => campoCSV(m)), '', cabecalho, ...linhas, rodape].map(l => (Array.isArray(l) ? l.map(campoCSV).join(';') : l)).join('\r\n')}\r\n`
}
