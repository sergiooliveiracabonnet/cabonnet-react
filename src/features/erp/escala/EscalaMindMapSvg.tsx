import { forwardRef } from 'react'
import { layoutMindMap } from './escalaMindMapLayout'
import type { MindMapGroup } from './escalaMindMap'
import { EMPRESA_COLOR } from './escalaConstants'

const HEADER_H = 116
const FOOTER_H = 56

const KIND_LABEL: Record<MindMapGroup['kind'], string> = {
  cidade: 'Cidade', atividade: 'Atividade', indisponivel: 'Indisponível',
}
const KIND_DOT: Record<MindMapGroup['kind'], string> = {
  cidade: '#3b82f6', atividade: '#facc15', indisponivel: '#f87171',
}

function firstName(nome: string): string {
  return (nome || '').trim().split(/\s+/)[0] || ''
}

export const EscalaMindMapSvg = forwardRef<SVGSVGElement, {
  groups:      MindMapGroup[]
  dateTitle:   string   // "SEG · 14/09/2026"
  generatedAt: string   // "Gerado em 14/09/2026 17:40"
}>(function EscalaMindMapSvg({ groups, dateTitle, generatedAt }, ref) {
  const layout = layoutMindMap(groups)
  const width  = layout.size
  const height = layout.size + HEADER_H + FOOTER_H
  const totalEquipes = groups.reduce((s, g) => s + g.equipes.length, 0)
  const [dow, dateStr] = dateTitle.split('·').map(s => s.trim())

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
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.18" />
        </filter>
        <filter id="mm-shadow-sm" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#0f172a" floodOpacity="0.14" />
        </filter>
      </defs>

      <rect x={0} y={0} width={width} height={height} fill="#ffffff" />

      {/* ── Cabeçalho ── */}
      <rect x={0} y={0} width={width} height={HEADER_H} fill="#f8fafc" />
      <rect x={0} y={HEADER_H - 3} width={width} height={3} fill="#1e293b" />
      <text x={28} y={40} fontSize={13} fontWeight={700} letterSpacing={1.5} fill="#64748b">
        CABONNET · ESCALA DO DIA
      </text>
      <text x={28} y={78} fontSize={30} fontWeight={800} fill="#0f172a">
        {dow} <tspan fill="#94a3b8" fontWeight={600}>· {dateStr}</tspan>
      </text>
      <text x={width - 28} y={40} fontSize={12} fontWeight={600} fill="#64748b" textAnchor="end">
        {groups.length} grupo{groups.length === 1 ? '' : 's'} · {totalEquipes} equipe{totalEquipes === 1 ? '' : 's'}
      </text>
      {(['cidade', 'atividade', 'indisponivel'] as const).map((kind, i) => (
        <g key={kind} transform={`translate(${width - 28 - i * 150}, 60)`} textAnchor="end">
          <circle cx={-96} cy={-4} r={5} fill={KIND_DOT[kind]} />
          <text x={0} y={0} fontSize={11} fontWeight={600} fill="#94a3b8">{KIND_LABEL[kind]}</text>
        </g>
      ))}

      {/* ── Mapa mental ── */}
      {groups.length === 0 ? (
        <text x={width / 2} y={HEADER_H + layout.size / 2} fontSize={16} fill="#94a3b8" textAnchor="middle">
          Nenhuma equipe com escala preenchida neste dia
        </text>
      ) : (
        <g transform={`translate(0, ${HEADER_H})`}>
          {layout.groups.map(g => (
            <g key={g.key}>
              {/* Ramo curvo centro → grupo */}
              <path
                d={`M ${layout.centerX} ${layout.centerY} Q ${g.ctrlX} ${g.ctrlY} ${g.x} ${g.y}`}
                fill="none" stroke={g.color} strokeWidth={5} strokeLinecap="round" opacity={0.75}
              />

              {/* Espinha grupo → cada leaf (cluster em 2 colunas) */}
              {g.leaves.map((leaf, i) => (
                <line key={`ln-${leaf.codigo}-${i}`}
                      x1={g.x} y1={g.y} x2={leaf.x} y2={leaf.y}
                      stroke={g.color} strokeWidth={1.5} opacity={0.4}
                      strokeDasharray={leaf.segundoLocal ? '4 3' : undefined} />
              ))}
            </g>
          ))}

          {/* Nó central */}
          <circle cx={layout.centerX} cy={layout.centerY} r={66} fill="url(#mm-center)" filter="url(#mm-shadow)" />
          <text x={layout.centerX} y={layout.centerY - 4} fontSize={16} fontWeight={800} fill="#ffffff" textAnchor="middle">
            {dow}
          </text>
          <text x={layout.centerX} y={layout.centerY + 18} fontSize={13} fontWeight={600} fill="#93c5fd" textAnchor="middle">
            {dateStr}
          </text>

          {layout.groups.map(g => (
            <g key={`nodes-${g.key}`}>
              {/* Nó do grupo */}
              <rect x={g.x - 74} y={g.y - 24} width={148} height={48} rx={13}
                    fill="#ffffff" stroke={g.color} strokeWidth={2} filter="url(#mm-shadow)" />
              <rect x={g.x - 74} y={g.y - 24} width={6} height={48} rx={3} fill={g.color} />
              <text x={g.x - 56} y={g.y - 3} fontSize={15} fontWeight={800} fill="#0f172a" textAnchor="start">
                {g.label}
              </text>
              <text x={g.x - 56} y={g.y + 14} fontSize={10} fontWeight={600} fill="#94a3b8" textAnchor="start">
                {g.equipes.length} equipe{g.equipes.length === 1 ? '' : 's'}
              </text>

              {/* Leaves — equipes */}
              {g.leaves.map(leaf => (
                <g key={leaf.codigo + (leaf.segundoLocal ? '-2' : '-1')} filter="url(#mm-shadow-sm)">
                  <rect x={leaf.x - 52} y={leaf.y - 17} width={104} height={34} rx={9}
                        fill="#ffffff" stroke={g.color} strokeWidth={leaf.segundoLocal ? 1 : 1.5}
                        strokeDasharray={leaf.segundoLocal ? '3 2' : undefined} strokeOpacity={0.55} />
                  <rect x={leaf.x - 52} y={leaf.y - 17} width={4} height={34} rx={2} fill={EMPRESA_COLOR[leaf.empresa]} />
                  <text x={leaf.x - 40} y={leaf.y - 3} fontSize={12} fontWeight={800} fill="#0f172a">
                    {leaf.codigo}
                  </text>
                  <text x={leaf.x - 40} y={leaf.y + 11} fontSize={9.5} fill="#64748b">
                    {firstName(leaf.tecnico)}{leaf.segundoLocal ? ' · 2º local' : ''}
                  </text>
                </g>
              ))}
            </g>
          ))}
        </g>
      )}

      {/* ── Rodapé ── */}
      <line x1={0} y1={height - FOOTER_H} x2={width} y2={height - FOOTER_H} stroke="#e2e8f0" strokeWidth={1} />
      <text x={28} y={height - 24} fontSize={11} fill="#94a3b8">{generatedAt}</text>
      <text x={width - 28} y={height - 24} fontSize={11} fill="#94a3b8" textAnchor="end">
        Cabonnet ISP · Sistema Interno
      </text>
    </svg>
  )
})
