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
  '--c-primary': '80 132 240',
  '--c-primary-dark': '31 97 236',
  '--c-blue': '80 132 240',
  '--c-cyan': '34 211 238',
  '--c-green': '17 199 176',
  '--c-yellow': '245 201 21',
  '--c-red': '255 107 107',
  '--c-orange': '255 90 31',
  '--c-purple': '154 122 255',
  '--c-teal': '45 212 191',
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
  '--c-primary': '31 97 236',
  '--c-primary-dark': '31 97 236',
  '--c-blue': '31 97 236',
  '--c-cyan': '10 120 136',
  '--c-green': '11 123 109',
  '--c-yellow': '130 106 6',
  '--c-red': '221 0 0',
  '--c-orange': '203 53 0',
  '--c-purple': '114 69 255',
  '--c-teal': '25 122 109',
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

// Daltonismo: Machado et al. 2009, severidade 1.0, aplicada em RGB linear.
const MACHADO: Record<string, number[][]> = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}
const paraLinear = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const daLinear = (v: number) => { const c = Math.min(1, Math.max(0, v)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) }

function simular(rgb: string, visao: string): [number, number, number] {
  const lin = rgb.split(' ').map(Number).map(paraLinear)
  const M = MACHADO[visao]
  return [0, 1, 2].map(i => daLinear(M[i][0] * lin[0] + M[i][1] * lin[1] + M[i][2] * lin[2])) as [number, number, number]
}

