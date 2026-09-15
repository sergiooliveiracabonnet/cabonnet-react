import { forwardRef } from 'react'
import { layoutMindMap, ROOT_R, GROUP_W, GROUP_H, LEAF_D } from './escalaMindMapLayout'
import type { MindMapGroup } from './escalaMindMap'
import { EMPRESA_COLOR } from './escalaConstants'

const HEADER_H = 176
const FOOTER_H = 64
const PAD_X    = 44

const KIND_LABEL: Record<MindMapGroup['kind'], string> = {
  cidade: 'Cidade', atividade: 'Atividade', indisponivel: 'Indisponível',
}
const KIND_DOT: Record<MindMapGroup['kind'], string> = {
  cidade: '#3b82f6', atividade: '#facc15', indisponivel: '#f87171',
}

function firstName(nome: string): string {
  return (nome || '').trim().split(/\s+/)[0] || ''
}

/** Fita de nível no canto superior direito da pílula — mesmo recurso visual
 *  de organogramas de estoque (retângulo com ponta de bandeira embaixo). */
function RibbonTag({ x, y, color, label }: { x: number; y: number; color: string; label: string }) {
  const w = 20 + label.length * 7.2
  const h = 26
  const tailX = x - 16
  return (
    <g>
      <path
        d={`M ${x - w} ${y} H ${x} V ${y + h + 9} L ${tailX} ${y + h} L ${x - w} ${y + h + 9} Z`}
        fill={color}
      />
      <text x={x - w / 2} y={y + h / 2 + 4.5} fontSize={12} fontWeight={800} fill="#ffffff"
            textAnchor="middle" letterSpacing={0.3}>
        {label.toUpperCase()}
      </text>
    </g>
  )
}

/** Avatar em anel parcial (arco ~270°) — imita o círculo de foto "aberto" do
 *  organograma de referência. `content` fica no meio do círculo branco. */
function RingAvatar({ cx, cy, r, color, content, filled }: {
  cx: number; cy: number; r: number; color: string; content: string; filled?: boolean
}) {
  const circumference = 2 * Math.PI * r
  const arc = circumference * 0.74
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={5}
              strokeDasharray={`${arc} ${circumference}`} strokeLinecap="round"
              transform={`rotate(128 ${cx} ${cy})`} />
      <circle cx={cx} cy={cy} r={r - 9} fill={filled ? color : '#ffffff'} filter="url(#mm-shadow-sm)" />
      <text x={cx} y={cy + 5.5} fontSize={r > 30 ? 18 : 13} fontWeight={800}
            fill={filled ? '#ffffff' : '#0f172a'} textAnchor="middle">
        {content}
      </text>
    </g>
  )
}

