import { severityFromRx, type SignalRow, type SignalSeverity } from './nivelSinal'

/**
 * Potência lida em campo depois da tratativa, um registro por cliente da PON.
 * Fica sempre editável: a equipe fecha a PON com o que mediu na hora e completa
 * os que faltaram depois, pela aba PONs tratadas.
 */
export interface PonMedicao {
  onu_key: string
  cliente: string
  onu: string
  serial: string
  /** Potência do CSV no momento em que a PON foi tratada — não muda depois. */
  rx_antes: number | null
  rx_depois: number | null
  observacao: string
  updated_at?: string
  updated_by?: string
}

/** Linha do formulário: a medição salva cruzada com o CSV carregado agora. */
export interface MedicaoDraft extends PonMedicao {
  /** Texto cru do input — string porque "" é "ainda não medido", não zero. */
  valor: string
  nivelAntes: SignalSeverity
  /** A ONU ainda aparece no CSV carregado? Sem CSV, ninguém aparece. */
  noCsv: boolean
}

const clean = (value: string | undefined) => {
  const trimmed = (value ?? '').trim()
  return trimmed && trimmed !== '—' ? trimmed : ''
}

/**
 * Identidade do cliente dentro da PON. O código do assinante vem primeiro porque
 * é o único campo que não muda: trocar a ONU — tratativa de rotina — troca serial
 * e ONU ID, e o registro seguiria outro aparelho em vez do mesmo cliente.
 * O resto da cadeia cobre CSV exportado sem a coluna Código.
 */
export const medicaoKey = (row: Pick<SignalRow, 'serial' | 'onu' | 'codigo' | 'cliente'>) =>
  clean(row.codigo) || clean(row.serial) || clean(row.onu) || clean(row.cliente)

/** Campo em branco é "não medido" (null); texto inválido vira NaN para a tela recusar. */
export function parseRxInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  return Number(normalized)
}

export const formatRx = (value: number | null) => value == null ? '' : value.toFixed(2).replace('.', ',')

/** Potência plausível de ONU GPON — fora disso é dedo trocado, não medição. */
export const rxInputInvalido = (value: string) => {
  const parsed = parseRxInput(value)
  return parsed != null && (Number.isNaN(parsed) || parsed > 0 || parsed < -60)
}

/**
 * A chave tem de ser única na PON: repetida, o React embaralha as linhas e o
 * UNIQUE(pon_key, onu_key) do banco recusa a gravação inteira. Homônimos sem
 * serial ganham sufixo pela ordem no CSV, que é estável entre importações.
 */
function uniqueKeys(rows: SignalRow[]): string[] {
  const usadas = new Map<string, number>()
  return rows.map(row => {
    const base = medicaoKey(row) || 'sem-identificacao'
    const repeticoes = usadas.get(base) ?? 0
    usadas.set(base, repeticoes + 1)
    return repeticoes ? `${base}#${repeticoes + 1}` : base
  })
}

export function buildMedicaoDrafts(rows: SignalRow[], saved: PonMedicao[]): MedicaoDraft[] {
  const savedByKey = new Map(saved.map(item => [item.onu_key, item]))
  const chaves = uniqueKeys(rows)
  const fromCsv = rows.map((row, index) => toDraft(savedByKey.get(chaves[index]), {
    onu_key: chaves[index], cliente: row.cliente, onu: row.onu, serial: row.serial, rxAtual: row.rx,
  }, false))
  const seen = new Set(chaves)
  const orphans = saved.filter(item => !seen.has(item.onu_key)).map(item => toDraft(item, {
    onu_key: item.onu_key, cliente: item.cliente, onu: item.onu, serial: item.serial, rxAtual: item.rx_antes,
  }, true))
  return [...fromCsv, ...orphans].sort((a, b) =>
    (a.rx_antes ?? Infinity) - (b.rx_antes ?? Infinity) || a.cliente.localeCompare(b.cliente, 'pt-BR'))
}

interface DraftBase { onu_key: string; cliente: string; onu: string; serial: string; rxAtual: number | null }

function toDraft(saved: PonMedicao | undefined, base: DraftBase, noCsv: boolean): MedicaoDraft {
  // O "antes" é a foto do momento da tratativa: um CSV novo não pode reescrevê-la,
  // nem quando a foto saiu vazia — senão uma leitura de hoje entra como "antes".
  const rxAntes = saved ? saved.rx_antes : base.rxAtual
  const rxDepois = saved?.rx_depois ?? null
  return {
    onu_key: base.onu_key, cliente: base.cliente || saved?.cliente || '—',
    onu: base.onu || saved?.onu || '', serial: base.serial || saved?.serial || '',
    rx_antes: rxAntes, rx_depois: rxDepois, observacao: saved?.observacao ?? '',
    valor: formatRx(rxDepois), nivelAntes: severityFromRx(rxAntes),
    noCsv,
  }
}

export function medicoesResumo(drafts: MedicaoDraft[]) {
  // O que a tela recusa salvar não é medição: contar como preenchida faria o
  // cabeçalho dizer "3 de 4 medidas" com o rodapé acusando valor inválido.
  const medidas = drafts.filter(draft => !rxInputInvalido(draft.valor))
    .map(draft => parseRxInput(draft.valor))
    .filter((depois): depois is number => depois != null)
  return {
    total: drafts.length,
    preenchidas: medidas.length,
    pendentes: drafts.length - medidas.length,
    normalizadas: medidas.filter(depois => severityFromRx(depois) === 'Normal').length,
  }
}

/** Manda a PON inteira, inclusive quem ficou sem medir — o cadastro é a lista. */
export function draftsToMedicoes(drafts: MedicaoDraft[]): PonMedicao[] {
  return drafts.map(draft => {
    const parsed = parseRxInput(draft.valor)
    return {
      onu_key: draft.onu_key, cliente: draft.cliente, onu: draft.onu, serial: draft.serial,
      rx_antes: draft.rx_antes, rx_depois: parsed != null && Number.isFinite(parsed) ? parsed : null,
      observacao: draft.observacao.trim(),
    }
  })
}
