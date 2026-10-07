import { MapPin } from '@phosphor-icons/react'
import { Modal } from '../../components/ui/Modal'
import { Bar, BarChart, ChartTooltip, Grid, XAxis, YAxis } from '../../components/ui/bar-chart'
import { fmtDate, shortEquipe } from '../../lib/osFormat'
import { cidadeCurta, getOSObservation, sortedClientRows, type BairroResumo } from './reincidenciasReport'

const TOPO_GRAFICO = 10
const TOPO_LISTA = 5

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Cartão "Revisitas por bairro": barras dos 10 bairros com mais clientes
 *  reincidentes + lista clicável (alternativa por teclado ao clique na barra). */
export function BairrosCard({ tipo, resumo, onOpen }: { tipo: string; resumo: BairroResumo[]; onOpen: (key: string) => void }) {
  const topo = resumo.slice(0, TOPO_GRAFICO)
  const totalOS = resumo.reduce((sum, b) => sum + b.nOS, 0)
  const top3 = resumo.slice(0, 3).reduce((sum, b) => sum + b.nOS, 0)

  return (
    <section aria-label={`${tipo} por bairro`}>
      <article className="min-w-0 rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-2">
          <MapPin size={17} className="mt-0.5 flex-shrink-0 text-primary" />
          <div>
            <h2 className="text-body font-bold text-text">{tipo} por bairro</h2>
            <p className="mt-0.5 text-caption text-secondary">OS envolvidas por bairro (origem + retornos) · clique para ver as ordens</p>
          </div>
        </div>

        {!resumo.length ? (
          <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-elevated/30 p-6 text-center text-label text-secondary">
            Sem revisitas para mostrar por bairro.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2" role="img" aria-label="OS envolvidas por bairro"
                 style={{ height: Math.max(180, topo.length * 30 + 30) }}>
              <BarChart data={topo} layout="vertical" margin={{ top: 2, right: 18, left: 8, bottom: 0 }} accessibilityLayer>
                <Grid />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={150}
                       tickFormatter={(value: string) => value.length > 24 ? `${value.slice(0, 23)}…` : value} />
                <ChartTooltip suffix=" OS" />
                <Bar dataKey="nOS" name="OS" fill="#fb923c" radius={[0, 4, 4, 0]} isAnimationActive={false}
                     onClick={(data: { key?: string }) => data?.key && onOpen(data.key)} />
              </BarChart>
            </div>

            <div className="min-w-0">
              <p className="text-caption text-secondary">
                {plural(resumo.length, 'bairro com revisita', 'bairros com revisita')}
                {resumo.length > 3 && <> · os 3 maiores concentram <b className="text-text">{Math.round(top3 / totalOS * 100)}%</b> das OS</>}
              </p>
              <ul className="mt-2 divide-y divide-border/60 border-t border-border">
                {resumo.slice(0, TOPO_LISTA).map(b => (
                  <li key={b.key}>
                    <button type="button" onClick={() => onOpen(b.key)}
                            className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-1 py-1.5 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60">
                      <span className="min-w-0">
                        <b className="block truncate text-label text-text">{b.label}</b>
                        <span className="block truncate text-caption text-muted">{cidadeCurta(b.cidade)}</span>
                      </span>
                      <span className="whitespace-nowrap text-right text-caption tabular-nums text-secondary">
                        <b className="text-orange">{b.nOS} OS</b><br />{plural(b.nClientes, 'cliente', 'clientes')} · {b.pct}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => onOpen(resumo[0].key)}
                      className="mt-2 min-h-11 w-full cursor-pointer rounded-lg border border-border px-3 text-label font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                Ver todos os bairros ({resumo.length})
              </button>
            </div>
          </div>
        )}
      </article>
    </section>
  )
}

/** Modal em duas colunas: bairros à esquerda, ordens do bairro escolhido à direita. */
export function BairroModal({ tipo, resumo, selectedKey, onSelect, onClose }: {
  tipo: string
  resumo: BairroResumo[]
  selectedKey: string | null
  onSelect: (key: string) => void
  onClose: () => void
}) {
  const atual = resumo.find(b => b.key === selectedKey) ?? null
  const totalClientes = resumo.reduce((sum, b) => sum + b.nClientes, 0)
  const totalOS = resumo.reduce((sum, b) => sum + b.nOS, 0)
  const maior = Math.max(1, ...resumo.map(b => b.nOS))

  return (
    <Modal open={selectedKey !== null && atual !== null} onClose={onClose} maxWidth="1100px"
           title={`${tipo} por bairro`}
           subtitle={`${plural(resumo.length, 'bairro', 'bairros')} · ${totalOS} OS envolvidas · ${plural(totalClientes, 'cliente reincidente', 'clientes reincidentes')}`}>
      {atual && (
        <div className="grid grid-cols-1 md:grid-cols-4" style={{ height: '68vh' }}>
          <nav aria-label="Bairros" className="min-h-0 overflow-y-auto border-b border-border md:col-span-1 md:border-b-0 md:border-r">
            <ul>
              {resumo.map(b => {
                const sel = b.key === atual.key
                return (
                  <li key={b.key}>
                    <button type="button" onClick={() => onSelect(b.key)} aria-current={sel ? 'true' : undefined}
                            className={`block min-h-11 w-full cursor-pointer border-b border-border/60 px-4 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 ${sel ? 'bg-primary/10' : 'hover:bg-elevated'}`}>
                      <span className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <b className={`block truncate text-label ${sel ? 'text-primary' : 'text-text'}`}>{b.label}</b>
                          <span className="block truncate text-caption text-muted">{cidadeCurta(b.cidade)}</span>
                        </span>
                        <b className="text-caption tabular-nums text-text">{b.nOS} <span className="font-normal text-muted">OS</span></b>
                      </span>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                        <span className={`block h-full rounded-full ${sel ? 'bg-primary' : 'bg-orange'}`} style={{ width: `${b.nOS / maior * 100}%` }} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="min-h-0 overflow-y-auto px-5 py-4 md:col-span-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="text-body font-bold text-text">{atual.bairro}</h3>
                <p className="text-caption text-secondary">{atual.cidade || '—'}</p>
              </div>
              <p className="text-caption tabular-nums text-secondary">
                <b className="text-orange">{atual.nOS} OS</b> · {plural(atual.nClientes, 'cliente', 'clientes')} · {atual.nRevisitas} {atual.nRevisitas === 1 ? 'revisita' : 'revisitas'} · {atual.pct}% do total
              </p>
            </div>

            <div className="mt-3 space-y-3">
              {atual.clientes.map(cliente => (
                <article key={cliente.chave} className="overflow-hidden rounded-xl border border-border">
                  <header className="flex items-center justify-between gap-3 bg-elevated/50 px-3 py-2">
                    <b className="min-w-0 truncate text-label text-text">{cliente.cliente}</b>
                    <span className="whitespace-nowrap text-caption tabular-nums text-secondary">
                      <b className="text-orange">{cliente.visitas} visitas</b> · média {cliente.intervaloMedio.toLocaleString('pt-BR')}d
                    </span>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-label" style={{ minWidth: 640 }}>
                      <thead>
                        <tr className="text-caption uppercase tracking-wide text-muted">
                          {['Data', 'OS', 'Equipe', 'Serviço', 'Observação'].map(h => <th key={h} className="border-b border-border px-3 py-1.5 font-semibold">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedClientRows(cliente.rows).map(row => (
                          <tr key={row.numos} className="align-top">
                            <td className="whitespace-nowrap border-b border-border/60 px-3 py-2 tabular-nums">{fmtDate(row.dataexecucao || row.databaixa) || '—'}</td>
                            <td className="border-b border-border/60 px-3 py-2 font-semibold text-primary">{row.numos}</td>
                            <td className="whitespace-nowrap border-b border-border/60 px-3 py-2">{shortEquipe(row.nomedaequipe)}</td>
                            <td className="border-b border-border/60 px-3 py-2">{String(row.servico || row.tiposervico || '—')}</td>
                            <td className="border-b border-border/60 px-3 py-2 text-secondary"><span className="line-clamp-3 whitespace-pre-line">{getOSObservation(row)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
