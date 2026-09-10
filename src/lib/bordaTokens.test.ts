import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// Módulo .mjs compartilhado com os scripts de auditoria; tipos em design-tokens.d.mts
import { lerComponentes } from '../../scripts/design-tokens.mjs'

/**
 * Fase 3: as bordas param de ser transparência sobre branco.
 *
 * 413 bordas eram `border-white/[alfa]` em nove níveis. No tema claro isso
 * nunca funcionou de verdade: um seletor global — `.light
 * [class*="border-white/"]` — atropelava os nove níveis para um valor só. O
 * tema claro já tratava tudo como uma borda única, e a variação existia apenas
 * no escuro.
 *
 * Três pesos de componente preservam os dois temas e matam o seletor global,
 * que era a maior gambiarra restante do CSS.
 */

function* tsx(dir: string): Generator<string> {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) yield* tsx(p)
    else if (/\.tsx$/.test(nome) && !nome.endsWith('.test.tsx')) yield p
  }
}

const css = readFileSync('src/index.css', 'utf8')
const componentes = lerComponentes()
const PESOS = ['--c-border-hairline', '--c-border-subtle', '--c-border-strong']

// A camada de componente nasceu com as bordas, mas nao e so delas: a Fase 5
// pos as sombras aqui. As assercoes abaixo sao sobre borda, entao filtram por
// prefixo em vez de assumir que a camada inteira lhes pertence.
const bordasDe = (tema: 'dark' | 'light') =>
  Object.entries(componentes[tema]).filter(([nome]) => nome.startsWith('--c-border-'))

describe('bordas viraram token', () => {
  it('nenhuma borda de superfície em alfa sobre branco sobrou no JSX', () => {
    // Só o padrão de superfície, com alfa entre colchetes. `border-white/30` de
    // anel de spinner dentro de botão colorido não é borda de superfície: ali o
    // branco é correto nos dois temas — e o seletor global inclusive o quebrava
    // no tema claro, pintando o anel de cinza.
    const fugas: string[] = []
    for (const arquivo of tsx('src')) {
      const re = /\b(?:[a-z-]+:)?(?:border|divide)[a-z-]*-white\/\[[0-9.]+\]/g
      for (const m of readFileSync(arquivo, 'utf8').matchAll(re)) {
        fugas.push(`${arquivo.replace(/\\/g, '/')}: ${m[0]}`)
      }
    }
    expect(fugas).toEqual([])
  })

  it('o seletor global que remendava o tema claro morreu junto', () => {
    // Enquanto ele existir, a borda de qualquer componente depende de um
    // seletor de atributo que ninguém lê ao escrever o componente.
    expect(css).not.toContain('[class*="border-white/"]')
    expect(css).not.toContain('[class*="divide-white/"]')
  })

  it('os dois temas declaram os três pesos', () => {
    // Peso que existe num tema e não no outro herda o valor errado em silêncio,
    // o mesmo defeito que os --c-grp-* tinham antes da Fase 1.
    expect(bordasDe('dark').map(([nome]) => nome).sort()).toEqual([...PESOS].sort())
    expect(bordasDe('light').map(([nome]) => nome).sort()).toEqual([...PESOS].sort())
  })

  it('no escuro os três pesos são distintos; no claro os três são a borda do tema', () => {
    // Três pesos iguais no escuro seriam um peso com três nomes. No claro, ao
    // contrário, o valor único é o comportamento correto — é o que o seletor
    // global já impunha, agora escrito em vez de imposto de fora.
    expect(new Set(bordasDe('dark').map(([, valor]) => valor)).size).toBe(3)
    expect(new Set(bordasDe('light').map(([, valor]) => valor)).size).toBe(1)
  })

  it('divide- tem cor declarada, não só border-', () => {
    // Pegadinha do Tailwind 3: divideColor herda do borderColor *base*, não de
    // um declarado dentro de extend. Sem o bloco próprio, `divide-hairline`
    // simplesmente não é emitido e os 34 divisores ficam sem cor nenhuma — sem
    // erro de build, sem aviso, só a linha sumindo da tela.
    const usaDivide = [...tsx('src')].some(a =>
      /\bdivide-(?:hairline|subtle|strong)\b/.test(readFileSync(a, 'utf8')),
    )
    if (usaDivide) {
      expect(readFileSync('tailwind.config.js', 'utf8')).toContain('divideColor')
    }
  })

  it('a borda compõe sobre a camada de baixo, nunca sobre literal', () => {
    // Vale para cor. Sombra e geometria mais cor — `0 16px 40px rgba(...)` —
    // e nunca sera um var() puro, por isso fica fora desta varredura.
    for (const tema of ['dark', 'light'] as const) {
      for (const [nome, valor] of bordasDe(tema)) {
        expect(valor, `${tema} ${nome}`).toMatch(/var\(--[pc]-[\w-]+\)/)
        expect(valor, `${tema} ${nome} tem literal cru`).not.toMatch(/#[0-9a-fA-F]{3,8}/)
      }
    }
  })
})
