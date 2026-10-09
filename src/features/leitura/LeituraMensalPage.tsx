import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChartLineUp, FilePdf, Minus } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import { useOSDerived } from '../../contexts/OSDataContext'
import { useOSMotivos } from '../../hooks/useOSMotivos'
import { ultimosMeses } from '../reincidencias/reincidenciasMatriz'
import { buildLeituraMensal, osParaLer, sinal, sinalPP, type BlocoRevisita, type Contribuicao, type Frase, type LeituraCidade, type LeituraMensal, type Tom } from './leituraMensal'
import { exportLeituraMensalPDF } from './leituraMensalPDF'

const MESES = ultimosMeses(13)
const MESES_TENDENCIA = 6

const COR_TOM: Record<Tom, string> = { piora: 'text-red', melhora: 'text-green', neutro: 'text-secondary' }
const FUNDO_TOM: Record<Tom, string> = { piora: 'bg-red/10 text-red', melhora: 'bg-green/10 text-green', neutro: 'bg-elevated text-secondary' }
const ROTULO_SALDO: Record<Tom, string> = { piora: 'Piorou', melhora: 'Melhorou', neutro: 'Estável' }

const fmt1 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
// VTs e revisita: subir é piorar. Prazo: subir é melhorar.
const corDelta = (d: number | null, subirEhBom = false) => (d === null || d === 0 ? 'text-muted' : (d > 0) !== subirEhBom ? 'text-red' : 'text-green')

export default function LeituraMensalPage() {
  const { allRows, isLoading } = useOSDerived()
  const [mesId, setMesId] = useState(MESES[1].id) // último mês fechado

  const indice = MESES.findIndex(m => m.id === mesId)
  const meses = useMemo(() => MESES.slice(indice, indice + MESES_TENDENCIA), [indice])
  const comparados = useMemo(() => meses.slice(0, 2), [meses])

  const numos = useMemo(() => (allRows.length ? osParaLer(allRows, comparados) : []), [allRows, comparados])
  const { data: motivos, isLoading: lendo, isError: erroMotivos } = useOSMotivos(numos)
  const leitura = useMemo(() => (allRows.length ? buildLeituraMensal(allRows, meses, motivos ?? {}) : null), [allRows, meses, motivos])

  return <LeituraMensalView leitura={leitura} carregando={isLoading} lendo={lendo} erroMotivos={erroMotivos} mesId={mesId} onMes={setMesId} />
}

interface ViewProps {
  leitura: LeituraMensal | null
  carregando: boolean
  /** Lendo o motivo de abertura das OS no servidor. */
  lendo: boolean
  erroMotivos: boolean
  mesId: string
  onMes: (id: string) => void
}

