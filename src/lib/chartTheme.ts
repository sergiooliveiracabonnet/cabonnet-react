/**
 * Ponte entre os tokens CSS do design system e as bibliotecas que exigem uma
 * string de cor em runtime — Recharts, canvas, jsPDF e html-to-image não
 * entendem classe utilitária.
 *
 * O valor sempre vem do CSS, nunca de um hex duplicado aqui: assim o gráfico
 * acompanha a troca de tema sem que ninguém precise manter duas paletas.
 */

/** Fallback para quando `getComputedStyle` não tem o que ler (SSR, pré-mount,
 *  teste em jsdom sem CSS). São os mesmos valores declarados em index.css. */
const FALLBACK: Record<string, string> = {
  bg: '2 2 2',
  'surface-1': '8 8 8',
  'surface-2': '12 12 12',
  'surface-3': '18 18 18',
  border: '37 37 37',
  'border-subtle': '26 26 26',
  text: '255 255 255',
  'text-secondary': '181 181 181',
  'text-muted': '138 138 138',
  'text-disabled': '80 80 80',
  orange: '255 90 31',
  blue: '74 128 240',
  green: '17 199 176',
  yellow: '245 201 21',
  red: '255 107 107',
  'chart-1': '255 90 31',
  'chart-2': '74 128 240',
  'chart-3': '17 199 176',
  'chart-4': '245 201 21',
  'chart-5': '255 107 107',
  'chart-6': '154 122 255',
}

/** Lê um token do design system como string CSS utilizável em runtime. */
export function token(name: string, alpha = 1): string {
  let raw = ''
  if (typeof document !== 'undefined') {
    raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
  }
  if (!raw) raw = FALLBACK[name] ?? FALLBACK.text
  return alpha === 1 ? `rgb(${raw})` : `rgb(${raw} / ${alpha})`
}

export function isDark(): boolean {
  if (typeof document === 'undefined') return true
  return document.documentElement.classList.contains('dark')
}

/** Escala categórica de série. Independente das cores semânticas de status,
 *  para que "amarelo = alerta" não colida com "amarelo = terceira categoria". */
export function chartSeries(): string[] {
  return [1, 2, 3, 4, 5, 6].map(i => token(`chart-${i}`))
}

export interface ChartAxisTheme {
  grid:  string
  axis:  string
  label: string
}

export function chartAxis(): ChartAxisTheme {
  return {
    grid:  isDark() ? 'rgba(255,255,255,.04)' : token('border-subtle'),
    axis:  isDark() ? token('text-muted', 0.5) : token('text-disabled'),
    label: token('text-muted'),
  }
}

export interface ChartTooltipTheme {
  background:   string
  border:       string
  borderRadius: number
  labelColor:   string
  valueColor:   string
  boxShadow:    string
}

export function chartTooltip(): ChartTooltipTheme {
  return {
    background:   token('surface-3'),
    border:       `1px solid ${token('border')}`,
    borderRadius: 12,
    labelColor:   token('text-muted'),
    valueColor:   token('text'),
    boxShadow:    isDark() ? 'none' : '0 10px 30px rgba(0,0,0,.08)',
  }
}
