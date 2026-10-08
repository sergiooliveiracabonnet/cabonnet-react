// O cadastro de bairros do ERP é digitado à mão: o mesmo bairro aparece com e sem acento,
// abreviado ("JD", "VL", "RES"), com ou sem artigo ("ALTO DA BORDA", "ALTO DO BORDA"), com
// erro de digitação ("RESIDDENCIAL"), com algarismo romano ou arábico ("CONTINENTAL I" e
// "CONTINENTAL 1") e cortado em 20 caracteres. Este módulo reduz tudo isso a uma forma única
// SEM juntar bairros que são de fato diferentes ("CONTINENTAL I" e "II", "PARQUE RESIDENCIAL
// M" e "N", "JARDIM REGINA" e "JARDIM REGINA MOREIRA").

export const normalizarTexto = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

/** O ERP corta o nome do bairro em 20 caracteres ("RESIDENCIAL ESPERANC"); na base aparecem cortes
 *  de 19 também ("CONJ HAB MILTON ALV"). Nome com 17 a 20 caracteres pode ser um nome cortado. */
export const LIMITE_BAIRRO_ERP = 20
const MIN_NOME_CORTADO = 17

// Abreviações que a base realmente usa. Só entram as que não têm outro sentido provável.
const ABREVIACOES: Record<string, string> = {
  JD: 'JARDIM', JDM: 'JARDIM', VL: 'VILA', PQ: 'PARQUE', PRQ: 'PARQUE',
  RES: 'RESIDENCIAL', RESID: 'RESIDENCIAL', CJ: 'CONJUNTO', CONJ: 'CONJUNTO', HAB: 'HABITACIONAL',
  LOT: 'LOTEAMENTO', COND: 'CONDOMINIO', CHAC: 'CHACARA', STA: 'SANTA', STO: 'SANTO',
  SRA: 'SENHORA', NSRA: 'NOSSA SENHORA', IND: 'INDUSTRIAL', DIST: 'DISTRITO', DISTR: 'DISTRITO', DIT: 'DISTRITO',
  ESP: 'ESPLANADA', ESPL: 'ESPLANADA', PROF: 'PROFESSOR', DR: 'DOUTOR',
}

// Artigos que a digitação põe ou tira ("VITORIA DO VALE" = "VITORIA VALE").
const ARTIGOS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS'])

const ROMANOS: Record<string, string> = { I: '1', II: '2', III: '3', IV: '4', V: '5', VI: '6', VII: '7', VIII: '8', IX: '9', X: '10' }

/** Letras repetidas valem uma ("VILLA"=VILA, "RESIDDENCIAL"), e S/Z se confundem na digitação
 *  ("LUIS"/"LUIZ", "TEREZA"/"TERESA"). Só para comparar: o nome exibido não passa por aqui. */
const dobrarLetras = (token: string): string => (/^[A-Z]+$/.test(token) ? token.replace(/Z/g, 'S').replace(/([A-Z])\1+/g, '$1') : token)

/** Forma única do bairro para comparar: sem acento, caixa, pontuação, artigo, abreviação,
 *  com o algarismo romano final em arábico e com letras repetidas e S/Z dobrados. */
export function canonicalizarBairro(texto: string): string {
  // "VILA S O BENEDITO" é "VILA SAO BENEDITO" digitado com espaço.
  const base = normalizarTexto(texto).replace(/\bS O\b/g, 'SAO')
  const tokens = base ? base.split(' ') : []
  const saida: string[] = []
  tokens.forEach((token, i) => {
    const ultimo = i === tokens.length - 1
    if (ARTIGOS.has(token)) return
    // "E" no meio é conjunção ("LOT RES E COMERCIAL"); no fim é a letra da seção ("PARQUE RESIDENCIAL E").
    if (token === 'E' && !ultimo) return
    if (ultimo && i > 0 && ROMANOS[token]) { saida.push(ROMANOS[token]); return }
    saida.push(ABREVIACOES[token] ?? token)
  })
  return saida.join(' ').split(' ').map(dobrarLetras).join(' ')
}

