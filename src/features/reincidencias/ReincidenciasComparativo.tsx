import { useMemo, useState } from 'react'
import { FileCsv, FilePdf, MagnifyingGlass } from '@phosphor-icons/react'
import { buildInstallChurn, buildManutencaoRevisitaChurn } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'
import { exportComparativoPDF } from './reincidenciasComparativoPDF'
import {
  METRICAS, formatarValor, formatarVariacao, montarTabela, tabelaParaCSV, ultimosMeses,
  type MetricaComparativo,
} from './reincidenciasMatriz'
import { buildBairroComparativo, cidadeCurta, filterReincidentes, type PeriodoComparativo } from './reincidenciasReport'

const FORNECEDORES = ['WES', 'Instacable', 'THM', 'REDE', 'MANUTENCAO', 'INTERNO', 'OUTRO']
const TIPOS = [
  { id: 'manutencao', label: 'Revisita de manutenção' },
  { id: 'instalacao', label: 'Revisita de instalação' },
] as const
type TipoRevisita = typeof TIPOS[number]['id']

const MESES_OPCOES = ultimosMeses(12)
const LINHAS_INICIAIS = 30

/** Cor do mapa de calor por faixa do máximo — classes fixas, sem valor arbitrário. */
function classeCalor(valor: number | null, maximo: number): string {
  if (!valor || !maximo) return ''
  const r = valor / maximo
  return r > 0.75 ? 'bg-orange/40' : r > 0.5 ? 'bg-orange/30' : r > 0.25 ? 'bg-orange/20' : 'bg-orange/10'
}

const corVariacao = (v: number | null) => (v === null || v === 0 ? 'text-muted' : v > 0 ? 'text-red' : 'text-green')

function baixar(nome: string, conteudo: string, mime: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: mime }))
  const a = document.createElement('a')
  a.href = url; a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const btn = 'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-4 text-label font-semibold text-text transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60'

