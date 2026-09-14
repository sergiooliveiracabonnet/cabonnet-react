import type { MindMapGroup, MindMapLeaf } from './escalaMindMap'

export interface PositionedLeaf extends MindMapLeaf { x: number; y: number }
export interface PositionedGroup extends MindMapGroup {
  x: number; y: number; angleDeg: number
  /** ponto de controle da curva centro→grupo (bezier quadrática) */
  ctrlX: number; ctrlY: number
  leaves: PositionedLeaf[]
}
export interface MindMapLayout {
  /** tamanho só da área radial (sem cabeçalho/rodapé) — quadrada, centro em (size/2,size/2) */
  size:    number
  centerX: number
  centerY: number
  groups:  PositionedGroup[]
}

const GROUP_RADIUS   = 210
// Leaves ficam num cluster de 2 colunas perto da ponta do ramo, em vez de uma
// fila reta e comprida — um ramo com 6 equipes cresce 3 "andares", não 6.
const LEAF_START_GAP = 60
const LEAF_ROW_STEP   = 50
const LEAF_COL_GAP    = 72
const MARGIN          = 140
const MIN_SIZE        = 620
const CURVE_OFFSET    = 36

const deg2rad = (d: number): number => d * Math.PI / 180

/** Layout radial: grupos espalhados em círculo ao redor do centro; as equipes
 *  de cada grupo ficam num cluster compacto de 2 colunas na ponta do ramo,
 *  sempre do lado de fora do grupo (nunca cruzando o setor do vizinho). */
export function layoutMindMap(groups: MindMapGroup[]): MindMapLayout {
  const n = groups.length
  if (n === 0) return { size: MIN_SIZE, centerX: MIN_SIZE / 2, centerY: MIN_SIZE / 2, groups: [] }

  const maxLeaves  = Math.max(0, ...groups.map(g => g.equipes.length))
  const maxRows    = Math.max(1, Math.ceil(maxLeaves / 2))
  const maxRadial  = GROUP_RADIUS + LEAF_START_GAP + (maxRows - 1) * LEAF_ROW_STEP + LEAF_COL_GAP
  const half       = maxRadial + MARGIN
  const size       = Math.max(MIN_SIZE, Math.round(half * 2))
  const centerX    = size / 2
  const centerY    = size / 2

  const positioned: PositionedGroup[] = groups.map((g, i) => {
    const angleDeg = -90 + (360 / n) * i
    const rad = deg2rad(angleDeg)
    const ux = Math.cos(rad), uy = Math.sin(rad)         // vetor radial (pra fora)
    const px = -Math.sin(rad), py = Math.cos(rad)        // vetor perpendicular

    const gx = centerX + GROUP_RADIUS * ux
    const gy = centerY + GROUP_RADIUS * uy

    // curva alterna pra fora/dentro a cada grupo — evita que todas fiquem
    // "espelhadas" na mesma direção, o que de longe parece uma roda de bicicleta.
    const curveSign = i % 2 === 0 ? 1 : -1
    const midX = (centerX + gx) / 2
    const midY = (centerY + gy) / 2
    const ctrlX = midX + px * CURVE_OFFSET * curveSign
    const ctrlY = midY + py * CURVE_OFFSET * curveSign

    const nLeaves = g.equipes.length
    const singleCol = nLeaves <= 1
    const leaves: PositionedLeaf[] = g.equipes.map((leaf, j) => {
      const col = singleCol ? 0 : j % 2
      const row = singleCol ? j : Math.floor(j / 2)
      const perpOffset = singleCol ? 0 : (col - 0.5) * LEAF_COL_GAP
      const radialDist  = LEAF_START_GAP + row * LEAF_ROW_STEP
      return {
        ...leaf,
        x: gx + ux * radialDist + px * perpOffset,
        y: gy + uy * radialDist + py * perpOffset,
      }
    })

    return { ...g, x: gx, y: gy, angleDeg, ctrlX, ctrlY, leaves }
  })

  return { size, centerX, centerY, groups: positioned }
}
