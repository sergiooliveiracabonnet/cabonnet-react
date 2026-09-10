import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// Módulo .mjs compartilhado com os scripts de auditoria; tipos em design-tokens.d.ts
import { lerComponentes, lerIndexCss, resolveTheme } from '../../scripts/design-tokens.mjs'

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
  '--c-bg': '2 2 2',
  '--c-elevated': '8 8 8',
  '--c-surface': '24 24 24',
  '--c-card': '12 12 12',
  '--c-card-high': '18 18 18',
  '--c-card-highest': '32 32 32',
  '--c-border': '37 37 37',
  '--c-text': '255 255 255',
  '--c-secondary': '181 181 181',
  '--c-muted': '138 138 138',
  '--c-disabled': '80 80 80',
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
  '--c-bg': '243 244 246',
  '--c-elevated': '255 255 255',
  '--c-surface': '246 247 248',
  '--c-card': '255 255 255',
  '--c-card-high': '255 255 255',
  '--c-card-highest': '238 240 242',
  '--c-border': '232 232 232',
  '--c-text': '23 23 23',
  '--c-secondary': '68 68 68',
  '--c-muted': '109 109 109',
  '--c-disabled': '165 165 165',
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

// Formula de luminancia relativa e de razao de contraste da WCAG 2.2,
// definicoes 1.4.3 e 1.4.11. Os valores chegam como "9 9 11" do resolveTheme.
function luminancia(rgb: string): number {
  const [r, g, b] = rgb.split(' ').map(Number).map(v => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  const [alto, baixo] = la > lb ? [la, lb] : [lb, la]
  return (alto + 0.05) / (baixo + 0.05)
}

// Derivado do nome, nao escrito a mao: superficie nova entra na varredura
// sozinha. As contagens minimas abaixo sao o que impede a lista de esvaziar
// em silencio depois de um rename.
const ehSuperficie = (n: string) => /^--c-(bg|elevated|surface|card)(-|$)/.test(n)
const ehTextoAtivo = (n: string) => /^--c-(text|secondary|muted)$/.test(n)

describe('contraste de texto sobre superficie', () => {
  it.each(['dark', 'light'] as const)('%s: todo par atinge 4.5:1', tema => {
    // O comentario do design system media cada texto contra UM fundo. O par
    // que reprova e sempre o extremo: atenuado sobre a superficie ativa.
    const resolvidos = resolveTheme(tokens, tema)
    const superficies = Object.keys(resolvidos).filter(ehSuperficie)
    const textos = Object.keys(resolvidos).filter(ehTextoAtivo)

    expect(superficies.length, 'a varredura de superficie esvaziou').toBeGreaterThanOrEqual(6)
    expect(textos.length, 'a varredura de texto esvaziou').toBe(3)

    const reprovados: string[] = []
    for (const t of textos) {
      for (const s of superficies) {
        const r = contraste(resolvidos[t], resolvidos[s])
        if (r < 4.5) reprovados.push(`${t} sobre ${s}: ${r.toFixed(2)}:1`)
      }
    }
    expect(reprovados).toEqual([])
  })

  it.each(['dark', 'light'] as const)('%s: a borda nao some dentro da superficie', tema => {
    // Borda com o mesmo valor do fundo desaparece sem erro nenhum. Nao se
    // cobra 3:1 aqui: medida, a borda fica em 1.06-1.35:1 nos dois temas, e
    // e separador decorativo, nao o que identifica o componente.
    const resolvidos = resolveTheme(tokens, tema)
    const borda = resolvidos['--c-border']
    for (const s of Object.keys(resolvidos).filter(ehSuperficie)) {
      expect(resolvidos[s], `--c-border igual a ${s}`).not.toBe(borda)
    }
  })
})

describe('a camada semantica e o unico lugar', () => {
  it('nenhum --c-* e declarado fora dos blocos marcados', () => {
    // Um bloco :root sem marcacao, declarado depois, vence pelo cascade e
    // torna a camada semantica ficcao. Aconteceu: o "Cabonnet Control Surface"
    // de 2026-08-19 redeclarava 15 tokens em navy e atravessou as Fases 1 a 4
    // sem ninguem notar, porque o parser so le os blocos marcados.
    const css = readFileSync('src/index.css', 'utf8')
    const marcados = [
      /\/\* SEMANTICOS: DARK \*\/\s*:root\s*\{[\s\S]*?\n\}/,
      /\/\* SEMANTICOS: LIGHT \*\/\s*\.light\s*\{[\s\S]*?\n\}/,
      /\/\* COMPONENTE: DARK \*\/\s*:root\s*\{[\s\S]*?\n\}/,
      /\/\* COMPONENTE: LIGHT \*\/\s*\.light\s*\{[\s\S]*?\n\}/,
    ]
    // Apaga os blocos legitimos; o que sobrar declarando --c-* e clandestino.
    let resto = css
    for (const bloco of marcados) resto = resto.replace(bloco, '')

    const fugas = [...resto.matchAll(/^\s*(--c-[\w-]+)\s*:/gm)].map(m => m[1])
    expect(fugas).toEqual([])
  })
})

describe('sombra e a hierarquia do tema claro', () => {
  it('os tres niveis existem nos dois temas', () => {
    // No claro os tres primeiros niveis de superficie sao #FFFFFF: sem sombra,
    // popover sobre card fica branco em branco. Token declarado num tema so
    // herda o valor do outro pelo cascade, sem erro e sem aviso — foi o que
    // aconteceu com os --c-grp-* antes da Fase 1.
    const componentes = lerComponentes()
    for (const nivel of ['--c-shadow-sm', '--c-shadow-md', '--c-shadow-lg']) {
      expect(Object.keys(componentes.dark), `dark ${nivel}`).toContain(nivel)
      expect(Object.keys(componentes.light), `light ${nivel}`).toContain(nivel)
    }
  })

  it('o escuro zera as duas sombras pequenas', () => {
    // No escuro a separacao vem de borda e luminosidade; sombra preta sobre
    // #020202 nao aparece. So o nivel lg sobrevive, para modal e dropdown.
    const componentes = lerComponentes()
    expect(componentes.dark['--c-shadow-sm']).toBe('0 0 #0000')
    expect(componentes.dark['--c-shadow-md']).toBe('0 0 #0000')
    expect(componentes.dark['--c-shadow-lg']).not.toBe('0 0 #0000')
  })
})
