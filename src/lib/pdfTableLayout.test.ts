import { describe, expect, it } from 'vitest'
import { columnWidth, truncateTextToWidth, validateColumnGrid } from './pdfTableLayout'

describe('pdfTableLayout', () => {
  it('rejeita grades com quantidade de colunas diferente da quantidade de células', () => {
    expect(() => validateColumnGrid([0, 52, 66, 80, 94, 110, 126], 6, 178)).toThrow(
      '6 células para 7 colunas',
    )
  })

  it('calcula a largura da última coluna até o limite do conteúdo', () => {
    expect(columnWidth([0, 62, 84, 106, 128, 150], 5, 178)).toBe(28)
  })

  it('trunca pelo tamanho medido e preserva uma elipse dentro do limite', () => {
    const measure = (value: string) => value.length * 2
    const result = truncateTextToWidth('CLIENTE COM NOME MUITO LONGO', 20, measure)

    expect(result).toBe('CLIENTE C…')
    expect(measure(result)).toBeLessThanOrEqual(20)
  })

  it('não altera textos que já cabem na coluna', () => {
    expect(truncateTextToWidth('CABONNET', 20, value => value.length * 2)).toBe('CABONNET')
  })
})
