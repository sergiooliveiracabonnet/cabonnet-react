import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { OSRow } from '../../lib/types'
import { calcStats, isInstacable, isTHM, isWES } from './fechamentoUtils'

function row(situation: string, team = 'INST F01'): OSRow {
  return {
    numos: String(Math.random()),
    descsituacao: situation,
    nomedaequipe: team,
    nomedacidade: 'TAUBATÉ',
    tiposervico: 'INSTALACAO',
  } as OSRow
}

// As abas do fechamento têm a própria cópia do mapa de operadoras. Ela já ficou
// para trás uma vez (mantinha F27/F39, aposentadas, e ignorava F46/F47/F23, que
// trabalham) e o fechamento saiu sem essas frentes. Em vez de repetir a lista
// aqui — o que só criaria uma quinta cópia para derivar —, o teste lê o
// _OPERADORA_GRUPOS do backend, que é a fonte da verdade.
function gruposDoBackend(): Record<string, string[]> {
  const py = readFileSync('cabonnet/config.py', 'utf8')
  const bloco = py.slice(py.indexOf('_OPERADORA_GRUPOS'), py.indexOf('# ── Revisitas'))
  const grupos: Record<string, string[]> = {}
  for (const m of bloco.matchAll(/"(\w+)":\s*\[([^\]]+)\]/g)) {
    grupos[m[1]] = [...m[2].matchAll(/F\d+/g)].map(f => f[0])
  }
  return grupos
}

describe('classificação por operadora', () => {
  const grupos = gruposDoBackend()
  const osDaFrente = (frente: string) => row('Concluída', `INSTALACAO ${frente}`)

  it('encontrou os três grupos no config.py do backend', () => {
    expect(Object.keys(grupos).sort()).toEqual(['INSTACABLE', 'THM', 'WES'])
  })

  it('classifica cada frente do backend na operadora dela', () => {
    for (const frente of grupos.INSTACABLE) expect(isInstacable(osDaFrente(frente)), frente).toBe(true)
    for (const frente of grupos.WES)        expect(isWES(osDaFrente(frente)), frente).toBe(true)
    for (const frente of grupos.THM)        expect(isTHM(osDaFrente(frente)), frente).toBe(true)
  })

  it('não atribui operadora a frente aposentada', () => {
    for (const frente of ['F27', 'F39']) {
      const os = osDaFrente(frente)
      expect(isInstacable(os), frente).toBe(false)
      expect(isWES(os), frente).toBe(false)
      expect(isTHM(os), frente).toBe(false)
    }
  })
})

describe('calcStats', () => {
  it('mantém Sem Execução no total operacional, mas não atribui à produtividade técnica', () => {
    const stats = calcStats([
      row('Concluída'),
      row('Concluída/Sem Execução'),
      row('Pendente'),
    ], 'global')

    expect(stats.semExec).toBe(1)
    expect(Object.values(stats.byEquipe)).toEqual([
      { exec: 1, semExec: 0, pend: 1, slaVenc: 0 },
    ])
  })

  it('não cria equipe técnica quando ela possui somente baixa Sem Execução', () => {
    const stats = calcStats([row('Concluída/Sem Execução', 'INST F99')], 'global')

    expect(stats.semExec).toBe(1)
    expect(stats.byEquipe['INST F99']).toBeUndefined()
  })
})
