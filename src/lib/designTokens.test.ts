import { describe, expect, it } from 'vitest'
// Módulo .mjs compartilhado com os scripts de auditoria; tipos em design-tokens.d.ts
import { lerIndexCss, resolveTheme } from '../../scripts/design-tokens.mjs'

/**
 * Fase 1 do design system: arquitetura de token em três camadas.
 *
 * Este arquivo existe para provar que a Fase 1 NÃO muda nada na tela. Os valores
 * abaixo foram capturados do index.css de camada única, antes do refactor, e o
 * teste passa nas duas pontas: se algum valor resolvido mudar, mudou pixel, e
 * isso não é refactor — é redesign disfarçado.
 *
 * O que a camada semântica publica (--c-*) é o contrato: tailwind.config.js e
 * todo o JSX consomem esses nomes. Primitivo (--p-*) é interno e nunca aparece
 * em componente.
 */

const DARK = {
  '--c-bg': '9 9 11',
  '--c-elevated': '18 18 20',
  '--c-surface': '24 24 27',
  '--c-card': '19 19 21',
  '--c-card-high': '26 26 29',
  '--c-card-highest': '33 33 37',
  '--c-border': '39 39 42',
  '--c-text': '250 250 250',
  '--c-secondary': '161 161 170',
  '--c-muted': '113 113 122',
  '--c-disabled': '63 63 70',
  '--c-primary': '59 130 246',
  '--c-primary-light': '96 165 250',
  '--c-primary-dark': '37 99 235',
  '--c-cyan': '34 211 238',
  '--c-green': '74 222 128',
  '--c-yellow': '250 204 21',
  '--c-red': '248 113 113',
  '--c-orange': '251 146 60',
  '--c-purple': '167 139 250',
  '--c-pink': '244 114 182',
  '--c-teal': '45 212 191',
  '--c-grp-erp': '139 92 246',
  '--c-grp-ops': '34 211 238',
  '--c-grp-anal': '74 222 128',
  '--c-grp-infra': '251 146 60',
}

const LIGHT = {
  '--c-bg': '244 244 245',
  '--c-elevated': '255 255 255',
  '--c-surface': '249 250 251',
  '--c-card': '255 255 255',
  '--c-card-high': '243 244 246',
  '--c-card-highest': '229 231 235',
  '--c-border': '228 228 231',
  '--c-text': '9 9 11',
  '--c-secondary': '82 82 91',
  '--c-muted': '113 113 122',
  '--c-disabled': '212 212 216',
  '--c-primary': '37 99 235',
  '--c-primary-light': '59 130 246',
  '--c-primary-dark': '29 78 216',
  '--c-cyan': '8 145 178',
  '--c-green': '22 163 74',
  '--c-yellow': '161 98 7',
  '--c-red': '220 38 38',
  '--c-orange': '194 65 12',
  '--c-purple': '109 40 217',
  '--c-pink': '190 24 93',
  '--c-teal': '15 118 110',
  // Acentos de grupo da sidebar: iguais nos dois temas de propósito. Antes da
  // Fase 1 o tema claro simplesmente não os declarava e herdava o valor escuro
  // por acidente do cascade — o resultado é o mesmo, a intenção não era.
  '--c-grp-erp': '139 92 246',
  '--c-grp-ops': '34 211 238',
  '--c-grp-anal': '74 222 128',
  '--c-grp-infra': '251 146 60',
}

const tokens = lerIndexCss()

describe('valores resolvidos não mudam', () => {
  it.each(Object.entries(DARK))('dark %s = %s', (nome, esperado) => {
    expect(resolveTheme(tokens, 'dark')[nome]).toBe(esperado)
  })

  it.each(Object.entries(LIGHT))('light %s = %s', (nome, esperado) => {
    expect(resolveTheme(tokens, 'light')[nome]).toBe(esperado)
  })
})

describe('arquitetura de três camadas', () => {
  it('os dois temas publicam exatamente o mesmo conjunto semântico', () => {
    // Um token declarado só no dark herda o valor escuro no tema claro, sem
    // erro e sem aviso. Foi o que aconteceu com os quatro --c-grp-*.
    const dark = Object.keys(resolveTheme(tokens, 'dark')).sort()
    const light = Object.keys(resolveTheme(tokens, 'light')).sort()
    expect(light).toEqual(dark)
  })

  it('todo valor semântico é referência a um primitivo, nunca um valor cru', () => {
    // Valor cru na camada semântica é a camada única voltando pela porta dos fundos.
    const crus: string[] = []
    for (const tema of ['dark', 'light'] as const) {
      for (const [nome, valor] of Object.entries(tokens[tema])) {
        if (!/^var\(--p-[\w-]+\)$/.test(valor)) crus.push(`${tema} ${nome}: ${valor}`)
      }
    }
    expect(crus).toEqual([])
  })

  it('nenhum primitivo é redefinido por tema', () => {
    // Primitivo é o valor cru da paleta; quem troca por tema é o alias.
    for (const tema of ['dark', 'light'] as const) {
      const redefinidos = Object.keys(tokens[tema])
        .filter(nome => nome.startsWith('--p-'))
      expect(redefinidos).toEqual([])
    }
  })

  it('todo primitivo declarado é usado por alguém', () => {
    const usados = new Set<string>()
    for (const tema of ['dark', 'light'] as const) {
      for (const valor of Object.values(tokens[tema])) {
        const ref = valor.match(/^var\((--p-[\w-]+)\)$/)
        if (ref) usados.add(ref[1])
      }
    }
    const orfaos = Object.keys(tokens.primitivos).filter(nome => !usados.has(nome))
    expect(orfaos).toEqual([])
  })
})
