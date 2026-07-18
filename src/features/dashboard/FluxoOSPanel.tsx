import { useEffect, useMemo, useRef, useState } from 'react'

// Painel "Fluxo de OS — 14 dias": entradas × concluídas por dia com crosshair.
// Reusa a série diária já computada em buildGraficos (evolucao), sem builder novo.

const BLUE   = '#3b82f6'
const PURPLE = '#a78bfa'
const H = 220
const PAD_L = 30, PAD_R = 78, PAD_T = 12, PAD_B = 24
const IH = H - PAD_T - PAD_B
const DIAS_JANELA = 14

export interface FluxoEvolucao { labels: string[]; abertas: number[]; concluidas: number[] }

function fmtDia(iso: string): string {
  // 'yyyy-mm-dd' → 'dd/mm'
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

export function FluxoOSPanel({ evolucao }: { evolucao: FluxoEvolucao }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [wpx, setWpx]     = useState(0)

  // Largura real do container — 1 unidade SVG = 1px, sem distorção de aspecto
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => setWpx(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const serie = useMemo(() => {
    const n = evolucao.labels.length
    const ini = Math.max(0, n - DIAS_JANELA)
    return {
      dias:     evolucao.labels.slice(ini),
      abertas:  evolucao.abertas.slice(ini),
      concl:    evolucao.concluidas.slice(ini),
    }
  }, [evolucao])

  const len = serie.dias.length
  if (len < 2) {
    return (
      <div className="h-full rounded-lg border border-border bg-card p-5 flex items-center justify-center">
        <p className="text-muted text-label">Sem dados suficientes para o fluxo diário</p>
      </div>
    )
  }

  const W  = Math.max(320, wpx)
  const IW = W - PAD_L - PAD_R
  const totEntradas = serie.abertas.reduce((s, v) => s + v, 0)
  const totConcl    = serie.concl.reduce((s, v) => s + v, 0)
  const saldoJanela = totConcl - totEntradas  // positivo = fila encolheu
  const maxVal  = Math.max(...serie.abertas, ...serie.concl, 1)
  const maxY    = Math.max(20, Math.ceil(maxVal / 20) * 20)
  const yStep   = maxY / 4
  const x = (i: number) => PAD_L + i * (IW / (len - 1))
  const y = (v: number) => PAD_T + IH - (v / maxY) * IH
  const path = (vals: number[]) =>
    vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')

  const ultAbertas = serie.abertas[len - 1]
  const ultConcl   = serie.concl[len - 1]

  function onMove(ev: React.PointerEvent<SVGSVGElement>) {
    const rect = ev.currentTarget.getBoundingClientRect()
    const px   = ev.clientX - rect.left
    const i    = Math.round((px - PAD_L) / (IW / (len - 1)))
    setHover(Math.max(0, Math.min(len - 1, i)))
  }

  const saldoHover = hover != null ? serie.concl[hover] - serie.abertas[hover] : 0
  const tipLeft    = hover != null ? x(hover) : 0
  const tipTop     = hover != null
    ? Math.min(y(serie.abertas[hover]), y(serie.concl[hover]))
    : 0

  return (
    <div className="h-full rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-body font-semibold text-text">Fluxo de OS — {len} dias</p>
          <p className="text-caption text-muted mt-0.5">entradas × concluídas por dia · passe o mouse para detalhar</p>
        </div>
        <div className="flex gap-4 text-caption text-secondary">
          <span className="flex items-center gap-1.5">
            <svg width="14" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="14" y2="3" stroke={BLUE} strokeWidth={2} />
            </svg>
            Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="14" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="14" y2="3" stroke={PURPLE} strokeWidth={2} strokeDasharray="3.5 2.5" />
            </svg>
            Concluídas
          </span>
        </div>
      </div>

      {/* Resumo da janela — direção da fila sem precisar de hover */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-caption text-muted tabular-nums">
        <span><span className="font-semibold text-text">{totEntradas}</span> entradas no período</span>
        <span><span className="font-semibold text-text">{totConcl}</span> concluídas</span>
        <span className="font-semibold"
              style={{ color: saldoJanela > 0 ? 'rgb(var(--c-green))' : saldoJanela < 0 ? 'rgb(var(--c-orange))' : 'rgb(var(--c-muted))' }}>
          {saldoJanela > 0 ? `fila −${saldoJanela} (encolhendo)` : saldoJanela < 0 ? `fila +${-saldoJanela} (crescendo)` : 'fila estável'}
        </span>
      </div>

      <div ref={wrapRef} className="relative mt-3">
        {wpx > 0 && (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block overflow-visible"
          role="img"
          aria-label={`Gráfico de linhas: entradas e conclusões diárias nos últimos ${len} dias`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {/* grid + eixo Y */}
          {Array.from({ length: 5 }, (_, k) => k * yStep).map(v => (
            <g key={v}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)}
                    stroke="rgb(var(--c-border) / 0.6)" strokeWidth={1} />
              <text x={PAD_L - 7} y={y(v) + 3.5} textAnchor="end"
                    style={{ fill: 'rgb(var(--c-muted))', fontSize: 10 }}>{v}</text>
            </g>
          ))}
          {/* eixo X — dias alternados */}
          {serie.dias.map((d, i) => (i % 2 === 0
            ? <text key={d} x={x(i)} y={H - 4} textAnchor="middle"
                    style={{ fill: 'rgb(var(--c-muted))', fontSize: 10 }}>{fmtDia(d).slice(0, 2)}</text>
            : null
          ))}

          {/* séries — Concluídas tracejada para diferenciar sem depender só de cor */}
          <path d={path(serie.abertas)} fill="none" stroke={BLUE} strokeWidth={2} strokeLinecap="round" />
          <path d={path(serie.concl)}   fill="none" stroke={PURPLE} strokeWidth={2} strokeLinecap="round" strokeDasharray="6 4" />

          {/* pontos finais + rótulo direto */}
          <circle cx={x(len - 1)} cy={y(ultAbertas)} r={3.5} fill={BLUE}
                  stroke="rgb(var(--c-card))" strokeWidth={2} />
          <circle cx={x(len - 1)} cy={y(ultConcl)} r={3.5} fill={PURPLE}
                  stroke="rgb(var(--c-card))" strokeWidth={2} />
          <text x={x(len - 1) + 8} y={y(ultAbertas) + (ultAbertas <= ultConcl ? 12 : -6)}
                style={{ fill: 'rgb(var(--c-secondary))', fontSize: 10, fontWeight: 600 }}>
            {ultAbertas} entradas
          </text>
          <text x={x(len - 1) + 8} y={y(ultConcl) + (ultConcl < ultAbertas ? 12 : -6)}
                style={{ fill: 'rgb(var(--c-secondary))', fontSize: 10, fontWeight: 600 }}>
            {ultConcl} concluídas
          </text>

          {/* crosshair */}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={PAD_T + IH}
                    stroke="rgb(var(--c-muted) / 0.5)" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(serie.abertas[hover])} r={4} fill={BLUE}
                      stroke="rgb(var(--c-bg))" strokeWidth={2} />
              <circle cx={x(hover)} cy={y(serie.concl[hover])} r={4} fill={PURPLE}
                      stroke="rgb(var(--c-bg))" strokeWidth={2} />
            </g>
          )}
        </svg>
        )}
        {wpx === 0 && <div className="h-[220px]" />}

        {/* tooltip */}
        {hover != null && (
          <div
            className="absolute z-10 min-w-[150px] pointer-events-none rounded border border-border
                       bg-elevated px-2.5 py-2 text-caption shadow-lg"
            style={{ left: tipLeft, top: tipTop, transform: 'translate(-50%, calc(-100% - 12px))' }}
            role="status"
          >
            <p className="font-semibold text-text mb-1">{fmtDia(serie.dias[hover])}</p>
            <div className="flex items-center justify-between gap-4 text-secondary py-px">
              <span className="flex items-center gap-1.5">
                <span className="w-[7px] h-[7px] rounded-[2.5px]" style={{ background: BLUE }} /> Entradas
              </span>
              <span className="font-semibold text-text tabular-nums">{serie.abertas[hover]}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-secondary py-px">
              <span className="flex items-center gap-1.5">
                <span className="w-[7px] h-[7px] rounded-[2.5px]" style={{ background: PURPLE }} /> Concluídas
              </span>
              <span className="font-semibold text-text tabular-nums">{serie.concl[hover]}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-secondary border-t border-border mt-1 pt-1">
              <span>Saldo da fila</span>
              <span className="font-semibold tabular-nums"
                    style={{ color: saldoHover >= 0 ? 'rgb(var(--c-green))' : 'rgb(var(--c-orange))' }}>
                {saldoHover > 0 ? '−' : saldoHover < 0 ? '+' : ''}{Math.abs(saldoHover)}
              </span>
            </div>
          </div>
        )}
      </div>

      <details className="mt-2">
        <summary className="text-caption text-muted cursor-pointer hover:text-secondary">
          ver dados em tabela
        </summary>
        <table className="w-full border-collapse mt-2 text-caption">
          <thead>
            <tr>
              <th className="text-left  text-muted font-semibold px-2 py-1 border-b border-border">Dia</th>
              <th className="text-right text-muted font-semibold px-2 py-1 border-b border-border">Entradas</th>
              <th className="text-right text-muted font-semibold px-2 py-1 border-b border-border">Concluídas</th>
              <th className="text-right text-muted font-semibold px-2 py-1 border-b border-border">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {serie.dias.map((d, i) => {
              const s = serie.concl[i] - serie.abertas[i]
              return (
                <tr key={d}>
                  <td className="text-left  text-secondary px-2 py-0.5 border-b border-border/50 tabular-nums">{fmtDia(d)}</td>
                  <td className="text-right text-secondary px-2 py-0.5 border-b border-border/50 tabular-nums">{serie.abertas[i]}</td>
                  <td className="text-right text-secondary px-2 py-0.5 border-b border-border/50 tabular-nums">{serie.concl[i]}</td>
                  <td className="text-right text-secondary px-2 py-0.5 border-b border-border/50 tabular-nums">
                    {s > 0 ? '−' : s < 0 ? '+' : ''}{Math.abs(s)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>
    </div>
  )
}
