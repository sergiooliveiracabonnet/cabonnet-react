// Gera imagem PNG de alta qualidade com OS agrupadas por equipe, ordenadas por volume (menor → maior)

export interface CaptureOSRow {
  nomedaequipe?:    string | null
  _situacaoEfetiva?: string | null
  _aging?:          number | null
  _slaCritico?:     boolean
  numos?:           string | null
  nomecliente?:     string | null
  dataagendamento?: string | null
  nomedacidade?:    string | null
  bairro?:          string | null
  tiposervico?:     string | null
  periodo?:         string | null
  codigocliente?:   string | null
  logradouro?:      string | null
  numero?:          string | null
  complemento?:     string | null
  descsituacao?:    string | null
  [key: string]:    unknown
}

interface GroupAccum { pendente: number; atend: number; aging: number[]; criticas: number }
interface GroupSummary { equipe: string; total: number; pendente: number; atend: number; aging: string | null; criticas: number }
type ColDef = { key: string; label: string; x: number; w: number; align: CanvasTextAlign }

const SCALE   = 2        // 2× para alta qualidade (Retina)
const W       = 740      // largura lógica em px
const ROW_H   = 36
const HDR_H   = 74       // cabeçalho principal
const COL_H   = 30       // cabeçalho de colunas
const FOOT_H  = 28       // rodapé

// Paleta escura
const DARK = {
  bg:          '#0d1117',
  bgHdr:       '#111827',
  bgColHdr:    '#0f1a27',
  bgAlt:       '#0f1520',
  bgTotal:     '#131f2e',
  bgFoot:      '#080f1a',
  bgEqEven:    '#111d2e',
  bgEqOdd:     '#0f1a28',
  bgPerSin:    'rgba(255,255,255,0.03)',
  text:        '#e2e8f0',
  dim:         '#94a3b8',
  muted:       '#4a6480',
  border:      'rgba(255,255,255,0.06)',
  borderSoft:  'rgba(255,255,255,0.08)',
  borderFaint: 'rgba(255,255,255,0.025)',
  red:         '#f87171',
  yellow:      '#facc15',
  green:       '#4ade80',
  cyan:        '#3b82f6',
}

// Paleta clara
const LIGHT = {
  bg:          '#ffffff',
  bgHdr:       '#f0f4ff',
  bgColHdr:    '#e8edf8',
  bgAlt:       '#f7f9fc',
  bgTotal:     '#eff6ff',
  bgFoot:      '#f0f4ff',
  bgEqEven:    '#f0f4ff',
  bgEqOdd:     '#e8edf8',
  bgPerSin:    'rgba(0,0,0,0.03)',
  text:        '#0f172a',
  dim:         '#334155',
  muted:       '#64748b',
  border:      'rgba(0,0,0,0.08)',
  borderSoft:  'rgba(0,0,0,0.10)',
  borderFaint: 'rgba(0,0,0,0.05)',
  red:         '#dc2626',
  yellow:      '#b45309',
  green:       '#16a34a',
  cyan:        '#0284c7',
}

let C = DARK

function getTheme() {
  return document.documentElement.classList.contains('light') ? LIGHT : DARK
}

// Definição das colunas
const COLS: ColDef[] = [
  { key: 'equipe',   label: 'EQUIPE',       x: 16,  w: 218, align: 'left'   },
  { key: 'total',    label: 'OS',           x: 238, w: 52,  align: 'center' },
  { key: 'pendente', label: 'PENDENTE',     x: 294, w: 80,  align: 'center' },
  { key: 'atend',    label: 'ATENDIMENTO',  x: 378, w: 80,  align: 'center' },
  { key: 'aging',    label: 'AGING MÉD.',  x: 462, w: 85,  align: 'center' },
  { key: 'criticas', label: 'SLA CRÍTICO', x: 551, w: 80,  align: 'center' },
]

type Ctx2D = CanvasRenderingContext2D

