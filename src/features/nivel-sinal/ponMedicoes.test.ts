import { describe, expect, it } from 'vitest'
import { buildMedicaoDrafts, draftsToMedicoes, formatRx, medicaoKey, medicoesResumo, parseRxInput, type PonMedicao } from './ponMedicoes'
import type { SignalRow } from './nivelSinal'

const row = (overrides: Partial<SignalRow> = {}): SignalRow => ({
  cidade: 'Taubaté', bairro: 'Centro', olt: 'OLT TBT', tipo: 'Huawei', slot: '1', pon: '1/2',
  onu: '7', cliente: 'Cliente A', codigo: '12345', situacao: 'Conectado', pppoe: 'pppoe-a',
  serial: 'ABC123', modelo: 'HG8145', status: 'Online', classificacao: 'Crítico',
  rx: -29.5, tx: 2.1, oltRx: -22, distancia: 1200, temperatura: 48, causa: '—',
  cidadeCliente: 'Taubaté', alertaRx: true,
  ...overrides,
})

const medicao = (overrides: Partial<PonMedicao> = {}): PonMedicao => ({
  onu_key: '12345', cliente: 'Cliente A', onu: '7', serial: 'ABC123',
  rx_antes: -29.5, rx_depois: null, observacao: '',
  ...overrides,
})

describe('medicaoKey', () => {
  it('usa o código do assinante, que não muda quando a ONU é trocada', () => {
    expect(medicaoKey(row())).toBe('12345')
  })

  it('cai para serial, ONU e cliente quando o CSV não traz a coluna Código', () => {
    expect(medicaoKey(row({ codigo: '' }))).toBe('ABC123')
    expect(medicaoKey(row({ codigo: '—', serial: '' }))).toBe('7')
    expect(medicaoKey(row({ codigo: '', serial: '', onu: '' }))).toBe('Cliente A')
  })
})

describe('parseRxInput', () => {
  it('aceita vírgula decimal e devolve nulo para campo em branco', () => {
    expect(parseRxInput('-26,4')).toBe(-26.4)
    expect(parseRxInput('  ')).toBeNull()
    expect(parseRxInput('-31.2')).toBe(-31.2)
  })

  it('devolve NaN no texto que não é potência, para a tela poder recusar', () => {
    expect(parseRxInput('abc')).toBeNaN()
  })
})

describe('formatRx', () => {
  it('mostra a potência com vírgula, como o técnico digita', () => {
    expect(formatRx(-26.4)).toBe('-26,40')
    expect(formatRx(null)).toBe('')
  })
})

describe('buildMedicaoDrafts', () => {
  it('lista todos os clientes da PON, pior potência primeiro', () => {
    const drafts = buildMedicaoDrafts([
      row({ codigo: 'A', cliente: 'Boa', rx: -21 }),
      row({ codigo: 'B', cliente: 'Pior', rx: -33 }),
      row({ codigo: 'C', cliente: 'Sem leitura', rx: null }),
    ], [])

    expect(drafts.map(item => item.cliente)).toEqual(['Pior', 'Boa', 'Sem leitura'])
    expect(drafts.every(item => item.noCsv === false)).toBe(true)
    expect(drafts[0].valor).toBe('')
  })

  it('preenche o formulário com a medição já salva e congela o RX de antes', () => {
    const [draft] = buildMedicaoDrafts(
      [row({ rx: -18 })],
      [medicao({ rx_antes: -29.5, rx_depois: -22.3, observacao: 'Conector trocado' })],
    )

    expect(draft.rx_antes).toBe(-29.5)
    expect(draft.rx_depois).toBe(-22.3)
    expect(draft.valor).toBe('-22,30')
    expect(draft.observacao).toBe('Conector trocado')
    expect(draft.nivelAntes).toBe('Crítico')
  })

  it('mantém editável o cliente que sumiu do CSV atual', () => {
    const drafts = buildMedicaoDrafts([], [medicao({ onu_key: 'SUMIU', cliente: 'Fantasma' })])

    expect(drafts).toHaveLength(1)
    expect(drafts[0].noCsv).toBe(true)
    expect(drafts[0].cliente).toBe('Fantasma')
  })

  it('funciona sem CSV carregado: a lista salva basta para editar depois', () => {
    expect(buildMedicaoDrafts([], [medicao(), medicao({ onu_key: 'B' })])).toHaveLength(2)
  })
})

