import { describe, expect, it } from 'vitest'
import type { ClienteReincidente } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'
import {
  canonicalizarBairro, escolherNomeBairro, expandirAbreviacoes, levenshtein, mesmoNomeComUmaLetraErrada, terminaEmArtigo, todasCortadasNoLimite,
} from './bairroNomes'
import { buildBairroSummary } from './reincidenciasReport'

// Todos os pares abaixo vêm da base real do ERP (Taubaté, Pinda, Caçapava, Tremembé, SJC).
const mesmo = (a: string, b: string) => expect(canonicalizarBairro(a)).toBe(canonicalizarBairro(b))
const diferente = (a: string, b: string) => expect(canonicalizarBairro(a)).not.toBe(canonicalizarBairro(b))

describe('canonicalizarBairro — o que é o MESMO bairro', () => {
  it('acento, caixa, pontuação e espaços sobrando', () => {
    mesmo('VITÓRIA VALE', 'vitoria vale')
    mesmo('PARQUE  DO MUSEU', 'PARQUE DO MUSEU,')
    mesmo('Residencial União', 'RESIDENCIAL UNIAO')
    mesmo('CONJ.HAB.HERCULES AU', 'CONJ HAB HERCULES AU')
  })

  it('abreviações da base: JD, VL, PQ, RES, CHAC, LOT, CONJ, COND, STA, SRA…', () => {
    mesmo('JD AMALIA', 'JARDIM AMÁLIA')
    mesmo('VL SAO BENEDITO', 'VILA SÃO BENEDITO')
    mesmo('PQ DO MUSEU', 'PARQUE DO MUSEU')
    mesmo('RES MOMBACA', 'RESIDENCIAL MOMBAÇA')
    mesmo('CHAC SAO FELIX', 'CHACARA SÃO FELIX')
    mesmo('LOT TERRA NOVA', 'LOTEAMENTO TERRA NOVA')
    mesmo('CONJ.HABITACIONAL', 'CONJUNTO HABITACIONAL')
    mesmo('ESPL STA HELENA', 'ESPLANADA SANTA HELENA')
    mesmo('NOSSA SRA DA GLORIA', 'NOSSA SENHORA DA GLORIA')
    mesmo('DIST IND UNA', 'DISTRITO INDUSTRIAL UNA')
  })

  it('artigo que a digitação põe ou tira', () => {
    mesmo('ALTO DA BORDA', 'ALTO DO BORDA')
    mesmo('VITORIA DO VALE', 'VITORIA VALE')
    mesmo('CHACARA DA GALEGA', 'CHACARA GALEGA')
    mesmo('DOS GUEDES', 'GUEDES')
  })

  it('algarismo romano ou arábico no fim', () => {
    mesmo('CONTINENTAL I', 'CONTINENTAL 1')
    mesmo('COMERCIARIOS II', 'COMERCIARIOS 2')
  })

  it('"S O" digitado com espaço é SÃO', () => {
    mesmo('VILA S O BENEDITO', 'VILA SAO BENEDITO')
  })

  it('letra repetida e S/Z se confundem na digitação', () => {
    mesmo('VILLA OLIMPIA', 'VILA OLIMPIA')
    mesmo('RESIDDENCIAL MARICA', 'RESIDENCIAL MARICA')
    mesmo('JARDIM OASSIS', 'JARDIM OASIS')
    mesmo('PARQUE SÃO LUIZ', 'PARQUE SAO LUIS')
    mesmo('JARDIM SANTA TEREZA', 'JARDIM SANTA TERESA')
  })

  it('espaço no meio da palavra', () => {
    expect(canonicalizarBairro('RES OURO VILLE').replace(/ /g, '')).toBe(canonicalizarBairro('RES OUROVILLE').replace(/ /g, ''))
  })
})

