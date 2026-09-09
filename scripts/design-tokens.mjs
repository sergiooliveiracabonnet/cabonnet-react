// Leitura da arquitetura de tokens do index.css.
//
// Três camadas: primitivo (valor cru, uma vez só) → semântico (--c-*, o que
// troca por tema) → componente. O que o Tailwind e os componentes consomem é
// SEMPRE a camada semântica; primitivo nunca aparece em JSX.
import { readFileSync } from 'node:fs'

const BLOCOS = {
  primitivos: /\/\* PRIMITIVOS \*\/\s*:root\s*\{([\s\S]*?)\n\}/,
  dark:       /\/\* SEMANTICOS: DARK \*\/\s*:root\s*\{([\s\S]*?)\n\}/,
  light:      /\/\* SEMANTICOS: LIGHT \*\/\s*\.light\s*\{([\s\S]*?)\n\}/,
}

// Fallback para o formato de camada única, anterior à Fase 1.
const BLOCOS_LEGADO = {
  dark:  /:root\s*\{([\s\S]*?)\n\}/,
  light: /\.light\s*\{([\s\S]*?)\n\}/,
}

function declaracoes(corpo) {
  const saida = {}
  for (const m of (corpo ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    saida[m[1]] = m[2].trim()
  }
  return saida
}

export function parseTokens(css) {
  const emCamadas = BLOCOS.primitivos.test(css)
  const fonte = emCamadas ? BLOCOS : BLOCOS_LEGADO
  return {
    emCamadas,
    primitivos: emCamadas ? declaracoes(css.match(BLOCOS.primitivos)?.[1]) : {},
    dark:       declaracoes(css.match(fonte.dark)?.[1]),
    light:      declaracoes(css.match(fonte.light)?.[1]),
  }
}

/** Resolve a camada semântica até o valor final, seguindo var(--p-*). */
export function resolveTheme(tokens, tema) {
  const semanticos = tokens[tema]
  const saida = {}
  for (const [nome, valor] of Object.entries(semanticos)) {
    const ref = valor.match(/^var\((--[\w-]+)\)$/)
    if (!ref) {
      saida[nome] = valor.replace(/\s+/g, ' ')
      continue
    }
    const alvo = tokens.primitivos[ref[1]]
    if (alvo === undefined) throw new Error(`${nome} aponta para ${ref[1]}, que nao existe`)
    saida[nome] = alvo.replace(/\s+/g, ' ')
  }
  return saida
}

export function lerIndexCss(caminho = 'src/index.css') {
  return parseTokens(readFileSync(caminho, 'utf8'))
}

/* ── Escala tipográfica (Fase 2) ─────────────────────────────────────────
   Os papéis viram tokens em vez de valores fixos no tailwind.config.js, para
   que a densidade — mesa e parede — troque a escada inteira sem tocar em
   nenhum componente. */

const BLOCOS_TIPO = {
  mesa:   /\/\* TIPO: MESA \*\/\s*:root\s*\{([\s\S]*?)\n\}/,
  parede: /\/\* TIPO: PAREDE \*\/\s*\[data-densidade="parede"\]\s*\{([\s\S]*?)\n\}/,
}

function px(corpo) {
  const saida = {}
  for (const m of (corpo ?? '').matchAll(/(--fs-[\w-]+)\s*:\s*([0-9.]+)px\s*;/g)) {
    saida[m[1]] = Number(m[2])
  }
  return saida
}

export function parseEscalaTipo(css) {
  return {
    mesa:   px(css.match(BLOCOS_TIPO.mesa)?.[1]),
    parede: px(css.match(BLOCOS_TIPO.parede)?.[1]),
  }
}

export function lerEscalaTipo(caminho = 'src/index.css') {
  return parseEscalaTipo(readFileSync(caminho, 'utf8'))
}
