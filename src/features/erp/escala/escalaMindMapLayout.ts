import type { MindMapGroup, MindMapLeaf } from './escalaMindMap'

export interface PositionedLeaf extends MindMapLeaf { x: number; y: number }
export interface PositionedGroup extends MindMapGroup {
  x: number; y: number
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
const ROW_GAP          = 56    // espaço entre um grupo e o próximo, na mesma coluna
const COLUMN_SPACING   = 420   // distância entre o centro de uma coluna e a próxima
const MARGIN_X         = 90
const MARGIN_TOP       = 60
const MARGIN_BOTTOM    = 60

// A imagem é pra ser vista pequena — colada num chat, numa miniatura. Uma
// coluna só de altura ilimitada (2 colunas fixas, como na versão anterior)
// virava um retrato bem comprido, que o WhatsApp/Teams encolhe tanto pra
// caber que o texto fica ilegível. Em vez de crescer só pra baixo, o
// organograma abre mais colunas conforme o dia tem mais gente escalada,
// mirando uma altura de coluna confortável — a imagem cresce mais pros
// lados e menos pra baixo à medida que o conteúdo aumenta.
const TARGET_COLUMN_HEIGHT = 620
const MIN_COLUNAS = 2
const MAX_COLUNAS = 4

function alturaDoGrupo(g: MindMapGroup): number {
  const n = g.equipes.length
  if (n === 0) return GROUP_H
  const cols = n <= 1 ? 1 : 2
  const rows = Math.ceil(n / cols)
  return GROUP_H + GAP_GROUP_LEAF + rows * LEAF_D + (rows - 1) * LEAF_ROW_GAP
}

function numeroDeColunas(groups: MindMapGroup[]): number {
  const trabalhoTotal = groups.reduce((s, g) => s + alturaDoGrupo(g) + ROW_GAP, 0)
  const ideal = Math.ceil(trabalhoTotal / TARGET_COLUMN_HEIGHT)
  return Math.max(MIN_COLUNAS, Math.min(MAX_COLUNAS, ideal))
}

/** Divide os grupos em N colunas balanceando a ALTURA real (não só a
 *  quantidade) — grupos já vêm ordenados por cidade→atividade→indisponível e
 *  por tamanho, então essa gulosa (bin-packing) deixa as colunas parecidas
 *  mesmo quando um grupo tem muito mais equipes que os outros. */
function dividirColunas(groups: MindMapGroup[], n: number): MindMapGroup[][] {
  const colunas: MindMapGroup[][] = Array.from({ length: n }, () => [])
  const alturas = new Array(n).fill(0)
  for (const g of groups) {
    let idx = 0
    for (let i = 1; i < n; i++) if (alturas[i] < alturas[idx]) idx = i
    colunas[idx].push(g)
    alturas[idx] += alturaDoGrupo(g) + ROW_GAP
  }
  return colunas
}

function layoutColuna(list: MindMapGroup[], centerX: number, startY: number): {
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
    return { ...g, x: centerX, y: groupY, leaves }
  })

  return { positioned, bottomY: y - ROW_GAP }
}

/** Organograma em N colunas penduradas num tronco central — N cresce com a
 *  quantidade de gente escalada (até um teto), pra imagem crescer mais pros
 *  lados e menos pra baixo. Cada grupo ainda tem suas equipes num cluster
 *  compacto (2 colunas) logo abaixo dele. */
export function layoutMindMap(groups: MindMapGroup[]): MindMapLayout {
  const rootY = MARGIN_TOP + ROOT_R
  const startY = rootY + ROOT_R + GAP_ROOT_GROUP

  if (groups.length === 0) {
    const width = COLUMN_SPACING + GROUP_W + MARGIN_X * 2
    return { width, height: 420, rootX: width / 2, rootY, trunkBottomY: rootY, groups: [] }
  }

  const numColunas = numeroDeColunas(groups)
  const width = (numColunas - 1) * COLUMN_SPACING + GROUP_W + MARGIN_X * 2
  const trunkX = width / 2

  const colunas = dividirColunas(groups, numColunas)
  const resultados = colunas.map((lista, i) => {
    const offset = (i - (numColunas - 1) / 2) * COLUMN_SPACING
    return layoutColuna(lista, trunkX + offset, startY)
  })

  const trunkBottomY = Math.max(startY, ...resultados.map(r => r.bottomY))
  const height = trunkBottomY + MARGIN_BOTTOM

  return {
    width, height, rootX: trunkX, rootY, trunkBottomY,
    groups: resultados.flatMap(r => r.positioned),
  }
}