describe('canonicalizarBairro — o que é DIFERENTE e nunca pode ser unido', () => {
  it('seções com algarismo ou letra diferente', () => {
    diferente('CONTINENTAL I', 'CONTINENTAL II')
    diferente('COMERCIARIOS I', 'COMERCIARIOS II')
    diferente('VITORIA VALE II', 'VITORIA VALE III')
    diferente('PARQUE RESIDENCIAL M', 'PARQUE RESIDENCIAL N')
    diferente('PARQUE RESIDENCIAL A', 'PARQUE RESIDENCIAL E')
    diferente('RES ALTA VISTA I', 'RES ALTA VISTA II')
  })

  it('nome com e sem complemento: são lugares diferentes', () => {
    diferente('CONTINENTAL', 'CONTINENTAL I')
    diferente('CACAPAVA', 'CACAPAVA VELHA')
    diferente('JARDIM REGINA', 'JARDIM REGINA MOREIRA')
    diferente('VILA BELA', 'VILA BELA II')
    diferente('DISTRITO INDUSTRIAL UNA', 'DISTRITO INDUSTRIAL UNA I')
  })

  it('palavras curtas parecidas são nomes distintos', () => {
    diferente('VILA NOVA', 'VILA NOVO')
    diferente('VILA SAO JOAO', 'VILA SAO JOSE')
  })

  it('a letra E no fim é a seção, no meio é conjunção', () => {
    expect(canonicalizarBairro('PARQUE RESIDENCIAL E')).toBe('PARQUE RESIDENCIAL E')
    mesmo('LOT RES E COMERCIAL', 'LOT RES COMERCIAL')
  })
})

describe('erro de digitação (uma palavra com uma letra errada)', () => {
  it('une quando a palavra tem 5+ letras e o resto é igual', () => {
    expect(mesmoNomeComUmaLetraErrada('CAMPO ALEMAES', 'CAMPOS ALEMAES')).toBe(true)
    expect(mesmoNomeComUmaLetraErrada('CAMPOS ELISEOS', 'CAMPOS ELISIOS')).toBe(true)
    expect(mesmoNomeComUmaLetraErrada('GRANJA BELA VISTA', 'GRANJAS BELA VISTA')).toBe(true)
    expect(mesmoNomeComUmaLetraErrada('JARDIM MESQUITA', 'JARDIN MESQUITA')).toBe(true)
  })

  it('não une palavra curta, número ou duas palavras diferentes', () => {
    expect(mesmoNomeComUmaLetraErrada('VILA NOVA', 'VILA NOVO')).toBe(false)
    expect(mesmoNomeComUmaLetraErrada('CONTINENTAL 1', 'CONTINENTAL 2')).toBe(false)
    expect(mesmoNomeComUmaLetraErrada('JARDIM AMERICA', 'JARDIM EUROPA')).toBe(false)
    expect(mesmoNomeComUmaLetraErrada('VILA SAO JOAO', 'VILA SAO JOSE')).toBe(false)
    expect(mesmoNomeComUmaLetraErrada('JARDIM AMERICA', 'JARDIM AMERICA II')).toBe(false)
  })

  it('levenshtein', () => {
    expect(levenshtein('CASA', 'CASA')).toBe(0)
    expect(levenshtein('CASA', 'CASAS')).toBe(1)
    expect(levenshtein('CASA', 'COSA')).toBe(1)
    expect(levenshtein('CASA', 'CAMPO')).toBeGreaterThan(1)
  })
})

describe('nome exibido', () => {
  const v = (...pares: Array<[string, number]>) => new Map(pares)

  it('abreviação sai por extenso', () => {
    expect(expandirAbreviacoes('JD. AMÁLIA')).toBe('JARDIM AMÁLIA')
    expect(expandirAbreviacoes('RES SANTA LUCIA')).toBe('RESIDENCIAL SANTA LUCIA')
  })

  it('erro de digitação raro não vira o nome: vale o mais usado', () => {
    expect(escolherNomeBairro(v(['JD SONIA MARIA', 9], ['JARDIM SANIA MARIA', 1]))).toBe('JARDIM SONIA MARIA')
  })

  it('o nome cortado perde para o completo mesmo sendo mais usado', () => {
    expect(escolherNomeBairro(v(['JARDIM MARLENE MIRAN', 20], ['JD MARLENE MIRANDA', 2]))).toBe('JARDIM MARLENE MIRANDA')
    expect(escolherNomeBairro(v(['RESIDENCIAL ESPERANC', 104], ['RES ESPERANCA', 111]))).toBe('RESIDENCIAL ESPERANCA')
  })

  it('empate de grafia: a com acento', () => {
    expect(escolherNomeBairro(v(['VITORIA VALE', 1], ['VITÓRIA VALE', 1]))).toBe('VITÓRIA VALE')
  })

  it('detecta nome cortado e nome terminado em artigo', () => {
    expect(todasCortadasNoLimite(['RESIDENCIAL ESPERANC'])).toBe(true)
    expect(todasCortadasNoLimite(['CONJ HAB MILTON ALV'])).toBe(true)      // 19: também aparece na base
    expect(todasCortadasNoLimite(['CENTRO'])).toBe(false)
    expect(todasCortadasNoLimite(['RESIDENCIAL ESPERANC', 'RESIDENCIAL ESPERANCA'])).toBe(false)
    expect(terminaEmArtigo(['RESIDENCIAL VALE DAS'])).toBe(true)
    expect(terminaEmArtigo(['RESIDENCIAL VALE'])).toBe(false)
  })
})

