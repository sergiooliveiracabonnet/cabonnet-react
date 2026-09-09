import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// Módulo .mjs compartilhado com os scripts de auditoria; tipos em design-tokens.d.mts
import { lerEscalaTipo } from '../../scripts/design-tokens.mjs'

/**
 * Fase 2 do design system: a escala tipográfica fecha os buracos.
 *
 * O sistema já tinha cinco papéis semânticos (caption/label/body/title/display)
 * com 1.328 usos — a escala não estava ausente, estava incompleta. Faltava o
 * papel que mais importa num painel de operação: o número. Trinta e poucas
 * leituras de métrica improvisaram oito tamanhos entre 16px e 64px, todas com o
 * mesmo tratamento (font-mono font-black tabular-nums leading-none), porque não
 * havia degrau nomeado para elas — só `display`, que era uma delas disfarçada.
 *
 * Abaixo de caption(11) o problema era o oposto: meios-degraus (9,5 / 10,5 /
 * 11,5 / 12,5 / 13,5) de quem brigava por densidade sem ter um modo de
 * densidade para pedir.
 */

function* tsx(dir: string): Generator<string> {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) yield* tsx(p)
    else if (/\.tsx$/.test(nome) && !nome.endsWith('.test.tsx')) yield p
  }
}

const escala = lerEscalaTipo()
const PAPEIS = Object.keys(escala.mesa).map(n => n.replace('--fs-', ''))
const RUNG = `(?:${PAPEIS.join('|')})`
const CRASE = String.fromCharCode(96)

describe('a escala é fechada', () => {
  it('nenhum tamanho de fonte avulso sobrou no JSX', () => {
    // Um text-[23px] é uma decisão de design tomada dentro de um componente,
    // onde ninguém revisa e nada compara com os vizinhos.
    const fugas: string[] = []
    for (const arquivo of tsx('src')) {
      for (const m of readFileSync(arquivo, 'utf8').matchAll(/\btext-\[[0-9.]+(?:px|rem|em)\]/g)) {
        fugas.push(`${arquivo.replace(/\\/g, '/')}: ${m[0]}`)
      }
    }
    expect(fugas).toEqual([])
  })

  it('nenhum elemento declara dois degraus ao mesmo tempo', () => {
    // PageHeader tinha `text-title text-[20px] sm:text-[22px]`: três degraus no
    // mesmo h1, os dois últimos anulando o primeiro em silêncio. A busca não
    // pode parar na crase — template literal é justamente onde o defeito estava.
    // `sm:text-headline` é um degrau responsivo deliberado, não conflito — por
    // isso só contam os degraus sem prefixo de variante.
    const NU = `(?<![\\w:-])text-`
    const par = new RegExp(`${NU}${RUNG}\\b[^"'${CRASE}]{0,160}?${NU}${RUNG}\\b`, 'g')
    const nome = new RegExp(`${NU}(${RUNG})\\b`, 'g')

    const conflitos: string[] = []
    for (const arquivo of tsx('src')) {
      for (const m of readFileSync(arquivo, 'utf8').matchAll(par)) {
        const distintos = new Set([...m[0].matchAll(nome)].map(x => x[1]))
        if (distintos.size > 1) {
          conflitos.push(`${arquivo.replace(/\\/g, '/')}: ${[...distintos].join(' + ')}`)
        }
      }
    }
    expect(conflitos).toEqual([])
  })
})

describe('degraus e densidade', () => {
  it('existe um papel para o número de métrica', () => {
    const leituras = Object.keys(escala.mesa).filter(n => n.startsWith('--fs-readout'))
    expect(leituras.length).toBeGreaterThanOrEqual(3)
  })

  it('mesa e parede declaram os mesmos papéis', () => {
    // Papel que existe num modo e não no outro herda o tamanho errado em
    // silêncio — o mesmo defeito que os --c-grp-* tinham entre os temas.
    expect(Object.keys(escala.parede).sort()).toEqual(Object.keys(escala.mesa).sort())
  })

  it('parede é maior que mesa em todo degrau', () => {
    // O painel da sala é lido a 4 metros; degrau que não cresce some de lá.
    for (const [papel, mesa] of Object.entries(escala.mesa)) {
      expect(escala.parede[papel], papel).toBeGreaterThan(mesa)
    }
  })

  it('os degraus sobem de forma monotônica, sem empate', () => {
    // Dois papéis com o mesmo tamanho são um papel com dois nomes.
    for (const modo of ['mesa', 'parede'] as const) {
      const valores = Object.values(escala[modo])
      expect(valores, modo).toEqual([...valores].sort((a, b) => a - b))
      expect(new Set(valores).size, `${modo} tem degraus empatados`).toBe(valores.length)
    }
  })

  it('nada desce abaixo de 11px, o mínimo do sistema', () => {
    for (const [papel, px] of Object.entries(escala.mesa)) {
      expect(px, papel).toBeGreaterThanOrEqual(11)
    }
  })
})
