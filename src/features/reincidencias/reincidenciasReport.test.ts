import { describe, expect, it } from 'vitest'
import type { ClienteBase, ClienteReincidente } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'
import { buildBairroComparativo, buildBairroSummary, explicarDiagnostico, formatarDelta, periodoAnterior, buildIntervalDistribution, buildReincidenciaPairs, buildTeamRecurrenceRanking, filterReincidentes, getOSObservation, mergeOSObservations } from './reincidenciasReport'

const row = (numos: string, equipe: string, fornecedor: OSRow['_fornecedor'], data: string, obs = '') => ({
  numos, nomedaequipe: equipe, _fornecedor: fornecedor, dataexecucao: data, databaixa: '', obs,
  nomecliente: 'Cliente A', nomedacidade: 'Taubaté', servico: 'Manutenção', tiposervico: 'Manutenção',
} as OSRow)

const cliente = (rows: OSRow[]): ClienteReincidente => ({
  chave: '1', cliente: 'Cliente A', cidade: 'Taubaté', bairro: 'Centro', visitas: rows.length,
  intervaloMedio: 5, diasDesdeUltima: 1, rows,
})

describe('relatório de reincidências', () => {
  it('filtra terceira e equipe sem perder o histórico completo do cliente selecionado', () => {
    const a = cliente([row('1', 'INST F08', 'WES', '01/08/2026'), row('2', 'INST F11', 'WES', '05/08/2026')])
    const b = { ...cliente([row('3', 'INST F12', 'THM', '02/08/2026'), row('4', 'INST F12', 'THM', '06/08/2026')]), chave: '2' }
    expect(filterReincidentes([a, b], { fornecedor: 'WES', equipe: '', cidade: '' })).toEqual([a])
    expect(filterReincidentes([a, b], { fornecedor: '', equipe: 'INST F12', cidade: '' })).toEqual([b])
  })

  it('filtra por cidade sem perder o histórico completo do cliente selecionado', () => {
    const a = cliente([row('1', 'INST F08', 'WES', '01/08/2026'), row('2', 'INST F11', 'WES', '05/08/2026')])
    const b = {
      ...cliente([
        { ...row('3', 'INST F12', 'THM', '02/08/2026'), nomedacidade: 'Pindamonhangaba' } as OSRow,
        { ...row('4', 'INST F12', 'THM', '06/08/2026'), nomedacidade: 'Pindamonhangaba' } as OSRow,
      ]),
      chave: '2',
    }
    expect(filterReincidentes([a, b], { fornecedor: '', equipe: '', cidade: 'Taubaté' })).toEqual([a])
    expect(filterReincidentes([a, b], { fornecedor: '', equipe: '', cidade: 'Pindamonhangaba' })).toEqual([b])
  })

  it('monta pares consecutivos em ordem cronológica para a IA', () => {
    const pairs = buildReincidenciaPairs([cliente([
      row('3', 'INST F11', 'WES', '10/08/2026', 'terceira visita'),
      row('1', 'INST F08', 'WES', '01/08/2026', 'primeira visita'),
      row('2', 'INST F08', 'WES', '06/08/2026', 'segunda visita'),
    ])])
    expect(pairs.map(p => [p.numos_orig, p.numos_rev, p.dias_entre])).toEqual([
      ['1', '2', 5], ['2', '3', 4],
    ])
  })

  it('atribui a reincidência à equipe da OS anterior e calcula a taxa sobre sua base', () => {
    const cases = [
      cliente([row('1', 'INST F08', 'WES', '01/08/2026'), row('2', 'INST F11', 'WES', '05/08/2026')]),
      { ...cliente([row('3', 'INST F08', 'WES', '02/08/2026'), row('4', 'INST F12', 'THM', '08/08/2026')]), chave: '2' },
    ]
    const base = [
      ...cases.flatMap(c => c.rows),
      { ...row('5', 'INST F08', 'WES', '03/08/2026'), codigocliente: 'sem-retorno', _tipo: 'MANUTENCAO', descsituacao: 'Concluída' },
    ] as OSRow[]
    cases.flatMap(c => c.rows).forEach((r, i) => Object.assign(r, { codigocliente: i < 2 ? '1' : '2', _tipo: 'MANUTENCAO', descsituacao: 'Concluída' }))

    expect(buildTeamRecurrenceRanking(cases, base, new Date(2026, 7, 20))[0]).toMatchObject({
      equipe: 'INST F08', reincidentes: 2, revisitas: 2, base: 3, taxa: 67,
    })
  })

  it('usa a base de INSTALACAO em vez de MANUTENCAO quando tipoBase pede', () => {
    const clienteInst = cliente([row('1', 'INST F08', 'WES', '01/08/2026'), row('2', 'INST F11', 'WES', '05/08/2026')])
    clienteInst.rows.forEach(r => Object.assign(r, { codigocliente: '1', _tipo: 'INSTALACAO', descsituacao: 'Concluída' }))
    const base = [
      ...clienteInst.rows,
      // Manutenção não deve contar na base quando tipoBase='INSTALACAO'.
      { ...row('9', 'INST F08', 'WES', '01/08/2026'), codigocliente: '9', _tipo: 'MANUTENCAO', descsituacao: 'Concluída' },
    ] as OSRow[]

    const ranking = buildTeamRecurrenceRanking([clienteInst], base, new Date(2026, 7, 20), null, 'INSTALACAO')
    expect(ranking[0]).toMatchObject({ equipe: 'INST F08', base: 1 })
  })

  it('distribui o intervalo entre visitas em faixas operacionais', () => {
    expect(buildIntervalDistribution([
      { dias_entre: 2 }, { dias_entre: 7 }, { dias_entre: 12 }, { dias_entre: 25 }, { dias_entre: 45 },
    ] as ReturnType<typeof buildReincidenciaPairs>)).toEqual([
      { faixa: '0–3d', total: 1 }, { faixa: '4–7d', total: 1 }, { faixa: '8–15d', total: 1 },
      { faixa: '16–30d', total: 1 }, { faixa: '31–60d', total: 1 },
    ])
  })

  it('usa todos os campos conhecidos de observação com fallback objetivo', () => {
    expect(getOSObservation({ observacoes: 'texto principal', obs: 'legado' } as unknown as OSRow)).toBe('texto principal')
    expect(getOSObservation({ observacaocritica: 'texto crítico' } as unknown as OSRow)).toBe('texto crítico')
    expect(getOSObservation({ obs: '' } as unknown as OSRow)).toBe('Sem observação registrada')
  })

  it('reduz a observação estruturada ao motivo da abertura e ao que foi feito', () => {
    const structured = `entra em contato informando que está sem sinal

( ) CNC

Luzes e como estão (piscando, fixa ou apagada):LOS/REG piscando vermelho

Procedimentos:
(X) Verificado os cabos
(X) Equipamentos reiniciados, MAC Limpo

Melhor número para contato:12) 98197-4638
Protocolo: 99580196-71

Informações da Execução:
Obs:TROCA DE ONU
Cliente\\Responsável: WELLINGTON
RG: .
Nome Executante: T-MAYKON RODRIGO

LOCALIZAÇÃO
Latitude Inicio: -22.9589369`

    expect(getOSObservation({ observacoes: structured } as unknown as OSRow)).toBe(
      'Motivo da abertura: entra em contato informando que está sem sinal\nO que foi feito: TROCA DE ONU',
    )
  })

  it('mantém observações livres que não seguem o formulário estruturado', () => {
    expect(getOSObservation({ observacoes: 'Cliente ausente; retorno agendado.' } as unknown as OSRow))
      .toBe('Cliente ausente; retorno agendado.')
  })

  it('incorpora as observações pesadas retornadas pelo endpoint em lote', () => {
    const original = cliente([row('1', 'INST F08', 'WES', '01/08/2026')])
    const [merged] = mergeOSObservations([original], { '1': { observacoes: 'Executado em campo', observacaocritica: 'Atenção' } })
    expect(getOSObservation(merged.rows[0])).toBe('Executado em campo')
    expect(original.rows[0].observacoes).toBeUndefined()
  })
})

