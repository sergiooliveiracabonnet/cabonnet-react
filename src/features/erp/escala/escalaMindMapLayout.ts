import type { MindMapGroup, MindMapLeaf } from './escalaMindMap'

export interface PositionedLeaf extends MindMapLeaf { x: number; y: number }
export interface PositionedGroup extends MindMapGroup {
  x: number; y: number
  side: 'left' | 'right'
  leaves: PositionedLeaf[]
}
export interface MindMapLayout {
  width:  number
  height: number
  rootX:  number
  rootY:  number
  /** até onde desenhar a linha vertical central (a coluna mais alta) */
  trunkBottomY: number
  groups: PositionedGroup[]
}

// ─── Dimensões ──────────────────────────────────────────────────────────────
// Layout folgado de propósito — a primeira versão "encaixava" tudo no menor
// espaço possível e ficou apertada. Aqui sobra respiro em vez de faltar.
export const ROOT_R  = 54
export const GROUP_W = 236
export const GROUP_H = 74
export const LEAF_D  = 68      // diâmetro do círculo da equipe
export const LEAF_CAPTION_H = 40

const GAP_ROOT_GROUP = 110
const GAP_GROUP_LEAF = 46
const LEAF_ROW_GAP   = 24
const LEAF_GAP_X     = 26
const ROW_GAP         = 56    // espaço entre um grupo e o próximo, na mesma coluna
const CARD_OFFSET     = 210   // distância do tronco central até o centro do card
const MARGIN_X        = 90
const MARGIN_TOP      = 60
const MARGIN_BOTTOM   = 60

function alturaDoGrupo(g: MindMapGroup): number {
  const n = g.equipes.length
  if (n === 0) return GROUP_H
  const cols = n <= 1 ? 1 : 2
  const rows = Math.ceil(n / cols)
  return GROUP_H + GAP_GROUP_LEAF + rows * LEAF_D + (rows - 1) * LEAF_ROW_GAP
}

/** Divide os grupos em coluna esquerda/direita balanceando a altura (não só a
 *  quantidade) — grupos já vêm ordenados por cidade→atividade→indisponível e
 *  por tamanho, então essa gulosa (bin-packing) deixa as duas colunas bem
 *  parecidas mesmo quando um grupo tem muito mais equipes que os outros. */
function dividirColunas(groups: MindMapGroup[]): { left: MindMapGroup[]; right: MindMapGroup[] } {
  const left: MindMapGroup[] = []
  const right: MindMapGroup[] = []
  let leftH = 0, rightH = 0
  for (const g of groups) {
    const h = alturaDoGrupo(g)
    if (leftH <= rightH) { left.push(g); leftH += h + ROW_GAP } else { right.push(g); rightH += h + ROW_GAP }
  }
  return { left, right }
}

function layoutColuna(list: MindMapGroup[], side: 'left' | 'right', centerX: number, startY: number): {
  positioned: PositionedGroup[]; bottomY: number
} {
  let y = startY
  const positioned: PositionedGroup[] = list.map(g => {
    const n = g.equipes.length
    const leafCols = n <= 1 ? 1 : 2
    const groupY = y + GROUP_H / 2
    const leafTop = y + GROUP_H + GAP_GROUP_LEAF
    const leavesTotalW = n > 0 ? leafCols * LEAF_D + (leafCols - 1) * LEAF_GAP_X : 0

    const leaves: PositionedLeaf[] = g.equipes.map((leaf, idx) => {
      const col = idx % leafCols
      const row = Math.floor(idx / leafCols)
      return {
        ...leaf,
        x: centerX - leavesTotalW / 2 + col * (LEAF_D + LEAF_GAP_X) + LEAF_D / 2,
        y: leafTop + row * (LEAF_D + LEAF_ROW_GAP) + LEAF_D / 2,
      }
    })

    y += alturaDoGrupo(g) + ROW_GAP
    return { ...g, x: centerX, y: groupY, side, leaves }
  })

  return { positioned, bottomY: y - ROW_GAP }
}

/** Organograma em duas colunas: metade dos grupos desce à esquerda do tronco
 *  central, metade à direita — em vez de uma única fileira horizontal, que
 *  ficava comprida demais com muitos grupos. Cada grupo ainda tem suas
 *  equipes num cluster compacto (2 colunas) logo abaixo dele. */
export function layoutMindMap(groups: MindMapGroup[]): MindMapLayout {
  const rootY = MARGIN_TOP + ROOT_R
  const startY = rootY + ROOT_R + GAP_ROOT_GROUP

  if (groups.length === 0) {
    const width = 2 * (CARD_OFFSET + GROUP_W / 2) + MARGIN_X * 2
    return { width, height: 420, rootX: width / 2, rootY, trunkBottomY: rootY, groups: [] }
  }

  const width = 2 * (CARD_OFFSET + GROUP_W / 2) + MARGIN_X * 2
  const trunkX = width / 2

  const { left, right } = dividirColunas(groups)
  const { positioned: leftPos,  bottomY: leftBottom  } = layoutColuna(left,  'left',  trunkX - CARD_OFFSET, startY)
  const { positioned: rightPos, bottomY: rightBottom } = layoutColuna(right, 'right', trunkX + CARD_OFFSET, startY)

  const trunkBottomY = Math.max(leftBottom, rightBottom, startY)
  const height = trunkBottomY + MARGIN_BOTTOM

  return { width, height, rootX: trunkX, rootY, trunkBottomY, groups: [...leftPos, ...rightPos] }
}