export const EscalaMindMapSvg = forwardRef<SVGSVGElement, {
  groups:      MindMapGroup[]
  dateTitle:   string   // "SEG · 14/09/2026"
  generatedAt: string   // "Gerado em 14/09/2026 17:40"
}>(function EscalaMindMapSvg({ groups, dateTitle, generatedAt }, ref) {
  const layout = layoutMindMap(groups)
  const width  = layout.width
  const height = layout.height + HEADER_H + FOOTER_H
  const totalEquipes = groups.reduce((s, g) => s + g.equipes.length, 0)
  const [dow, dateStr] = dateTitle.split('·').map(s => s.trim())
  const rootAvatarR = ROOT_R

  return (
    <svg
      ref={ref}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      <defs>
        <radialGradient id="mm-center" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
        <filter id="mm-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.16" />
        </filter>
        <filter id="mm-shadow-sm" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.16" />
        </filter>
      </defs>

      <rect x={0} y={0} width={width} height={height} fill="#ffffff" />

      {/* ── Cabeçalho ── */}
      <rect x={0} y={0} width={width} height={HEADER_H} fill="#f8fafc" />
      <rect x={0} y={HEADER_H - 4} width={width} height={4} fill="#1e293b" />

      <text x={PAD_X} y={50} fontSize={14} fontWeight={700} letterSpacing={2} fill="#64748b">
        CABONNET · ESCALA DO DIA
      </text>
      <text x={width - PAD_X} y={50} fontSize={13} fontWeight={600} fill="#64748b" textAnchor="end">
        {groups.length} grupo{groups.length === 1 ? '' : 's'} · {totalEquipes} equipe{totalEquipes === 1 ? '' : 's'}
      </text>

      <text x={PAD_X} y={124} fontSize={38} fontWeight={800} fill="#0f172a">
        {dow} <tspan fill="#94a3b8" fontWeight={600} fontSize={30}>· {dateStr}</tspan>
      </text>

      <g transform={`translate(${width - PAD_X}, 100)`} textAnchor="end">
        {(['indisponivel', 'atividade', 'cidade'] as const).map((kind, i) => (
          <g key={kind} transform={`translate(0, ${i * 24})`}>
            <circle cx={-108} cy={-4} r={6} fill={KIND_DOT[kind]} />
            <text x={0} y={0} fontSize={13} fontWeight={600} fill="#334155">{KIND_LABEL[kind]}</text>
          </g>
        ))}
      </g>

      {/* ── Organograma ── */}
      {groups.length === 0 ? (
        <text x={width / 2} y={HEADER_H + layout.height / 2} fontSize={16} fill="#94a3b8" textAnchor="middle">
          Nenhuma equipe com escala preenchida neste dia
        </text>
      ) : (
        <g transform={`translate(0, ${HEADER_H})`}>
          {/* Tronco central — raiz até a última linha de grupos */}
          <line x1={layout.rootX} y1={layout.rootY + rootAvatarR} x2={layout.rootX} y2={layout.trunkBottomY}
                stroke="#cbd5e1" strokeWidth={2.5} />
          {/* Ramo horizontal do tronco até a lateral de cada grupo (esquerda ou direita) */}
          {layout.groups.map(g => (
            <line key={`rg-${g.key}`}
                  x1={layout.rootX} y1={g.y}
                  x2={g.side === 'left' ? g.x + GROUP_W / 2 : g.x - GROUP_W / 2} y2={g.y}
                  stroke="#cbd5e1" strokeWidth={2.5} />
          ))}

          {/* Conectores em ângulo reto — grupo → suas equipes.
              As equipes ficam num cluster de 2 colunas (não uma fileira só),
              então um "barramento" único na altura da 1ª linha faria a linha
              da 2ª/3ª linha passar por trás do círculo de cima — parecendo
              uma corrente (F13→F20→F47) como se uma dependesse da outra,
              quando são todas equipes irmãs do mesmo grupo. Em vez disso, uma
              espinha vertical desce pelo meio (entre as duas colunas, nunca
              atrás de um círculo) e cada equipe recebe um traço horizontal
              curto na altura da própria linha. */}
          {layout.groups.map(g => {
            if (g.leaves.length === 0) return null
            const groupBottom = g.y + GROUP_H / 2
            const maxLeafY = Math.max(...g.leaves.map(l => l.y))
            return (
              <g key={`gl-${g.key}`}>
                <line x1={g.x} y1={groupBottom} x2={g.x} y2={maxLeafY} stroke={g.color} strokeWidth={2} opacity={0.55} />
                {g.leaves.map(leaf => {
                  const dir = leaf.x > g.x ? -1 : leaf.x < g.x ? 1 : 0
                  const edgeX = leaf.x + dir * (LEAF_D / 2)
                  return (
                    <line key={`gl-${leaf.codigo}-${leaf.segundoLocal}`}
                          x1={g.x} y1={leaf.y} x2={edgeX} y2={leaf.y}
                          stroke={g.color} strokeWidth={2} opacity={0.55}
                          strokeDasharray={leaf.segundoLocal ? '4 3' : undefined} />
                  )
                })}
              </g>
            )
          })}

          {/* Nó raiz — dia selecionado */}
          <circle cx={layout.rootX} cy={layout.rootY} r={rootAvatarR} fill="url(#mm-center)" filter="url(#mm-shadow)" />
          <text x={layout.rootX} y={layout.rootY - 7} fontSize={18} fontWeight={800} fill="#ffffff" textAnchor="middle">
            {dow}
          </text>
          <text x={layout.rootX} y={layout.rootY + 16} fontSize={14} fontWeight={600} fill="#93c5fd" textAnchor="middle">
            {dateStr}
          </text>

          {/* Grupos — pílula + fita + avatar */}
          {layout.groups.map(g => {
            const pillLeft = g.x - GROUP_W / 2
            const pillTop  = g.y - GROUP_H / 2
            return (
              <g key={`grp-${g.key}`}>
                <rect x={pillLeft} y={pillTop} width={GROUP_W} height={GROUP_H} rx={GROUP_H / 2}
                      fill="#ffffff" stroke={g.color} strokeWidth={1.75} filter="url(#mm-shadow)" />
                <RibbonTag x={pillLeft + GROUP_W} y={pillTop - 7} color={g.color} label={KIND_LABEL[g.kind]} />
                <text x={pillLeft + 62} y={g.y - 4} fontSize={17} fontWeight={800} fill="#0f172a">
                  {g.label}
                </text>
                <text x={pillLeft + 62} y={g.y + 16} fontSize={12} fontWeight={600} fill="#94a3b8">
                  {g.equipes.length} equipe{g.equipes.length === 1 ? '' : 's'}
                </text>
                <RingAvatar cx={pillLeft + 6} cy={g.y} r={35} color={g.color} content={String(g.equipes.length)} filled />
              </g>
            )
          })}

          {/* Equipes — círculo + legenda embaixo */}
          {layout.groups.flatMap(g => g.leaves.map(leaf => (
            <g key={`leaf-${leaf.codigo}-${leaf.segundoLocal}`}>
              <circle cx={leaf.x} cy={leaf.y} r={LEAF_D / 2} fill="#ffffff" stroke={g.color}
                      strokeWidth={leaf.segundoLocal ? 2 : 3} strokeDasharray={leaf.segundoLocal ? '4 3' : undefined}
                      filter="url(#mm-shadow-sm)" />
              <circle cx={leaf.x} cy={leaf.y - LEAF_D / 2 + 10} r={5} fill={EMPRESA_COLOR[leaf.empresa]} />
              <text x={leaf.x} y={leaf.y + 6} fontSize={14} fontWeight={800} fill="#0f172a" textAnchor="middle">
                {leaf.codigo}
              </text>
              <text x={leaf.x} y={leaf.y + LEAF_D / 2 + 20} fontSize={11.5} fontWeight={600} fill="#334155" textAnchor="middle">
                {firstName(leaf.tecnico)}
              </text>
              {leaf.segundoLocal && (
                <text x={leaf.x} y={leaf.y + LEAF_D / 2 + 34} fontSize={9.5} fill="#94a3b8" textAnchor="middle">
                  2º local
                </text>
              )}
            </g>
          )))}
        </g>
      )}

      {/* ── Rodapé ── */}
      <line x1={0} y1={height - FOOTER_H} x2={width} y2={height - FOOTER_H} stroke="#e2e8f0" strokeWidth={1} />
      <text x={PAD_X} y={height - FOOTER_H / 2 + 4} fontSize={12} fill="#94a3b8">{generatedAt}</text>
      <text x={width - PAD_X} y={height - FOOTER_H / 2 + 4} fontSize={12} fill="#94a3b8" textAnchor="end">
        Cabonnet ISP · Sistema Interno
      </text>
    </svg>
  )
})