function rect(ctx: Ctx2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function line(ctx: Ctx2D, x1: number, y1: number, x2: number, y2: number, color = C.border) {
  ctx.strokeStyle = color
  ctx.lineWidth   = 1
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

interface TextOpts { font?: string; color?: string; align?: CanvasTextAlign; maxW?: number }
function text(ctx: Ctx2D, str: unknown, x: number, y: number, { font = '12px Arial', color = C.text, align = 'left' as CanvasTextAlign, maxW }: TextOpts = {}) {
  ctx.font      = font
  ctx.fillStyle = color
  ctx.textAlign = align
  if (maxW) {
    // trunca com ellipsis se necessário
    let s = String(str)
    while (ctx.measureText(s).width > maxW && s.length > 2) s = s.slice(0, -1)
    if (s.length < String(str).length) s = s.slice(0, -1) + '…'
    ctx.fillText(s, x, y)
  } else {
    ctx.fillText(String(str), x, y)
  }
  ctx.textAlign = 'left'
}

/**
 * Captura OS agrupadas por equipe como PNG base64 data URI.
 * @param {object[]} rows          - Array de OS já filtradas pelo fornecedor
 * @param {string}   fornLabel     - Nome do fornecedor para o cabeçalho
 * @param {string}   accentColor   - Cor de destaque (#hex)
 * @returns {string}               - data URI "data:image/png;base64,..."
 */
export function captureOSPorEquipe(rows: CaptureOSRow[], fornLabel: string, accentColor = '#3b82f6'): string {
  C = getTheme()
  // ── Agrupar por equipe ────────────────────────────────────────────────────
  const map = new Map<string, GroupAccum>()
  for (const r of rows) {
    const eq = r.nomedaequipe?.trim() || '(Sem Equipe)'
    if (!map.has(eq)) map.set(eq, { pendente: 0, atend: 0, aging: [], criticas: 0 })
    const g = map.get(eq)!
    if (r._situacaoEfetiva === 'Pendente')    g.pendente++
    if (r._situacaoEfetiva === 'Atendimento') g.atend++
    if (r._aging != null)                     g.aging.push(r._aging)
    if (r._slaCritico)                        g.criticas++
  }

  const groups: GroupSummary[] = [...map.entries()]
    .sort((a, b) => (a[1].pendente + a[1].atend) - (b[1].pendente + b[1].atend))
    .map(([equipe, g]) => {
      const total = g.pendente + g.atend
      const agingMed = g.aging.length
        ? (g.aging.reduce((s, v) => s + v, 0) / g.aging.length).toFixed(1)
        : null
      return { equipe, total, pendente: g.pendente, atend: g.atend, aging: agingMed, criticas: g.criticas }
    })

  // Totais
  const allAging = rows.filter(r => r._aging != null).map(r => r._aging as number)
  const totalAging = allAging.length
    ? (allAging.reduce((s, v) => s + v, 0) / allAging.length).toFixed(1)
    : null
  const totalCrit = groups.reduce((s, g) => s + g.criticas, 0)
  const totalPend = groups.reduce((s, g) => s + g.pendente, 0)
  const totalAtend = groups.reduce((s, g) => s + g.atend, 0)

  // ── Canvas ────────────────────────────────────────────────────────────────
  const HEIGHT = HDR_H + COL_H + groups.length * ROW_H + ROW_H + FOOT_H
  const canvas  = document.createElement('canvas')
  canvas.width  = W * SCALE
  canvas.height = HEIGHT * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  // Fundo geral
  rect(ctx, 0, 0, W, HEIGHT, C.bg)

  // ── Cabeçalho ─────────────────────────────────────────────────────────────
  rect(ctx, 0, 0, W, HDR_H, C.bgHdr)
  rect(ctx, 0, 0, 4, HDR_H, accentColor)                  // barra lateral colorida

  text(ctx, 'CABONNET · Ordens por Fornecedor', 20, 26,
    { font: 'bold 16px Arial', color: C.text })
  text(ctx, fornLabel.toUpperCase(), 20, 46,
    { font: 'bold 13px Arial', color: accentColor })

  const now = new Date()
  const ts  = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  text(ctx, ts, 20, 63, { font: '10px Arial', color: C.muted })

  text(ctx, `${rows.length} OS · ${groups.length} equipes · Alertas | Cabonnet`, W - 16, 46,
    { font: '11px Arial', color: C.dim, align: 'right' })

  line(ctx, 0, HDR_H, W, HDR_H)

  // ── Cabeçalho de colunas ─────────────────────────────────────────────────
  rect(ctx, 0, HDR_H, W, COL_H, C.bgColHdr)
  for (const col of COLS) {
    const tx = col.align === 'center' ? col.x + col.w / 2 : col.x
    text(ctx, col.label, tx, HDR_H + 19,
      { font: 'bold 9px Arial', color: C.muted, align: col.align })
  }
  line(ctx, 0, HDR_H + COL_H, W, HDR_H + COL_H)

  // ── Linhas de dados ───────────────────────────────────────────────────────
  const dataY = HDR_H + COL_H
  groups.forEach((row, i) => {
    const y = dataY + i * ROW_H
    rect(ctx, 0, y, W, ROW_H, i % 2 === 1 ? C.bgAlt : C.bg)

    if (i > 0) line(ctx, 16, y, W - 16, y, C.borderFaint)

    const cy = y + 23

    for (const col of COLS) {
      const tx = col.align === 'center' ? col.x + col.w / 2 : col.x
      const al = col.align

      if (col.key === 'equipe') {
        text(ctx, row.equipe, tx, cy,
          { font: '12px Arial', color: C.text, align: al, maxW: col.w - 4 })

      } else if (col.key === 'total') {
        text(ctx, row.total, tx, cy,
          { font: 'bold 13px Arial', color: C.text, align: al })

      } else if (col.key === 'criticas') {
        const c = row.criticas > 0 ? C.red : C.muted
        const f = row.criticas > 0 ? 'bold 12px Arial' : '12px Arial'
        text(ctx, row.criticas > 0 ? row.criticas : '—', tx, cy, { font: f, color: c, align: al })

      } else if (col.key === 'aging') {
        const v = row.aging
        const agColor = v != null
          ? (parseFloat(v) >= 6 ? C.red : parseFloat(v) >= 3 ? C.yellow : C.dim)
          : C.muted
        text(ctx, v != null ? `${v}d` : '—', tx, cy, { font: '12px Arial', color: agColor, align: al })

      } else {
        const v = (row as unknown as Record<string, number>)[col.key]
        text(ctx, v > 0 ? v : '—', tx, cy,
          { font: '12px Arial', color: v > 0 ? C.dim : C.muted, align: al })
      }
    }
  })

  // ── Linha de total ────────────────────────────────────────────────────────
  const totalY = dataY + groups.length * ROW_H
  rect(ctx, 0, totalY, W, ROW_H, C.bgTotal)
  line(ctx, 0, totalY, W, totalY)

  const tcy = totalY + 23
  for (const col of COLS) {
    const tx = col.align === 'center' ? col.x + col.w / 2 : col.x
    const al = col.align

    if (col.key === 'equipe') {
      text(ctx, 'TOTAL', tx, tcy, { font: 'bold 11px Arial', color: C.dim, align: al })
    } else if (col.key === 'total') {
      text(ctx, rows.length, tx, tcy, { font: 'bold 13px Arial', color: C.text, align: al })
    } else if (col.key === 'pendente') {
      text(ctx, totalPend, tx, tcy, { font: 'bold 12px Arial', color: C.dim, align: al })
    } else if (col.key === 'atend') {
      text(ctx, totalAtend, tx, tcy, { font: 'bold 12px Arial', color: C.dim, align: al })
    } else if (col.key === 'aging') {
      const agColor = totalAging != null
        ? (parseFloat(totalAging) >= 6 ? C.red : parseFloat(totalAging) >= 3 ? C.yellow : C.dim)
        : C.muted
      text(ctx, totalAging != null ? `${totalAging}d` : '—', tx, tcy,
        { font: 'bold 12px Arial', color: agColor, align: al })
    } else if (col.key === 'criticas') {
      const c = totalCrit > 0 ? C.red : C.muted
      text(ctx, totalCrit > 0 ? totalCrit : '—', tx, tcy,
        { font: 'bold 12px Arial', color: c, align: al })
    }
  }

  // ── Rodapé ────────────────────────────────────────────────────────────────
  const footY = totalY + ROW_H
  rect(ctx, 0, footY, W, FOOT_H, C.bgFoot)
  line(ctx, 0, footY, W, footY)
  text(ctx, 'Dashboard Cabonnet · Gerado automaticamente', 16, footY + 18,
    { font: '10px Arial', color: C.muted })

  return canvas.toDataURL('image/png')
}

// ─────────────────────────────────────────────────────────────────────────────
// Relatório DETALHADO — lista todas as OS individualmente por equipe
// ─────────────────────────────────────────────────────────────────────────────

const DW       = 740      // mesma largura do resumo
const D_ROW_H  = 27       // altura de linha de OS
const D_EQ_H   = 32       // altura do cabeçalho de equipe
const D_HDR_H  = 70       // cabeçalho principal
const D_COL_H  = 27       // cabeçalho de colunas
const D_FOOT_H = 26

const D_STATUS_COLOR: Record<string, string> = {
  'Pendente':     '#facc15',
  'Atendimento':  '#3b82f6',
  'Concluída':    '#4ade80',
  'Reagendamento':'#f97316',
}

const D_COLS: ColDef[] = [
  { key: 'numos',    label: 'Nº OS',    x: 16,  w: 72,  align: 'left'   },
  { key: 'cliente',  label: 'Cliente',  x: 92,  w: 175, align: 'left'   },
  { key: 'cidade',   label: 'Cidade',   x: 271, w: 100, align: 'left'   },
  { key: 'tipo',     label: 'Tipo',     x: 375, w: 88,  align: 'left'   },
  { key: 'aging',    label: 'Aging',    x: 467, w: 52,  align: 'center' },
  { key: 'agend',    label: 'Agend.',   x: 523, w: 72,  align: 'center' },
  { key: 'status',   label: 'Situação', x: 599, w: 125, align: 'left'   },
]

/**
 * Relatório detalhado: todas as OS listadas individualmente por equipe.
 * Equipes ordenadas da menor para a maior; OS ordenadas por aging desc dentro de cada equipe.
 * @param {object[]} rows        - OS já filtradas pelo fornecedor
 * @param {string}   fornLabel   - Nome do fornecedor para o cabeçalho
 * @param {string}   accentColor - Cor de destaque (#hex)
 * @returns {string}             - data URI "data:image/png;base64,..."
 */
export function captureOSDetalhado(rows: CaptureOSRow[], fornLabel: string, accentColor = '#3b82f6'): string {
  C = getTheme()
  // ── Agrupar e ordenar ─────────────────────────────────────────────────────
  const map = new Map<string, CaptureOSRow[]>()
  for (const r of rows) {
    const eq = r.nomedaequipe?.trim() || '(Sem Equipe)'
    if (!map.has(eq)) map.set(eq, [])
    map.get(eq)!.push(r)
  }

  // Equipes: menor → maior; dentro de cada equipe, aging desc (mais crítico primeiro)
  const groups = [...map.entries()]
    .sort((a, b) => a[1].length - b[1].length)
    .map(([equipe, osList]) => ({
      equipe,
      osList: [...osList].sort((a, b) => (b._aging ?? 0) - (a._aging ?? 0)),
    }))

  // ── Calcular altura total ─────────────────────────────────────────────────
  const totalRows = groups.reduce((s, g) => s + g.osList.length, 0)
  const HEIGHT = D_HDR_H + D_COL_H + groups.length * D_EQ_H + totalRows * D_ROW_H + D_FOOT_H

  const canvas  = document.createElement('canvas')
  canvas.width  = DW * SCALE
  canvas.height = HEIGHT * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  // Fundo geral
  rect(ctx, 0, 0, DW, HEIGHT, C.bg)

  // ── Cabeçalho principal ───────────────────────────────────────────────────
  rect(ctx, 0, 0, DW, D_HDR_H, C.bgHdr)
  rect(ctx, 0, 0, 4, D_HDR_H, accentColor)

  text(ctx, 'CABONNET · Relatório Detalhado por Equipe', 20, 24,
    { font: 'bold 15px Arial', color: C.text })
  text(ctx, fornLabel.toUpperCase(), 20, 43,
    { font: 'bold 12px Arial', color: accentColor })

  const now = new Date()
  const ts  = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  text(ctx, ts, 20, 60, { font: '10px Arial', color: C.muted })

  text(ctx, `${rows.length} OS · ${groups.length} equipes · menor → maior`, DW - 16, 43,
    { font: '11px Arial', color: C.dim, align: 'right' })
  text(ctx, 'Alertas | Cabonnet', DW - 16, 60,
    { font: '10px Arial', color: C.muted, align: 'right' })

  line(ctx, 0, D_HDR_H, DW, D_HDR_H)

  // ── Cabeçalho de colunas ─────────────────────────────────────────────────
  rect(ctx, 0, D_HDR_H, DW, D_COL_H, C.bgColHdr)
  for (const col of D_COLS) {
    const tx = col.align === 'center' ? col.x + col.w / 2 : col.x
    text(ctx, col.label.toUpperCase(), tx, D_HDR_H + 18,
      { font: 'bold 8.5px Arial', color: C.muted, align: col.align })
  }
  line(ctx, 0, D_HDR_H + D_COL_H, DW, D_HDR_H + D_COL_H)

  // ── Grupos de equipes ─────────────────────────────────────────────────────
  let curY = D_HDR_H + D_COL_H

  groups.forEach((group, gi) => {
    // Cabeçalho da equipe
    const eqBg = gi % 2 === 0 ? C.bgEqEven : C.bgEqOdd
    rect(ctx, 0, curY, DW, D_EQ_H, eqBg)
    rect(ctx, 0, curY, 3, D_EQ_H, accentColor)   // barra lateral colorida

    // Nome da equipe (abreviado se necessário)
    const eqShort = group.equipe.length > 38 ? group.equipe.slice(0, 36) + '…' : group.equipe
    text(ctx, eqShort, 12, curY + D_EQ_H / 2 + 5,
      { font: 'bold 11px Arial', color: C.text })

    // Contagem de OS à direita
    text(ctx, `${group.osList.length} OS`, DW - 16, curY + D_EQ_H / 2 + 5,
      { font: 'bold 11px Arial', color: accentColor, align: 'right' })

    line(ctx, 0, curY + D_EQ_H, DW, D_EQ_H + curY, C.borderSoft)
    curY += D_EQ_H

    // Linhas individuais de OS
    group.osList.forEach((r, ri) => {
      const rowBg = ri % 2 === 0 ? C.bg : C.bgAlt
      rect(ctx, 0, curY, DW, D_ROW_H, rowBg)

      if (ri > 0) line(ctx, 16, curY, DW - 16, curY, C.borderFaint)

      const cy = curY + D_ROW_H / 2 + 4.5

      for (const col of D_COLS) {
        const tx = col.align === 'center' ? col.x + col.w / 2 : col.x
        const al = col.align

        if (col.key === 'numos') {
          text(ctx, r.numos ?? '—', tx, cy,
            { font: 'bold 10.5px Arial', color: C.cyan, align: al })

        } else if (col.key === 'cliente') {
          text(ctx, r.nomecliente ?? '—', tx, cy,
            { font: '10.5px Arial', color: C.text, align: al, maxW: col.w - 4 })

        } else if (col.key === 'cidade') {
          text(ctx, r.nomedacidade ?? '—', tx, cy,
            { font: '10.5px Arial', color: C.dim, align: al, maxW: col.w - 4 })

        } else if (col.key === 'tipo') {
          const tipoShort = (r.tiposervico ?? '').replace(/instalac[aã]o/i, 'INST.')
            .replace(/manutenc[aã]o/i, 'MANUT.').replace(/rede\s+interna/i, 'REDE')
          text(ctx, tipoShort || '—', tx, cy,
            { font: '10px Arial', color: C.dim, align: al, maxW: col.w - 2 })

        } else if (col.key === 'aging') {
          const a = r._aging ?? 0
          const agColor = a >= 6 ? C.red : a >= 3 ? C.yellow : C.dim
          text(ctx, `${a}d`, tx, cy,
            { font: a >= 3 ? 'bold 10.5px Arial' : '10.5px Arial', color: agColor, align: al })

        } else if (col.key === 'agend') {
          const ag = (r.dataagendamento ?? '').slice(0, 10)
          text(ctx, ag ? ag.slice(0, 5) : '—', tx, cy,
            { font: '10px Arial', color: ag ? C.dim : C.muted, align: al })

        } else if (col.key === 'status') {
          const st = r._situacaoEfetiva || r.descsituacao || '—'
          const stColor = D_STATUS_COLOR[st] ?? C.muted
          text(ctx, st, tx, cy,
            { font: '10.5px Arial', color: stColor, align: al, maxW: col.w - 4 })
        }
      }

      curY += D_ROW_H
    })
  })

  // ── Rodapé ────────────────────────────────────────────────────────────────
  rect(ctx, 0, curY, DW, D_FOOT_H, C.bgFoot)
  line(ctx, 0, curY, DW, curY)
  text(ctx, 'Dashboard Cabonnet · Gerado automaticamente', 16, curY + 17,
    { font: '10px Arial', color: C.muted })
  text(ctx, `${totalRows} ordens de serviço`, DW - 16, curY + 17,
    { font: '10px Arial', color: C.muted, align: 'right' })

  return canvas.toDataURL('image/png')
}

// ─────────────────────────────────────────────────────────────────────────────
// Relação por Período (Manhã / Tarde) — para copiar direto no WhatsApp
// ─────────────────────────────────────────────────────────────────────────────

const P_HDR_H  = 72
const P_COL_H  = 28
const P_PER_H  = 34
const P_ROW_H  = 27
const P_FOOT_H = 28

const P_STATUS_COLORS: Record<string, string> = {
  'Pendente':      '#facc15',
  'Atendimento':   '#3b82f6',
  'Concluída':     '#4ade80',
  'Reagendamento': '#f97316',
}

const P_PERIOD_ORDER = ['manhã', 'tarde']

// Metadados das colunas — a largura é calculada dinamicamente a partir do conteúdo
// real (medição de texto no canvas) para que nenhuma informação seja truncada.
interface PColMeta { key: string; label: string; align: CanvasTextAlign; min: number; fixed?: boolean }
const P_COL_META: PColMeta[] = [
  { key: 'aging',   label: 'AGING',    align: 'center', min: 46, fixed: true },
  { key: 'numos',   label: 'Nº OS',    align: 'left',   min: 60  },
  { key: 'cliente', label: 'CLIENTE',  align: 'left',   min: 110 },
  { key: 'tipo',    label: 'TIPO',     align: 'left',   min: 64  },
  { key: 'cidade',  label: 'CIDADE',   align: 'left',   min: 74  },
  { key: 'bairro',  label: 'BAIRRO',   align: 'left',   min: 90  },
  { key: 'logr',    label: 'ENDEREÇO', align: 'left',   min: 110 },
  { key: 'status',  label: 'SITUAÇÃO', align: 'left',   min: 88  },
]

const P_CELL_PAD = 18      // folga horizontal dentro de cada célula
const P_MAX_COL  = 460     // teto de segurança p/ um valor patológico não estourar a imagem

interface PCell { str: string; font: string }
interface PProcRow { raw: CaptureOSRow; aging: number; cells: Record<string, PCell> }

// Pré-calcula o texto e a fonte de cada célula (mesmas transformações usadas na
// renderização) para que medição e desenho usem exatamente a mesma string.
function buildPeriodoCells(r: CaptureOSRow): PProcRow {
  const nomeDisplay = r.nomecliente || (r.codigocliente ? `Cód. ${r.codigocliente}` : '(Sem nome)')
  const tipo = (r.tiposervico ?? '')
    .replace(/instalac[aã]o/i, 'INST.').replace(/manutenc[aã]o/i, 'MANUT.') || '—'
  const cidade = (r.nomedacidade || '—').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  const bairro = (r.bairro || '—').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  const addr = [r.logradouro, r.numero, r.complemento].filter(Boolean).join(', ') || '—'
  return {
    raw:   r,
    aging: r._aging ?? 0,
    cells: {
      numos:   { str: String(r.numos ?? '—'), font: 'bold 10.5px Arial' },
      cliente: { str: nomeDisplay,            font: r.nomecliente ? '10.5px Arial' : 'italic 10px Arial' },
      tipo:    { str: tipo,                   font: '10px Arial' },
      cidade:  { str: cidade,                 font: '10px Arial' },
      bairro:  { str: bairro,                 font: '10.5px Arial' },
      logr:    { str: addr,                   font: '10px Arial' },
      status:  { str: r._situacaoEfetiva || '—', font: '10px Arial' },
    },
  }
}

function pillRect(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, r: number, color: string) {
  const x = cx - w / 2, y = cy - h / 2
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

/**
 * Gera um canvas com as OS agrupadas por Período (Manhã / Tarde), ordenadas por bairro.
 * Retorna o elemento canvas — o chamador converte em Blob para clipboard ou download.
 */
export function captureOSPorPeriodo(rows: CaptureOSRow[], equipeName: string): HTMLCanvasElement {
  C = getTheme()
  const map: Record<string, PProcRow[]> = {}
  for (const r of rows) {
    const p = (r.periodo || '').trim() || 'Sem Período'
    ;(map[p] = map[p] || []).push(buildPeriodoCells(r))
  }
  for (const p of Object.keys(map)) {
    map[p].sort((a, b) => (a.raw.bairro || '').localeCompare(b.raw.bairro || '', 'pt-BR'))
  }
  const groups = Object.entries(map).sort(([a], [b]) => {
    const ia = P_PERIOD_ORDER.indexOf(a.toLowerCase())
    const ib = P_PERIOD_ORDER.indexOf(b.toLowerCase())
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  const allProc = groups.flatMap(([, rs]) => rs)
  const totalOS = allProc.length

  // ── Larguras dinâmicas: cada coluna fica do tamanho do maior conteúdo ──────
  const measCtx = document.createElement('canvas').getContext('2d')!
  const cols = P_COL_META.map(m => ({ ...m, x: 0, w: m.min }))
  for (const col of cols) {
    if (col.fixed) {
      col.w = col.min
      continue
    }
    measCtx.font = 'bold 8.5px Arial'
    let maxW = measCtx.measureText(col.label).width
    for (const pr of allProc) {
      const cell = pr.cells[col.key]
      measCtx.font = cell.font
      const w = measCtx.measureText(cell.str).width
      if (w > maxW) maxW = w
    }
    col.w = Math.min(P_MAX_COL, Math.max(col.min, Math.ceil(maxW) + P_CELL_PAD))
  }
  let cursorX = 16
  for (const col of cols) {
    col.x = cursorX
    cursorX += col.w
  }
  const colMap = Object.fromEntries(cols.map(c => [c.key, c]))
  const pw = cursorX + 16

  const HEIGHT  = P_HDR_H + P_COL_H + groups.reduce((s, [, rs]) => s + P_PER_H + rs.length * P_ROW_H, 0) + P_FOOT_H

  const canvas  = document.createElement('canvas')
  canvas.width  = pw * SCALE
  canvas.height = HEIGHT * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  rect(ctx, 0, 0, pw, HEIGHT, C.bg)

  // Cabeçalho
  rect(ctx, 0, 0, pw, P_HDR_H, C.bgHdr)
  rect(ctx, 0, 0, 4, P_HDR_H, '#3b82f6')
  text(ctx, 'CABONNET · Relação de OS por Período', 20, 26,
    { font: 'bold 15px Arial', color: C.text })
  text(ctx, equipeName || 'Todas as Equipes', 20, 46,
    { font: 'bold 12px Arial', color: '#3b82f6' })
  const now = new Date()
  const ts  = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  text(ctx, ts, 20, 62, { font: '10px Arial', color: C.muted })
  text(ctx, `${totalOS} OS · ${groups.length} período(s) · ordenado por bairro`, pw - 16, 46,
    { font: '11px Arial', color: C.dim, align: 'right' })
  line(ctx, 0, P_HDR_H, pw, P_HDR_H)

  // Cabeçalho de colunas
  rect(ctx, 0, P_HDR_H, pw, P_COL_H, C.bgColHdr)
  for (const col of cols) {
    const tx = col.align === 'center' ? col.x + col.w / 2 : col.x
    text(ctx, col.label, tx, P_HDR_H + 18,
      { font: 'bold 8.5px Arial', color: C.muted, align: col.align })
  }
  line(ctx, 0, P_HDR_H + P_COL_H, pw, P_HDR_H + P_COL_H)

  let curY = P_HDR_H + P_COL_H

  groups.forEach(([periodo, periodoRows]) => {
    const isManha = periodo.toLowerCase().includes('manh')
    const isTarde = periodo.toLowerCase().includes('tarde')
    const pColor  = isManha ? '#f59e0b' : isTarde ? '#818cf8' : C.dim
    const pBg     = isManha ? 'rgba(245,158,11,0.07)' : isTarde ? 'rgba(129,140,248,0.07)' : C.bgPerSin

    rect(ctx, 0, curY, pw, P_PER_H, pBg)
    line(ctx, 0, curY, pw, curY, C.borderSoft)
    ctx.fillStyle = pColor
    ctx.beginPath()
    ctx.arc(26, curY + P_PER_H / 2, 4, 0, Math.PI * 2)
    ctx.fill()
    text(ctx, `PERÍODO: ${periodo.toUpperCase()}`, 38, curY + P_PER_H / 2 + 4.5,
      { font: 'bold 10.5px Arial', color: pColor })
    text(ctx, `${periodoRows.length} OS`, pw - 16, curY + P_PER_H / 2 + 4.5,
      { font: '10px Arial', color: C.muted, align: 'right' })
    line(ctx, 0, curY + P_PER_H, pw, curY + P_PER_H, C.border)
    curY += P_PER_H

    periodoRows.forEach((pr, ri) => {
      const r = pr.raw
      rect(ctx, 0, curY, pw, P_ROW_H, ri % 2 === 0 ? C.bg : C.bgAlt)
      if (ri > 0) line(ctx, 16, curY, pw - 16, curY, C.borderFaint)

      const cy     = curY + P_ROW_H / 2 + 4.5
      const aging  = pr.aging
      const agColor = aging >= 6 ? C.red : aging >= 3 ? C.yellow : C.cyan
      const agBg    = aging >= 6 ? 'rgba(248,113,113,0.15)' : aging >= 3 ? 'rgba(250,204,21,0.15)' : 'rgba(59,130,246,0.12)'
      const agCX   = colMap.aging.x + colMap.aging.w / 2

      pillRect(ctx, agCX, curY + P_ROW_H / 2, 32, 16, 8, agBg)
      text(ctx, `${aging}d`, agCX, cy, { font: 'bold 10px Arial', color: agColor, align: 'center' })
      text(ctx, pr.cells.numos.str, colMap.numos.x, cy, { font: pr.cells.numos.font, color: '#3b82f6' })
      const nomeColor = r.nomecliente ? C.text : C.muted
      text(ctx, pr.cells.cliente.str, colMap.cliente.x, cy,
        { font: pr.cells.cliente.font, color: nomeColor, maxW: colMap.cliente.w - 6 })
      text(ctx, pr.cells.tipo.str, colMap.tipo.x, cy,
        { font: pr.cells.tipo.font, color: C.muted, maxW: colMap.tipo.w - 6 })
      text(ctx, pr.cells.cidade.str, colMap.cidade.x, cy,
        { font: pr.cells.cidade.font, color: C.dim, maxW: colMap.cidade.w - 6 })
      text(ctx, pr.cells.bairro.str, colMap.bairro.x, cy,
        { font: pr.cells.bairro.font, color: C.dim, maxW: colMap.bairro.w - 6 })
      text(ctx, pr.cells.logr.str, colMap.logr.x, cy,
        { font: pr.cells.logr.font, color: C.muted, maxW: colMap.logr.w - 6 })
      const stColor = P_STATUS_COLORS[r._situacaoEfetiva ?? ''] ?? C.muted
      text(ctx, pr.cells.status.str, colMap.status.x, cy,
        { font: pr.cells.status.font, color: stColor, maxW: colMap.status.w - 6 })

      curY += P_ROW_H
    })
  })

  // Rodapé
  rect(ctx, 0, curY, pw, P_FOOT_H, C.bgFoot)
  line(ctx, 0, curY, pw, curY)
  text(ctx, 'Dashboard Cabonnet · Gerado automaticamente', 16, curY + 17,
    { font: '10px Arial', color: C.muted })
  text(ctx, `${totalOS} ordens de serviço`, pw - 16, curY + 17,
    { font: '10px Arial', color: C.muted, align: 'right' })

  return canvas
}