describe('buildMedicaoDrafts — identidade repetida', () => {
  it('separa homônimos sem serial em vez de colidir na mesma chave', () => {
    const drafts = buildMedicaoDrafts([
      row({ serial: '', onu: '', codigo: '', cliente: 'JOSE DA SILVA', rx: -29 }),
      row({ serial: '', onu: '', codigo: '', cliente: 'JOSE DA SILVA', rx: -31 }),
    ], [])

    // Chave repetida quebrava a lista do React e estourava o UNIQUE do banco.
    expect(new Set(drafts.map(item => item.onu_key)).size).toBe(2)
    expect(drafts.every(item => item.onu_key)).toBe(true)
  })

  it('dá chave ao cliente que veio sem nenhum identificador no CSV', () => {
    const [draft] = buildMedicaoDrafts([row({ serial: '', onu: '', codigo: '', cliente: '' })], [])

    // Sem chave o back descartava a linha em silêncio e a medição sumia.
    expect(draft.onu_key).toBeTruthy()
  })

  it('mantém a chave estável para reencontrar a medição já salva', () => {
    const csv = [row({ serial: '', onu: '', codigo: '', cliente: 'JOSE DA SILVA', rx: -29 }),
      row({ serial: '', onu: '', codigo: '', cliente: 'JOSE DA SILVA', rx: -31 })]
    const chaves = buildMedicaoDrafts(csv, []).map(item => item.onu_key)
    const salvos = chaves.map((onu_key, index) => medicao({ onu_key, rx_depois: -20 - index }))

    const drafts = buildMedicaoDrafts(csv, salvos)
    expect(drafts).toHaveLength(2)
    expect(drafts.every(item => item.noCsv === false)).toBe(true)
    expect(drafts.every(item => item.rx_depois != null)).toBe(true)
  })
})

describe('buildMedicaoDrafts — troca de ONU', () => {
  it('segue o mesmo assinante quando o serial muda em campo', () => {
    // Trocar a ONU e tratativa de rotina e muda o serial. Com o codigo na chave,
    // o assinante continua sendo o mesmo registro — sem heuristica no meio.
    const drafts = buildMedicaoDrafts(
      [row({ serial: 'NOVO999', codigo: '12345', cliente: 'Cliente A', rx: -21 })],
      [medicao({ rx_antes: -29.5, rx_depois: -21.4 })],
    )

    expect(drafts).toHaveLength(1)
    expect(drafts[0].noCsv).toBe(false)
    expect(drafts[0].onu_key).toBe('12345')
    expect(drafts[0].serial).toBe('NOVO999')
    expect(drafts[0].rx_antes).toBe(-29.5)
    expect(drafts[0].rx_depois).toBe(-21.4)
  })

  it('mantém homônimos sem código separados, mesmo trocando a ONU dos dois', () => {
    const csv = [row({ serial: 'NOVO1', codigo: '', cliente: 'JOSE DA SILVA', rx: -21 }),
      row({ serial: 'NOVO2', codigo: '', cliente: 'JOSE DA SILVA', rx: -22 })]

    expect(new Set(buildMedicaoDrafts(csv, []).map(item => item.onu_key)).size).toBe(2)
  })
})

describe('buildMedicaoDrafts — RX de antes congelado', () => {
  it('não adota a leitura de hoje como "antes" de quem foi tratado sem leitura', () => {
    const [draft] = buildMedicaoDrafts([row({ rx: -18 })], [medicao({ rx_antes: null, rx_depois: -18 })])

    // Pegar o RX do CSV atual poria uma leitura pós-tratativa no lugar do "antes",
    // e o delta passaria a comparar depois contra depois.
    expect(draft.rx_antes).toBeNull()
    expect(draft.nivelAntes).toBe('—')
  })
})

describe('medicoesResumo', () => {
  it('conta o que falta medir sem tratar em branco como erro', () => {
    const drafts = buildMedicaoDrafts(
      [row({ codigo: 'A', rx: -29 }), row({ codigo: 'B', rx: -30 }), row({ codigo: 'C', rx: -28 })],
      [
        medicao({ onu_key: 'A', rx_antes: -29, rx_depois: -22 }),
        medicao({ onu_key: 'B', rx_antes: -30, rx_depois: -31 }),
      ],
    )

    expect(medicoesResumo(drafts)).toEqual({ total: 3, preenchidas: 2, pendentes: 1, normalizadas: 1 })
  })
})

describe('medicoesResumo — valor inválido', () => {
  it('não conta como medido o que a tela recusa salvar', () => {
    const [draft] = buildMedicaoDrafts([row()], [])
    const resumo = medicoesResumo([{ ...draft, valor: '25' }])

    // O cabeçalho dizia "1 de 1 medidas" enquanto o rodapé acusava valor inválido.
    expect(resumo.preenchidas).toBe(0)
    expect(resumo.pendentes).toBe(1)
  })
})

describe('draftsToMedicoes', () => {
  it('envia o cadastro completo, com as pendentes em branco', () => {
    const drafts = buildMedicaoDrafts([row({ codigo: 'A', cliente: 'Cliente A', rx: -29 }), row({ codigo: 'B', cliente: 'Cliente B', rx: -30 })], [])
    const editado = drafts.map(item => item.onu_key === 'A' ? { ...item, valor: '-22,5', observacao: 'Splitter limpo' } : item)

    expect(draftsToMedicoes(editado)).toEqual([
      { onu_key: 'B', cliente: 'Cliente B', onu: '7', serial: 'ABC123', rx_antes: -30, rx_depois: null, observacao: '' },
      { onu_key: 'A', cliente: 'Cliente A', onu: '7', serial: 'ABC123', rx_antes: -29, rx_depois: -22.5, observacao: 'Splitter limpo' },
    ])
  })

  it('ignora texto inválido no lugar da potência em vez de gravar NaN', () => {
    const [draft] = buildMedicaoDrafts([row()], [])
    expect(draftsToMedicoes([{ ...draft, valor: 'abc' }])[0].rx_depois).toBeNull()
  })
})
