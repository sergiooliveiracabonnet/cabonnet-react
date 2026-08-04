import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EQUIPE_NAMES } from '../../lib/osFormat'
import { TEAMS } from './erpConstants'

// F47 existia no mapa de operadoras e em EQUIPE_NAMES, mas não em TEAMS. Como
// AlertasComponents percorre TEAMS para montar os alertas de sobrecarga e de
// SLA baixo, a frente ficava invisível para o motor de alertas por pior que
// estivesse. A lacuna era silenciosa: nada quebrava, só deixava de avisar.
function frentesDoBackend(): string[] {
  const py = readFileSync('cabonnet/config.py', 'utf8')
  const bloco = py.slice(py.indexOf('_OPERADORA_GRUPOS'), py.indexOf('# ── Revisitas'))
  return [...bloco.matchAll(/F\d+/g)].map(m => m[0])
}

describe('cadastro de frentes', () => {
  const frentes = frentesDoBackend()

  it('leu as frentes do config.py', () => {
    expect(frentes.length).toBeGreaterThan(0)
  })

  it('toda frente ativa tem entrada no roster TEAMS', () => {
    const semRoster = frentes.filter(f => !TEAMS.some(t => t.code === `INST ${f}`))
    expect(semRoster).toEqual([])
  })

  it('toda frente ativa tem nome de exibição', () => {
    const semNome = frentes.filter(f => !EQUIPE_NAMES[`INST ${f}`])
    expect(semNome).toEqual([])
  })

  it('frentes aposentadas não têm cadastro em lugar nenhum', () => {
    for (const frente of ['F27', 'F39']) {
      expect(frentes, frente).not.toContain(frente)
      expect(TEAMS.some(t => t.code === `INST ${frente}`), frente).toBe(false)
      expect(EQUIPE_NAMES[`INST ${frente}`], frente).toBeUndefined()
    }
  })
})