describe('buildBairroSummary', () => {
  const cli = (chave: string, cidade: string, bairro: string, nOS: number) => ({
    chave, cliente: `Cliente ${chave}`, cidade, bairro, visitas: nOS, intervaloMedio: 5, diasDesdeUltima: 3,
    rows: Array.from({ length: nOS }, (_, i) => ({ numos: `${chave}${i}` })),
  }) as unknown as ClienteReincidente

  it('agrupa por cidade + bairro e ordena por clientes', () => {
    const r = buildBairroSummary([
      cli('A', 'Taubaté', 'CENTRO', 2), cli('B', 'Taubaté', 'CENTRO', 3),
      cli('C', 'Taubaté', 'JARDIM', 2), cli('D', 'Pindamonhangaba', 'CENTRO', 2),
    ])
    expect(r.map(b => [b.cidade, b.bairro, b.nClientes])).toEqual([
      ['Taubaté', 'CENTRO', 2], ['Pindamonhangaba', 'CENTRO', 1], ['Taubaté', 'JARDIM', 1],
    ])
  })

  it('conta revisitas (OS após a primeira) e OS envolvidas', () => {
    const [b] = buildBairroSummary([cli('A', 'Taubaté', 'CENTRO', 2), cli('B', 'Taubaté', 'CENTRO', 3)])
    expect(b.nRevisitas).toBe(3)
    expect(b.nOS).toBe(5)
    expect(b.pct).toBe(100)
  })

  it('só põe a cidade no rótulo quando o nome do bairro se repete', () => {
    const r = buildBairroSummary([cli('A', 'Taubaté', 'CENTRO', 2), cli('D', 'Pindamonhangaba', 'CENTRO', 2), cli('C', 'Taubaté', 'JARDIM', 2)])
    expect(r.map(b => b.label).sort()).toEqual(['CENTRO · Pinda', 'CENTRO · Taubaté', 'JARDIM'])
  })

  it('a soma das OS dos bairros fecha com o total de OS envolvidas', () => {
    const todos = [cli('A', 'Taubaté', 'CENTRO', 2), cli('B', 'Taubaté', 'CENTRO', 3), cli('C', 'Taubaté', 'JARDIM', 5), cli('D', 'Pindamonhangaba', 'CENTRO', 2)]
    const r = buildBairroSummary(todos)
    expect(r.reduce((sum, b) => sum + b.nOS, 0)).toBe(todos.reduce((sum, c) => sum + c.rows.length, 0))
    expect(r.reduce((sum, b) => sum + b.pct, 0)).toBeGreaterThanOrEqual(99)
  })

  it('ordena por OS: um bairro com poucos clientes e muitas OS passa na frente', () => {
    const r = buildBairroSummary([cli('A', 'Taubaté', 'CENTRO', 2), cli('B', 'Taubaté', 'CENTRO', 2), cli('C', 'Taubaté', 'JARDIM', 6)])
    expect(r.map(b => [b.bairro, b.nOS, b.nClientes])).toEqual([['JARDIM', 6, 1], ['CENTRO', 4, 2]])
  })

  it('junta o mesmo bairro escrito com e sem acento e usa a grafia com acento', () => {
    const r = buildBairroSummary([
      cli('A', 'Caçapava', 'VITORIA VALE', 2), cli('B', 'Caçapava', 'VITÓRIA VALE', 2), cli('C', 'Caçapava', 'VITORIA VALE', 2),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].nClientes).toBe(3)
    expect(r[0].nOS).toBe(6)
    expect(r[0].bairro).toBe('VITORIA VALE')  // a grafia mais usada
  })

  it('empate de grafia: fica a que tem acento', () => {
    const r = buildBairroSummary([cli('A', 'Caçapava', 'VITORIA VALE', 2), cli('B', 'Caçapava', 'VITÓRIA VALE', 2)])
    expect(r).toHaveLength(1)
    expect(r[0].bairro).toBe('VITÓRIA VALE')
  })

  it('ignora caixa, pontuação e espaços sobrando', () => {
    const r = buildBairroSummary([cli('A', 'Taubaté', 'Jardim  das-Flores', 2), cli('B', 'Taubaté', 'JARDIM DAS FLORES ', 2)])
    expect(r).toHaveLength(1)
  })

  it('cidade com e sem acento é a mesma cidade', () => {
    const r = buildBairroSummary([cli('A', 'Caçapava', 'CENTRO', 2), cli('B', 'CACAPAVA', 'CENTRO', 2)])
    expect(r).toHaveLength(1)
  })

  it('junta o nome cortado em 20 caracteres pelo ERP ao bairro completo da mesma cidade', () => {
    const r = buildBairroSummary([
      cli('A', 'Caçapava', 'RESIDENCIAL ESPERANC', 2), cli('B', 'Caçapava', 'RESIDENCIAL ESPERANCA', 2),
      cli('C', 'Taubaté', 'RESIDENCIAL ESPERANC', 2),
    ])
    expect(r.map(b => [b.cidade, b.bairro, b.nClientes])).toEqual([['Caçapava', 'RESIDENCIAL ESPERANCA', 2], ['Taubaté', 'RESIDENCIAL ESPERANC', 1]])
  })

  it('não junta bairros diferentes só porque o nome começa igual (sem corte de 20)', () => {
    const r = buildBairroSummary([cli('A', 'Taubaté', 'JARDIM AMERICA', 2), cli('B', 'Taubaté', 'JARDIM AMERICA II', 2)])
    expect(r).toHaveLength(2)
  })

  it('cliente sem bairro vai para "Sem bairro"', () => {
    expect(buildBairroSummary([cli('A', 'Taubaté', '', 2)])[0].label).toBe('Sem bairro')
  })
})