// ─── No resumo por bairro ────────────────────────────────────────────────────
const lin = (numos: string) => ({ numos, nomedaequipe: '03- VAL - INSTALACAO F11', dataexecucao: '10/09/2026', databaixa: '10/09/2026' }) as unknown as OSRow
const c = (chave: string, bairro: string, cidade = 'Taubaté') => ({
  chave, cliente: chave, cidade, bairro, visitas: 2, intervaloMedio: 5, diasDesdeUltima: 1, rows: [lin(`${chave}a`), lin(`${chave}b`)],
}) as unknown as ClienteReincidente
const resumo = (...clientes: ClienteReincidente[]) => buildBairroSummary(clientes)

describe('buildBairroSummary com a base real de grafias', () => {
  it('JD, JARDIM e grafias com erro viram uma linha só, com todas as grafias listadas', () => {
    const r = resumo(c('A', 'JD SONIA MARIA'), c('B', 'JD SONIA MARIA'), c('C', 'JARDIM SANIA MARIA'), c('D', 'JARDIM SONIA MARIA'))
    expect(r).toHaveLength(1)
    expect(r[0].bairro).toBe('JARDIM SONIA MARIA')
    expect(r[0].nClientes).toBe(4)
    expect(r[0].variantes.sort()).toEqual(['JARDIM SANIA MARIA', 'JARDIM SONIA MARIA', 'JD SONIA MARIA'])
  })

  it('seções I e II do mesmo conjunto continuam separadas', () => {
    expect(resumo(c('A', 'CONTINENTAL I'), c('B', 'CONTINENTAL II'), c('C', 'CONTINENTAL')).map(b => b.bairro).sort()).toEqual(['CONTINENTAL', 'CONTINENTAL I', 'CONTINENTAL II'])
  })

  it('CONTINENTAL I e CONTINENTAL 1 são o mesmo', () => {
    expect(resumo(c('A', 'CONTINENTAL I'), c('B', 'CONTINENTAL 1'))).toHaveLength(1)
  })

  it('nome genérico cortado numa palavra inteira NÃO é grudado no único nome completo que aparece', () => {
    const r = resumo(c('A', 'CONJUNTO RESIDENCIAL'), c('B', 'CONJ RES ARARETAMA'))
    expect(r.map(b => b.bairro).sort()).toEqual(['CONJUNTO RESIDENCIAL', 'CONJUNTO RESIDENCIAL ARARETAMA'])
  })

  it('nome cortado no meio da palavra (17 a 20 caracteres) é unido ao completo', () => {
    expect(resumo(c('A', 'CONJ HAB MILTON ALV'), c('B', 'CONJ.HAB.MILTON ALVA'))).toHaveLength(1)
    expect(resumo(c('A', 'PORTAL DA MANTIQUEIR'), c('B', 'PORTAL MANTIQUEIRA'))).toHaveLength(1)
  })

  it('nome cortado num artigo é unido ao completo', () => {
    const r = resumo(c('A', 'RESIDENCIAL VALE DAS'), c('B', 'RES VALE DAS ACÁCIAS'))
    expect(r).toHaveLength(1)
    expect(r[0].bairro).toBe('RESIDENCIAL VALE DAS ACÁCIAS')
  })

  it('com dois candidatos completos o nome cortado fica sozinho (ambíguo)', () => {
    // "PARQUE RESIDENCIAL N" pode ser NOVA ou NORTE: sem saber qual, não une a nenhum.
    const r = resumo(c('A', 'PARQUE RESIDENCIAL N'), c('B', 'PARQUE RESIDENCIAL NOVA'), c('C', 'PARQUE RESIDENCIAL NORTE'))
    expect(r).toHaveLength(3)
    expect(r.map(b => b.bairro)).toContain('PARQUE RESIDENCIAL N')
  })

  it('a unção só vale dentro da mesma cidade', () => {
    expect(resumo(c('A', 'JD AMALIA', 'Taubaté'), c('B', 'JARDIM AMALIA', 'Caçapava'))).toHaveLength(2)
  })

  it('o nome cortado em 19 caracteres também é reconhecido, mesmo fora do limite de 20', () => {
    const r = resumo(c('A', 'CONJ HAB MILTON ALV'), c('B', 'CONJUNTO HABITACIONAL MILTON ALVARENGA'))
    expect(r).toHaveLength(1)
  })
})