/** A tela em si, sem buscar dados: recebe a leitura pronta. */
export function LeituraMensalView({ leitura, carregando, lendo, erroMotivos, mesId, onMes }: ViewProps) {
  const [cidadeSel, setCidadeSel] = useState<string | null>(null)
  const selecionada = leitura ? (leitura.cidades.find(c => c.key === cidadeSel) ?? leitura.geral) : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Leitura mensal por cidade" icon={ChartLineUp}
        description="Quanto cada cidade melhorou ou piorou no mês e de onde veio a variação"
        actions={<div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-caption font-semibold text-secondary">
            <span>Mês analisado</span>
            <select value={mesId} onChange={e => onMes(e.target.value)}
              className="min-h-11 cursor-pointer rounded-lg border border-border bg-elevated px-3 text-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              {MESES.slice(0, 12).map(m => <option key={m.id} value={m.id}>{m.label}{m.parcial ? ' (em curso)' : ''}</option>)}
            </select>
          </label>
          <button type="button" disabled={!leitura} onClick={() => leitura && exportLeituraMensalPDF(leitura)}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-label font-semibold text-white transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
            <FilePdf size={17} /> Exportar PDF
          </button>
        </div>}
      />

      {carregando && <p className="rounded-xl border border-border bg-card p-6 text-secondary">Carregando ordens…</p>}

      {leitura && (<>
        <p className="text-caption text-muted">
          {leitura.atual.label}{leitura.atual.parcial ? ' (mês em curso, números parciais)' : ''} comparado com {leitura.anterior.label}.{' '}
          {lendo ? 'Lendo o motivo de abertura das OS…'
            : erroMotivos ? 'Não foi possível ler o motivo das OS agora: a leitura sai sem a quebra por motivo.'
            : `Motivo de abertura lido em ${leitura.cobertura.lidas} de ${leitura.cobertura.total} VTs.`}
        </p>

        <section aria-label="Resumo por cidade" className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-label">
              <thead>
                <tr className="text-caption uppercase tracking-wide text-muted">
                  <th className="border-b border-border px-4 py-2.5 font-semibold">Cidade</th>
                  <th className="border-b border-border px-3 py-2.5 text-right font-semibold">VTs abertas</th>
                  <th className="border-b border-border px-3 py-2.5 text-right font-semibold">Revisita manut.</th>
                  <th className="border-b border-border px-3 py-2.5 text-right font-semibold">Revisita inst.</th>
                  <th className="border-b border-border px-3 py-2.5 text-right font-semibold">VT no prazo</th>
                </tr>
              </thead>
              <tbody>
                {[...leitura.cidades, leitura.geral].map(c => {
                  const ativa = selecionada?.key === c.key
                  const geral = c.key === leitura.geral.key
                  return (
                    <tr key={c.key} onClick={() => setCidadeSel(geral ? null : c.key)} aria-selected={ativa}
                      className={`cursor-pointer transition-colors ${ativa ? 'bg-primary/10' : 'hover:bg-elevated/60'} ${geral ? 'font-bold' : ''}`}>
                      <th scope="row" className="border-b border-border/60 px-4 py-3 text-left font-normal">
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" onClick={e => { e.stopPropagation(); setCidadeSel(geral ? null : c.key) }}
                            className="cursor-pointer text-left font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
                            {c.cidade}
                          </button>
                          <SaldoTag tom={c.saldo} />
                        </div>
                        <p className="mt-1 max-w-2xl text-caption leading-snug text-muted">{c.porqueSaldo}</p>
                      </th>
                      <td className="border-b border-border/60 px-3 py-3 text-right tabular-nums">
                        <span className="font-semibold text-text">{c.vt.atual.toLocaleString('pt-BR')}</span>{' '}
                        <span className={`text-caption ${corDelta(c.vt.delta)}`}>{c.vt.anterior || c.vt.atual ? `${sinal(c.vt.delta)}${c.vt.pct !== null ? ` (${sinalPP(c.vt.pct)}%)` : ''}` : ''}</span>
                      </td>
                      <CelulaTaxa r={c.manut} />
                      <CelulaTaxa r={c.inst} />
                      <td className="border-b border-border/60 px-3 py-3 text-right tabular-nums">
                        {c.vt.noPrazoAtual === null ? <span className="text-muted">—</span> : <>
                          <span className="font-semibold text-text">{fmt1(c.vt.noPrazoAtual)}%</span>{' '}
                          {c.vt.noPrazoAnterior !== null && <span className={`text-caption ${corDelta(c.vt.noPrazoAtual - c.vt.noPrazoAnterior, true)}`}>{sinalPP(Math.round((c.vt.noPrazoAtual - c.vt.noPrazoAnterior) * 10) / 10)} pp</span>}
                        </>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border px-4 py-2 text-caption text-muted">Clique numa cidade para ver de onde veio a variação. Variação contra {leitura.anterior.label}; pp = pontos percentuais.</p>
        </section>

        {selecionada && <DetalheCidade c={selecionada} meses={{ atual: leitura.atual.label, anterior: leitura.anterior.label }} />}

        <p className="rounded-xl border border-border bg-card p-4 text-caption leading-relaxed text-secondary">
          Esta leitura mostra <b className="text-text">onde e com quem</b> a variação aconteceu: bairros, equipes e motivos que somaram ou tiraram OS.
          O <b className="text-text">porquê</b> de uma melhora, como uma troca de splitter, um treinamento ou uma auditoria, não fica registrado no ERP.
          Para ligar a variação a uma ação, a ação precisa ser anotada com data e local.
        </p>
      </>)}
    </div>
  )
}

function SaldoTag({ tom, title }: { tom: Tom; title?: string }) {
  const Icone = tom === 'piora' ? ArrowUp : tom === 'melhora' ? ArrowDown : Minus
  return <span title={title} className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-caption font-semibold ${FUNDO_TOM[tom]}`}><Icone size={12} weight="bold" aria-hidden="true" />{ROTULO_SALDO[tom]}</span>
}

function CelulaTaxa({ r }: { r: BlocoRevisita }) {
  if (r.taxaAtual === null) return <td className="border-b border-border/60 px-3 py-3 text-right text-muted">—</td>
  return (
    <td className="border-b border-border/60 px-3 py-3 text-right tabular-nums" title={`${r.reincAtual} reincidentes de ${r.baseAtual} atendidos`}>
      <span className="font-semibold text-text">{fmt1(r.taxaAtual)}%</span>{' '}
      {r.deltaPP !== null && <span className={`text-caption ${corDelta(r.deltaPP)}`}>{sinalPP(r.deltaPP)} pp</span>}
    </td>
  )
}

interface Meses { atual: string; anterior: string }

function DetalheCidade({ c, meses }: { c: LeituraCidade; meses: Meses }) {
  return (
    <section aria-label={`Leitura de ${c.cidade}`} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-body font-bold text-text">{c.cidade}</h2>
          <SaldoTag tom={c.saldo} />
        </div>
        <p className="text-label text-secondary">{c.porqueSaldo}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Bloco titulo="VTs abertas" frases={c.frases.vt} listas={[
          { titulo: 'Por bairro', itens: c.vt.porBairro },
          { titulo: 'Por motivo de abertura', itens: c.vt.porMotivo },
        ]} meses={meses} />
        <Bloco titulo="Revisita de manutenção" frases={c.frases.manut} listas={[
          { titulo: 'Equipe da visita de origem', itens: c.manut.porEquipe },
          { titulo: 'Por bairro (clientes)', itens: c.manut.porBairro },
          { titulo: 'O que a equipe fez na origem', itens: c.manut.porAcaoOrigem },
        ]} meses={meses} />
        <Bloco titulo="Revisita de instalação" frases={c.frases.inst} listas={[
          { titulo: 'Equipe da instalação', itens: c.inst.porEquipe },
          { titulo: 'Por bairro (clientes)', itens: c.inst.porBairro },
          { titulo: 'Motivo do retorno', itens: c.inst.porMotivoRetorno },
        ]} meses={meses} />
      </div>

      <div>
        <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted">Últimos meses</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-label">
            <thead>
              <tr className="text-caption text-muted">
                <th className="border-b border-border px-3 py-2 font-semibold" />
                {c.tendencia.map(t => <th key={t.id} className="border-b border-border px-3 py-2 text-right font-semibold tabular-nums">{t.label}{t.parcial ? '*' : ''}</th>)}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr><th scope="row" className="px-3 py-2 font-semibold text-secondary">VTs abertas</th>{c.tendencia.map(t => <td key={t.id} className="px-3 py-2 text-right text-text">{t.vts}</td>)}</tr>
              <tr><th scope="row" className="px-3 py-2 font-semibold text-secondary">Revisita manut.</th>{c.tendencia.map(t => <td key={t.id} className="px-3 py-2 text-right text-text">{t.taxaManut === null ? '—' : `${fmt1(t.taxaManut)}%`}</td>)}</tr>
              <tr><th scope="row" className="px-3 py-2 font-semibold text-secondary">Revisita inst.</th>{c.tendencia.map(t => <td key={t.id} className="px-3 py-2 text-right text-text">{t.taxaInst === null ? '—' : `${fmt1(t.taxaInst)}%`}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function Bloco({ titulo, frases, listas, meses }: { titulo: string; frases: Frase[]; listas: Array<{ titulo: string; itens: Contribuicao[] }>; meses: Meses }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <h3 className="text-label font-bold text-text">{titulo}</h3>
      {frases.length ? (
        <ul className="space-y-1.5">
          {frases.map((f, i) => (
            <li key={i} className="flex gap-2 text-label leading-relaxed text-secondary">
              <span aria-hidden="true" className={`mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full ${f.tom === 'piora' ? 'bg-red' : f.tom === 'melhora' ? 'bg-green' : 'bg-muted'}`} />
              <span className={i === 0 ? `font-semibold ${COR_TOM[f.tom] === 'text-secondary' ? 'text-text' : COR_TOM[f.tom]}` : ''}>{f.texto}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-label text-muted">Sem movimento nos dois meses.</p>}
      {listas.map(l => <ListaContribuicao key={l.titulo} titulo={l.titulo} itens={l.itens} meses={meses} />)}
    </article>
  )
}

const LIMITE_LISTA = 5

// Colunas em ordem do tempo — mês anterior, mês analisado, variação — para "de 19 para 4" ler da esquerda para a direita.
function ListaContribuicao({ titulo, itens, meses }: { titulo: string; itens: Contribuicao[]; meses: Meses }) {
  const [todas, setTodas] = useState(false)
  const relevantes = itens.filter(i => i.atual || i.anterior)
  if (!relevantes.length) return null
  const ordenadas = [...relevantes].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.atual - a.atual)
  const visiveis = todas ? ordenadas : ordenadas.slice(0, LIMITE_LISTA)
  return (
    <div>
      <table className="w-full text-label tabular-nums">
        <thead>
          <tr className="text-caption text-muted">
            <th className="pb-1 text-left font-semibold uppercase tracking-wide">{titulo}</th>
            <th className="w-14 pb-1 text-right font-semibold">{meses.anterior}</th>
            <th className="w-14 pb-1 text-right font-semibold">{meses.atual}</th>
            <th className="w-12 pb-1 text-right font-semibold">Var.</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map(i => (
            <tr key={i.key} className="border-b border-border/40 last:border-0">
              <td className="max-w-0 truncate py-1 pr-2 text-text" title={i.label}>{i.label}</td>
              <td className="py-1 text-right text-muted">{i.anterior}</td>
              <td className="py-1 text-right font-semibold text-text">{i.atual}</td>
              <td className={`py-1 text-right font-semibold ${corDelta(i.delta)}`}>{sinal(i.delta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ordenadas.length > LIMITE_LISTA && (
        <button type="button" onClick={() => setTodas(v => !v)} className="mt-1 min-h-9 cursor-pointer text-caption font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
          {todas ? 'Mostrar menos' : `Ver todos (${ordenadas.length})`}
        </button>
      )}
    </div>
  )
}