describe('buildBairroSummary — taxa, período anterior e diagnóstico', () => {
  const linha = (numos: string, equipe: string, data: string) => ({ numos, nomedaequipe: `03- VAL - INSTALACAO ${equipe}`, dataexecucao: data, databaixa: data }) as unknown as OSRow
  const comEquipes = (chave: string, bairro: string, equipes: string[]) => ({
    chave, cliente: `Cliente ${chave}`, cidade: 'Taubaté', bairro, visitas: equipes.length, intervaloMedio: 5, diasDesdeUltima: 1,
    rows: equipes.map((e, i) => linha(`${chave}${i}`, e, `0${i + 1}/09/2026`)),
  }) as unknown as ClienteReincidente
  const atendido = (chave: string, bairro: string) => ({ chave, cliente: chave, cidade: 'Taubaté', bairro, rows: [linha(chave, 'F11', '01/09/2026')] }) as unknown as ClienteBase

  it('taxa = reincidentes ÷ atendidos no bairro, com uma casa', () => {
    const base = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(k => atendido(k, 'CENTRO'))
    const [b] = buildBairroSummary([comEquipes('A', 'CENTRO', ['F11', 'F11'])], { base })
    expect(b.nBase).toBe(7)
    expect(b.taxa).toBe(14.3)
  })

  it('a base nunca fica abaixo dos reincidentes', () => {
    const [b] = buildBairroSummary([comEquipes('A', 'CENTRO', ['F11', 'F11']), comEquipes('B', 'CENTRO', ['F11', 'F11'])], { base: [atendido('A', 'CENTRO')] })
    expect(b.nBase).toBe(2)
    expect(b.taxa).toBe(100)
  })

  it('sem base não há taxa', () => {
    const [b] = buildBairroSummary([comEquipes('A', 'CENTRO', ['F11', 'F11'])])
    expect(b.taxa).toBeNull()
    expect(b.nBase).toBe(0)
  })

  it('variação contra o período anterior no mesmo bairro (grafia diferente também casa)', () => {
    const atual = [comEquipes('A', 'VITÓRIA VALE', ['F11', 'F11']), comEquipes('B', 'VITÓRIA VALE', ['F11', 'F11'])]
    const anterior = [comEquipes('C', 'VITORIA VALE', ['F11', 'F11'])]
    const [b] = buildBairroSummary(atual, { anterior })
    expect(b.nOS).toBe(4)
    expect(b.nOSAnterior).toBe(2)
    expect(b.delta).toBe(2)
  })

  it('bairro novo no período: o anterior é zero e a variação é o total', () => {
    const [b] = buildBairroSummary([comEquipes('A', 'NOVO', ['F11', 'F11'])], { anterior: [comEquipes('C', 'OUTRO', ['F11', 'F11'])] })
    expect(b.nOSAnterior).toBe(0)
    expect(b.delta).toBe(2)
  })

  it('sem período anterior, não há variação', () => {
    expect(buildBairroSummary([comEquipes('A', 'CENTRO', ['F11', 'F11'])])[0].delta).toBeNull()
  })

  it('execução: uma equipe responde pela maioria das visitas de origem', () => {
    const [b] = buildBairroSummary([
      comEquipes('A', 'CENTRO', ['F11', 'F11', 'F11']), comEquipes('B', 'CENTRO', ['F11', 'F11', 'F36']),
    ])
    expect(b.diagnostico).toBe('execucao')
    expect(b.equipeDominante).toBe('INST F11')
    expect(explicarDiagnostico(b)).toContain('INST F11')
  })

  it('rede: várias equipes, nenhuma dominante, em vários clientes', () => {
    const [b] = buildBairroSummary([
      comEquipes('A', 'CENTRO', ['F11', 'F36', 'F11']), comEquipes('B', 'CENTRO', ['F12', 'F13']), comEquipes('C', 'CENTRO', ['F14', 'F45']),
    ])
    expect(b.diagnostico).toBe('rede')
    expect(b.equipes.length).toBeGreaterThanOrEqual(3)
  })

  it('poucos casos: menos de 4 revisitas não dá para diagnosticar', () => {
    const [b] = buildBairroSummary([comEquipes('A', 'CENTRO', ['F11', 'F11', 'F11'])])
    expect(b.diagnostico).toBe('poucos')
  })

  it('formata a variação com seta e sinal', () => {
    expect(formatarDelta(5)).toBe('▲ +5')
    expect(formatarDelta(-3)).toBe('▼ −3')
    expect(formatarDelta(0)).toBe('= 0')
    expect(formatarDelta(null)).toBe('')
  })
})