function oklab(rgb: [number, number, number]): [number, number, number] {
  const [r, g, b] = rgb.map(paraLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}

const distancia = (a: number[], b: number[]) => 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

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

// Acento e o que pinta significado: marca, estado e categoria. Derivado do
// nome, como as superficies — acento novo entra na varredura sozinho.
// Os --c-grp-* nao aparecem aqui porque a Task 2 os remove: ninguem os le.
const ehAcento = (n: string) =>
  /^--c-(primary|blue|green|yellow|red|orange|purple|cyan|teal)$/.test(n)

describe('contraste de acento', () => {
  it.each(['dark', 'light'] as const)('%s: todo acento atinge 4.5:1 como texto', tema => {
    // Sao 198 text-primary no JSX: acento e texto com muita frequencia. A barra
    // vale contra a pior superficie, nao contra o fundo base.
    const resolvidos = resolveTheme(tokens, tema)
    const acentos = Object.keys(resolvidos).filter(ehAcento)
    const superficies = Object.keys(resolvidos).filter(ehSuperficie)

    expect(acentos.length, 'a varredura de acento esvaziou').toBeGreaterThanOrEqual(8)

    const reprovados: string[] = []
    for (const a of acentos) {
      for (const s of superficies) {
        const r = contraste(resolvidos[a], resolvidos[s])
        if (r < 4.5) reprovados.push(`${a} sobre ${s}: ${r.toFixed(2)}:1`)
      }
    }
    expect(reprovados).toEqual([])
  })
})

describe('tinta de KPI e serie de grafico', () => {
  it.each(['dark', 'light'] as const)('%s: a tinta de KPI passa sobre o acento', tema => {
    // O par vem do sufixo: --c-kpi-ink-orange e medido contra --c-orange.
    // A escolha nao e preferencia — a tinta oposta reprova nos oito casos.
    const resolvidos = resolveTheme(tokens, tema)
    const tintas = Object.keys(resolvidos).filter(n => n.startsWith('--c-kpi-ink-'))

    expect(tintas.length, 'a varredura de tinta esvaziou').toBe(4)

    for (const tinta of tintas) {
      const acento = tinta.replace('--c-kpi-ink-', '--c-')
      expect(resolvidos[acento], `${tinta} nao tem acento ${acento}`).toBeDefined()
      const r = contraste(resolvidos[tinta], resolvidos[acento])
      expect(r, `${tinta} sobre ${acento}: ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(['dark', 'light'] as const)('%s: a serie de grafico se ve e se distingue', tema => {
    // Serie nao e texto, entao nao vai a 4.5:1. Mas e objeto grafico necessario
    // para entender o conteudo (WCAG 1.4.11), entao vai a 3:1 — o amarelo do
    // design system dava 1.35:1 sobre branco, uma barra que nao aparecia.
    const resolvidos = resolveTheme(tokens, tema)
    const series = Object.keys(resolvidos).filter(n => /^--c-chart-\d$/.test(n))
    const superficies = Object.keys(resolvidos).filter(ehSuperficie)

    expect(series.length).toBe(6)
    expect(new Set(series.map(s => resolvidos[s])).size, 'duas series com a mesma cor').toBe(6)

    const invisiveis: string[] = []
    for (const serie of series) {
      for (const s of superficies) {
        const r = contraste(resolvidos[serie], resolvidos[s])
        if (r < 3) invisiveis.push(`${serie} sobre ${s}: ${r.toFixed(2)}:1`)
      }
    }
    expect(invisiveis).toEqual([])
  })

  it.each(['dark', 'light'] as const)('%s: a serie de grafico nao se confunde com status nem sob daltonismo', tema => {
    // O teste anterior garante que as series se veem; este garante que se
    // distinguem. A escala antiga tinha verde, amarelo e vermelho como series e
    // dava 2.0 entre duas delas na deuteranopia. Piso 6: a escala atual mede
    // 7.6 no escuro e 6.5 no claro, e e o que seis categorias sem os matizes de
    // status conseguem. Cair abaixo disso e voltar a ter series gemeas.
    const resolvidos = resolveTheme(tokens, tema)
    const series = Object.keys(resolvidos).filter(n => /^--c-chart-\d$/.test(n))
    const status = ['--c-green', '--c-yellow', '--c-red', '--c-orange']

    const pisos: Record<string, number> = { dark: 6, light: 6 }
    const reprovados: string[] = []
    for (const visao of Object.keys(MACHADO)) {
      const simula = (nome: string) => oklab(simular(resolvidos[nome], visao))
      const todos = [...series, ...status]
      for (let i = 0; i < series.length; i++) {
        for (let j = i + 1; j < todos.length; j++) {
          const d = distancia(simula(series[i]), simula(todos[j]))
          if (d < pisos[tema]) reprovados.push(`${visao}: ${series[i]} x ${todos[j]} = ${d.toFixed(1)}`)
        }
      }
    }
    expect(reprovados).toEqual([])
  })

  it('nenhuma serie de grafico usa o matiz de um status', () => {
    // Serie vermelha le-se como alarme. A regra e de matiz, nao de valor: cada
    // serie fica fora de vermelho, laranja, amarelo e verde, nos dois temas.
    for (const tema of ['dark', 'light'] as const) {
      const resolvidos = resolveTheme(tokens, tema)
      for (const nome of Object.keys(resolvidos).filter(n => /^--c-chart-\d$/.test(n))) {
        const [L, a, b] = oklab(resolvidos[nome].split(' ').map(Number) as [number, number, number])
        const croma = Math.hypot(a, b)
        const matiz = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360
        // Neutras (croma baixo) nao tem matiz de status; as demais ficam em 190-350.
        const ehStatus = croma > 0.07 && (matiz < 190 || matiz > 350)
        expect(ehStatus, `${tema} ${nome}: matiz ${matiz.toFixed(0)}, L ${L.toFixed(2)}`).toBe(false)
      }
    }
  })

  it('nenhum var(--c-*) aponta para token que nao existe', () => {
    // A assercao abaixo cobre uma direcao: token declarado sem leitor. Esta
    // cobre a outra: leitor apontando para token removido. Faltava, e custou
    // caro — a Fase 6a apagou --c-primary-light por nao ter uso no JSX, sem
    // ver que o proprio index.css o usava no .page-header-icon. A referencia
    // quebrada nao da erro: `rgb(var(--inexistente))` e invalido, a declaracao
    // e descartada e o elemento herda a cor do pai, em silencio.
    const css = readFileSync('src/index.css', 'utf8')
    const config = readFileSync('tailwind.config.js', 'utf8')
    const declarados = new Set([
      ...Object.keys(resolveTheme(tokens, 'dark')),
      ...Object.keys(lerComponentes().dark),
      ...Object.keys(lerComponentes().light),
    ])

    const quebradas = new Set<string>()
    for (const fonte of [css, config]) {
      for (const m of fonte.matchAll(/var\((--c-[\w-]+)\)/g)) {
        if (!declarados.has(m[1])) quebradas.add(m[1])
      }
    }
    expect([...quebradas]).toEqual([])
  })

  it('todo acento declarado e consumido por alguem', () => {
    // Os --c-grp-* eram declarados, corrigidos pela Fase 1 e lidos por ninguem:
    // as classes .grp-* do proprio index.css usam rgba cravado. Token sem
    // leitor nao e sistema, e paisagem.
    const css = readFileSync('src/index.css', 'utf8')
    const config = readFileSync('tailwind.config.js', 'utf8')
    const resolvidos = resolveTheme(tokens, 'dark')

    const orfaos = Object.keys(resolvidos)
      .filter(ehAcento)
      .filter(nome => {
        const usos = (css.match(new RegExp(`var\\(${nome}\\)`, 'g')) ?? []).length
        return usos === 0 && !config.includes(`var(${nome})`)
      })
    expect(orfaos).toEqual([])
  })
})