/** Chave de agrupamento: a forma canônica sem espaços ("OURO VILLE" = "OUROVILLE"). */
export const chaveDeAgrupamento = (canonico: string): string => canonico.replace(/ /g, '')

/** Todas as variantes do grupo têm entre 17 e 20 caracteres: provável nome cortado pelo ERP. */
export const todasCortadasNoLimite = (variantes: Iterable<string>): boolean => {
  const lista = [...variantes]
  return lista.length > 0 && lista.every(v => { const n = normalizarTexto(v).length; return n >= MIN_NOME_CORTADO && n <= LIMITE_BAIRRO_ERP })
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 1) return 2
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const atual = [i]
    for (let j = 1; j <= b.length; j++) atual.push(Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)))
    anterior = atual
  }
  return anterior[b.length]
}

/** Erro de digitação provável: dois nomes iguais em tudo, menos uma palavra que difere em uma
 *  letra. A palavra tem de ter 5+ letras (evita "NOVA"/"NOVO") e não pode ter dígito
 *  (evita "I"/"II"/"2"/"3"). */
export function mesmoNomeComUmaLetraErrada(a: string, b: string): boolean {
  const ta = a.split(' '), tb = b.split(' ')
  if (ta.length !== tb.length) return false
  let diferente = -1
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] === tb[i]) continue
    if (diferente >= 0) return false
    diferente = i
  }
  if (diferente < 0) return false
  const x = ta[diferente], y = tb[diferente]
  return x.length >= 5 && y.length >= 5 && /^[A-Z]+$/.test(x) && /^[A-Z]+$/.test(y) && levenshtein(x, y) === 1
}

const temAcento = (texto: string): boolean => /[À-ÿ]/.test(texto)
const cortadoNoLimite = (texto: string): boolean => { const n = normalizarTexto(texto).length; return n >= MIN_NOME_CORTADO && n <= LIMITE_BAIRRO_ERP }

/** Escreve as abreviações por extenso ("JD. AMÁLIA" vira "JARDIM AMÁLIA"), mantendo o resto. */
export function expandirAbreviacoes(texto: string): string {
  return texto.trim().split(/[\s.]+/).filter(Boolean).map(t => ABREVIACOES[normalizarTexto(t)] ?? t).join(' ')
}

/** O nome termina em artigo ("RESIDENCIAL VALE DAS"): nenhum bairro termina assim, então foi cortado. */
export const terminaEmArtigo = (variantes: Iterable<string>): boolean => {
  const lista = [...variantes]
  return lista.length > 0 && lista.every(v => ARTIGOS.has(normalizarTexto(v).split(' ').pop() ?? ''))
}

/** Nome exibido do grupo. Entre as grafias, descarta as que são só o começo de outra (nome cortado:
 *  "JARDIM MARLENE MIRAN" perde para "JD MARLENE MIRANDA"); das que sobram, vale a inteira mais usada
 *  — assim um erro de digitação raro não vira o nome — e, no empate, a com acento. Abreviações saem
 *  por extenso. */
export function escolherNomeBairro(variantes: Map<string, number>): string {
  const lista = [...variantes].map(([nome, n]) => ({ nome, n, forma: chaveDeAgrupamento(canonicalizarBairro(nome)) }))
  const completas = lista.filter(a => !lista.some(b => b.forma.length > a.forma.length && b.forma.startsWith(a.forma)))
  const melhor = (completas.length ? completas : lista).sort((a, b) =>
    Number(cortadoNoLimite(a.nome)) - Number(cortadoNoLimite(b.nome)) ||
    b.n - a.n ||
    Number(temAcento(b.nome)) - Number(temAcento(a.nome)) ||
    b.nome.length - a.nome.length)[0].nome
  return expandirAbreviacoes(melhor)
}

/** As grafias do grupo, da mais usada para a menos usada — para mostrar o que foi unido. */
export const listarGrafias = (variantes: Map<string, number>): string[] =>
  [...variantes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([nome]) => nome)