describe('periodoAnterior', () => {
  it('mês inteiro vira o mês civil anterior', () => {
    const { from, to } = periodoAnterior({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) })
    expect(from).toEqual(new Date(2026, 7, 1))
    expect(to).toEqual(new Date(2026, 7, 31))
  })

  it('mês de março volta para fevereiro com o último dia certo', () => {
    const { from, to } = periodoAnterior({ from: new Date(2026, 2, 1), to: new Date(2026, 2, 31) })
    expect(from).toEqual(new Date(2026, 1, 1))
    expect(to).toEqual(new Date(2026, 1, 28))
  })

  it('janela qualquer vira a mesma quantidade de dias logo antes', () => {
    const { from, to } = periodoAnterior({ from: new Date(2026, 8, 10), to: new Date(2026, 8, 16) })
    expect(from).toEqual(new Date(2026, 8, 3))
    expect(to).toEqual(new Date(2026, 8, 9))
  })
})

describe('buildBairroComparativo', () => {
  const lin = (numos: string) => ({ numos, nomedaequipe: '03- VAL - INSTALACAO F11', dataexecucao: '10/09/2026', databaixa: '10/09/2026' }) as unknown as OSRow
  const c = (chave: string, bairro: string, n: number, cidade = 'Caçapava') => ({
    chave, cliente: `Cliente ${chave}`, cidade, bairro, visitas: n, intervaloMedio: 5, diasDesdeUltima: 1,
    rows: Array.from({ length: n }, (_, i) => lin(`${chave}${i}`)),
  }) as unknown as ClienteReincidente
  const at = (chave: string, bairro: string) => ({ chave, cliente: chave, cidade: 'Caçapava', bairro, rows: [lin(chave)] }) as unknown as ClienteBase

  it('uma linha por bairro e uma coluna por mês, com o mesmo bairro na mesma linha', () => {
    const r = buildBairroComparativo([
      { id: '2026-08', label: 'AGO/26', clientes: [c('A', 'VITORIA VALE', 2), c('B', 'CENTRO', 2)] },
      { id: '2026-09', label: 'SET/26', clientes: [c('C', 'VITÓRIA VALE', 3), c('D', 'VITORIA VALE', 2)] },
      { id: '2026-10', label: 'OUT/26', clientes: [c('E', 'CENTRO', 2)] },
    ])
    expect(r.periodos.map(p => p.label)).toEqual(['AGO/26', 'SET/26', 'OUT/26'])
    expect(r.linhas.map(l => l.bairro)).toEqual(['VITORIA VALE', 'CENTRO'])
    const vv = r.linhas[0]
    expect([vv.meses['2026-08'].nOS, vv.meses['2026-09'].nOS, vv.meses['2026-10'].nOS]).toEqual([2, 5, 0])
    expect(vv.totalOS).toBe(7)
    expect(vv.variacao).toBe(-2)
  })

  it('mês sem revisita no bairro fica zerado, nunca ausente', () => {
    const r = buildBairroComparativo([
      { id: '2026-08', label: 'AGO/26', clientes: [c('A', 'CENTRO', 2)] },
      { id: '2026-09', label: 'SET/26', clientes: [c('B', 'OUTRO', 2)] },
    ])
    const centro = r.linhas.find(l => l.bairro === 'CENTRO')!
    expect(centro.meses['2026-09']).toEqual({ nOS: 0, nClientes: 0, nBase: 0, taxa: null })
  })

  it('os totais de cada mês fecham com o total de OS do mês', () => {
    const agosto = [c('A', 'CENTRO', 2), c('B', 'JARDIM', 3), c('C', 'VILA', 2)]
    const setembro = [c('D', 'CENTRO', 4)]
    const r = buildBairroComparativo([{ id: '2026-08', label: 'AGO/26', clientes: agosto }, { id: '2026-09', label: 'SET/26', clientes: setembro }])
    expect(r.totais['2026-08'].nOS).toBe(7)
    expect(r.linhas.reduce((s, l) => s + l.meses['2026-08'].nOS, 0)).toBe(7)
    expect(r.linhas.reduce((s, l) => s + l.meses['2026-09'].nOS, 0)).toBe(r.totais['2026-09'].nOS)
  })

  it('taxa por mês usa a base daquele mês', () => {
    const r = buildBairroComparativo([
      { id: '2026-08', label: 'AGO/26', clientes: [c('A', 'CENTRO', 2)], base: [at('A', 'CENTRO'), at('X', 'CENTRO'), at('Y', 'CENTRO'), at('Z', 'CENTRO')] },
      { id: '2026-09', label: 'SET/26', clientes: [c('B', 'CENTRO', 2)], base: [at('B', 'CENTRO'), at('W', 'CENTRO')] },
    ])
    expect(r.linhas[0].meses['2026-08'].taxa).toBe(25)
    expect(r.linhas[0].meses['2026-09'].taxa).toBe(50)
  })

  it('ordena pelo total de OS dos meses selecionados', () => {
    const r = buildBairroComparativo([
      { id: '2026-08', label: 'AGO/26', clientes: [c('A', 'PEQUENO', 2), c('B', 'GRANDE', 2)] },
      { id: '2026-09', label: 'SET/26', clientes: [c('C', 'GRANDE', 5)] },
    ])
    expect(r.linhas.map(l => l.bairro)).toEqual(['GRANDE', 'PEQUENO'])
  })

  it('um mês só não tem variação', () => {
    const r = buildBairroComparativo([{ id: '2026-09', label: 'SET/26', clientes: [c('A', 'CENTRO', 2)] }])
    expect(r.linhas[0].variacao).toBeNull()
  })

  it('bairros de cidades diferentes com o mesmo nome continuam em linhas separadas', () => {
    const r = buildBairroComparativo([{ id: '2026-09', label: 'SET/26', clientes: [c('A', 'CENTRO', 2, 'Taubaté'), c('B', 'CENTRO', 2, 'Caçapava')] }])
    expect(r.linhas).toHaveLength(2)
    expect(r.linhas.map(l => l.label).sort()).toEqual(['CENTRO · Caçapava', 'CENTRO · Taubaté'])
  })

  it('junta o nome cortado em 20 caracteres de um mês ao nome completo de outro', () => {
    const r = buildBairroComparativo([
      { id: '2026-08', label: 'AGO/26', clientes: [c('A', 'RESIDENCIAL ESPERANC', 2)] },
      { id: '2026-09', label: 'SET/26', clientes: [c('B', 'RESIDENCIAL ESPERANCA', 2)] },
    ])
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0].bairro).toBe('RESIDENCIAL ESPERANCA')
  })
})
