export function validateColumnGrid(starts: readonly number[], cellCount: number, contentWidth: number): void {
  if (starts.length !== cellCount) {
    throw new Error(`Grade PDF inválida: ${cellCount} células para ${starts.length} colunas`)
  }
  if (starts.length === 0 || starts[0] !== 0) {
    throw new Error('Grade PDF inválida: a primeira coluna deve iniciar em zero')
  }
  if (starts.some((start, index) => start < 0 || start >= contentWidth || (index > 0 && start <= starts[index - 1]))) {
    throw new Error('Grade PDF inválida: posições devem ser crescentes e caber na área útil')
  }
}

export function columnWidth(starts: readonly number[], index: number, contentWidth: number): number {
  return (starts[index + 1] ?? contentWidth) - starts[index]
}

export function truncateTextToWidth(
  value: unknown,
  maxWidth: number,
  measure: (text: string) => number,
): string {
  const text = String(value ?? '')
  if (maxWidth <= 0) return ''
  if (measure(text) <= maxWidth) return text

  const ellipsis = '…'
  if (measure(ellipsis) > maxWidth) return ''

  let low = 0
  let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (measure(text.slice(0, middle).trimEnd() + ellipsis) <= maxWidth) low = middle
    else high = middle - 1
  }
  return text.slice(0, low).trimEnd() + ellipsis
}