/** Comparativo entre meses: uma linha por bairro, uma coluna por mês escolhido. */
export function ReincidenciasComparativo({ allRows }: { allRows: OSRow[] }) {
  const [tipo, setTipo] = useState<TipoRevisita>('manutencao')
  const [metrica, setMetrica] = useState<MetricaComparativo>('os')
  const [selecionados, setSelecionados] = useState<string[]>(() => MESES_OPCOES.slice(0, 3).map(m => m.id))
  const [fornecedor, setFornecedor] = useState('')
  const [cidade, setCidade] = useState('')
  const [busca, setBusca] = useState('')
  const [todas, setTodas] = useState(false)

  const meses = useMemo(() => MESES_OPCOES.filter(m => selecionados.includes(m.id)).reverse(), [selecionados])  // do mais antigo ao mais novo
  const construir = tipo === 'instalacao' ? buildInstallChurn : buildManutencaoRevisitaChurn
  const tipoLabel = TIPOS.find(t => t.id === tipo)!.label

  // Cada mês é calculado com a mesma regra do relatório, sobre o intervalo do mês inteiro.
  const brutos = useMemo(() => meses.map(m => ({ mes: m, churn: construir(allRows, Number.POSITIVE_INFINITY, new Date(), { from: m.from, to: m.to }) })), [meses, construir, allRows])
  const cidades = useMemo(() => [...new Set(brutos.flatMap(b => b.churn.clientes.map(c => c.cidade)))].filter(Boolean).sort(), [brutos])
  const periodos = useMemo((): PeriodoComparativo[] => brutos.map(({ mes, churn }) => ({
    id: mes.id, label: mes.label,
    clientes: filterReincidentes(churn.clientes, { fornecedor, equipe: '', cidade }),
    base: filterReincidentes(churn.baseClientes ?? [], { fornecedor, equipe: '', cidade }),
  })), [brutos, fornecedor, cidade])

  const comparativo = useMemo(() => (periodos.length ? buildBairroComparativo(periodos) : null), [periodos])
  const tabela = useMemo(() => (comparativo ? montarTabela(comparativo, metrica) : null), [comparativo, metrica])
  const linhas = useMemo(() => {
    if (!tabela) return []
    const termo = busca.trim().toLowerCase()
    return termo ? tabela.linhas.filter(l => l.label.toLowerCase().includes(termo) || l.cidade.toLowerCase().includes(termo)) : tabela.linhas
  }, [tabela, busca])
  const visiveis = todas || busca ? linhas : linhas.slice(0, LINHAS_INICIAIS)

  const semDados = brutos.filter(b => b.churn.totalBase === 0).map(b => b.mes.label)
  const parciais = meses.filter(m => m.parcial).map(m => m.label)
  const filtros = [fornecedor ? `Terceira: ${fornecedor}` : 'Todas as terceiras', cidade ? `Cidade: ${cidade}` : 'Todas as cidades']

  const alternarMes = (id: string) => setSelecionados(atual => (atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id]))
  const ultimos = (n: number) => setSelecionados(MESES_OPCOES.slice(0, n).map(m => m.id))

  const exportarCSV = () => {
    if (!tabela) return
    const slug = tipo === 'instalacao' ? 'instalacao' : 'manutencao'
    baixar(`comparativo-bairros-${slug}-${tabela.colunas[0].id}${tabela.colunas.length > 1 ? `_${tabela.colunas[tabela.colunas.length - 1].id}` : ''}.csv`, tabelaParaCSV(tabela, tipoLabel), 'text/csv;charset=utf-8')
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Configuração do comparativo" className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-caption font-semibold text-secondary sm:flex-none">
            <span>Tipo de revisita</span>
            <select value={tipo} onChange={e => setTipo(e.target.value as TipoRevisita)} className="min-h-11 cursor-pointer rounded-lg border border-border bg-elevated px-3 text-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-caption font-semibold text-secondary sm:flex-none">
            <span>Valor mostrado</span>
            <select value={metrica} onChange={e => setMetrica(e.target.value as MetricaComparativo)} className="min-h-11 cursor-pointer rounded-lg border border-border bg-elevated px-3 text-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              {METRICAS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-caption font-semibold text-secondary sm:flex-none">
            <span>Terceira</span>
            <select value={fornecedor} onChange={e => setFornecedor(e.target.value)} className="min-h-11 cursor-pointer rounded-lg border border-border bg-elevated px-3 text-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <option value="">Todas as terceiras</option>
              {FORNECEDORES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-caption font-semibold text-secondary sm:flex-none">
            <span>Cidade</span>
            <select value={cidade} onChange={e => setCidade(e.target.value)} className="min-h-11 cursor-pointer rounded-lg border border-border bg-elevated px-3 text-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <option value="">Todas as cidades</option>
              {cidades.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <p className="text-caption font-semibold text-secondary">Meses para comparar</p>
            <button type="button" onClick={() => ultimos(3)} className="cursor-pointer rounded-lg px-2 py-1 text-caption font-semibold text-primary hover:bg-primary/10">Últimos 3</button>
            <button type="button" onClick={() => ultimos(6)} className="cursor-pointer rounded-lg px-2 py-1 text-caption font-semibold text-primary hover:bg-primary/10">Últimos 6</button>
            <button type="button" onClick={() => ultimos(12)} className="cursor-pointer rounded-lg px-2 py-1 text-caption font-semibold text-primary hover:bg-primary/10">12 meses</button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Meses para comparar">
            {[...MESES_OPCOES].reverse().map(m => {
              const ativo = selecionados.includes(m.id)
              return (
                <button key={m.id} type="button" aria-pressed={ativo} onClick={() => alternarMes(m.id)}
                  className={`min-h-11 cursor-pointer rounded-lg border px-3 text-label font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${ativo ? 'border-primary bg-primary/15 text-primary' : 'border-border text-secondary hover:bg-elevated'}`}>
                  {m.label}{m.parcial ? '*' : ''}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-caption text-muted">
            {METRICAS.find(m => m.id === metrica)?.hint}.{' '}
            {tipo === 'instalacao' ? 'Em cada mês entram os clientes instalados no mês anterior, cuja janela de 30 dias fecha nele. ' : ''}
            * mês em curso (parcial).
          </p>
        </div>
      </section>

      {!meses.length && <p className="rounded-xl border border-border bg-card p-6 text-secondary">Escolha pelo menos um mês para montar o comparativo.</p>}

      {tabela && (
        <section aria-label="Comparativo por bairro" className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 className="text-body font-bold text-text">{tipoLabel}: bairro por mês</h2>
              <p className="text-caption text-secondary">
                {tabela.linhas.length} {tabela.linhas.length === 1 ? 'bairro' : 'bairros'} · {filtros.join(' · ')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative">
                <span className="sr-only">Buscar bairro</span>
                <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar bairro…"
                  className="min-h-11 w-52 rounded-lg border border-border bg-elevated pl-9 pr-3 text-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" />
              </label>
              <button type="button" className={btn} disabled={!tabela.linhas.length} onClick={exportarCSV}><FileCsv size={17} /> Excel (CSV)</button>
              <button type="button" disabled={!tabela.linhas.length}
                onClick={() => exportComparativoPDF(tabela, { tipo: tipoLabel, filtros, parciais })}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-label font-semibold text-white transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
                <FilePdf size={17} /> PDF
              </button>
            </div>
          </div>

          {semDados.length > 0 && (
            <p role="status" className="border-b border-border bg-orange/10 px-4 py-2 text-caption text-orange">
              Sem OS carregadas em {semDados.join(', ')}: o histórico desse mês pode não estar na base atual.
            </p>
          )}

          {!tabela.linhas.length ? (
            <p className="p-6 text-secondary">Nenhuma revisita nos meses e filtros selecionados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-label">
                <thead>
                  <tr className="text-caption uppercase tracking-wide text-muted">
                    <th className="sticky left-0 z-10 border-b border-border bg-card px-4 py-2 font-semibold">Bairro</th>
                    <th className="border-b border-border px-3 py-2 font-semibold">Cidade</th>
                    {tabela.colunas.map(c => <th key={c.id} className="border-b border-border px-3 py-2 text-right font-semibold tabular-nums">{c.label}</th>)}
                    {tabela.metrica !== 'taxa' && <th className="border-b border-border px-3 py-2 text-right font-semibold">Total</th>}
                    <th className="border-b border-border px-3 py-2 text-right font-semibold">{tabela.metrica === 'taxa' ? 'Var. (pp)' : 'Var.'}</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(l => (
                    <tr key={l.key} className="hover:bg-elevated/60">
                      <th scope="row" title={l.variantes.length > 1 ? `${l.variantes.length} grafias reunidas: ${l.variantes.join(' · ')}` : undefined}
                        className="sticky left-0 z-10 max-w-64 truncate border-b border-border/60 bg-card px-4 py-2 font-semibold text-text">
                        {l.label}{l.variantes.length > 1 && <span className="ml-1.5 text-caption font-normal text-muted" aria-label={`${l.variantes.length} grafias reunidas`}>({l.variantes.length})</span>}
                      </th>
                      <td className="whitespace-nowrap border-b border-border/60 px-3 py-2 text-secondary">{cidadeCurta(l.cidade)}</td>
                      {l.valores.map((v, i) => {
                        const d = l.detalhes[i]
                        return (
                          <td key={tabela.colunas[i].id} title={`${tabela.colunas[i].label}: ${d.nOS} OS · ${d.nClientes} clientes${d.taxa !== null ? ` · taxa ${formatarValor(d.taxa, 'taxa')}` : ''}`}
                            className={`border-b border-border/60 px-3 py-2 text-right tabular-nums ${classeCalor(v, tabela.maximo)} ${v ? 'font-semibold text-text' : 'text-muted'}`}>
                            {v === null ? '—' : v === 0 && tabela.metrica !== 'taxa' ? '·' : formatarValor(v, tabela.metrica)}
                          </td>
                        )
                      })}
                      {tabela.metrica !== 'taxa' && <td className="border-b border-border/60 px-3 py-2 text-right font-bold tabular-nums text-text">{formatarValor(l.total, tabela.metrica)}</td>}
                      <td className={`border-b border-border/60 px-3 py-2 text-right font-semibold tabular-nums ${corVariacao(l.variacao)}`}>{formatarVariacao(l.variacao, tabela.metrica) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold text-text">
                    <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-2.5">Total</th>
                    <td className="px-3 py-2.5" />
                    {tabela.totais.map((v, i) => <td key={tabela.colunas[i].id} className="px-3 py-2.5 text-right tabular-nums">{formatarValor(v, tabela.metrica)}</td>)}
                    {tabela.metrica !== 'taxa' && <td className="px-3 py-2.5 text-right tabular-nums">{formatarValor(tabela.totalGeral, tabela.metrica)}</td>}
                    <td className={`px-3 py-2.5 text-right tabular-nums ${corVariacao(tabela.variacaoGeral)}`}>{formatarVariacao(tabela.variacaoGeral, tabela.metrica) || '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {!busca && !todas && linhas.length > LINHAS_INICIAIS && (
            <div className="border-t border-border p-3 text-center">
              <button type="button" onClick={() => setTodas(true)} className="min-h-11 cursor-pointer rounded-lg px-4 text-label font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                Mostrar todos os {linhas.length} bairros
              </button>
              <p className="mt-1 text-caption text-muted">Mostrando os {LINHAS_INICIAIS} maiores; a exportação leva todos.</p>
            </div>
          )}
          {parciais.length > 0 && <p className="border-t border-border px-4 py-2 text-caption text-muted">Mês em curso (parcial): {parciais.join(', ')}.</p>}
        </section>
      )}
    </div>
  )
}
