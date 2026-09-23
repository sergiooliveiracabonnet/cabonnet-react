import { useMemo, useState } from 'react'
import { CaretDown, CaretRight, Envelope, FileText, House, MapPin, Warning, Info, WarningOctagon, Crosshair, Signpost } from '@phosphor-icons/react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { SectionTitle } from '../../components/ui/SectionTitle'
import { fmtDate, shortEquipe, situacaoContratoLabel, situacaoVariant } from '../../lib/osFormat'
import type { ClienteBuscaItem, ClienteCadastro, ClienteContrato, ClienteEndereco } from '../../lib/api'
import type { OSRow } from '../../lib/types'
import { isReincidencia } from './clienteResumo'
import type { ClienteAlerta, ClienteLocalizacao, ClienteResumo, ContratoFidelidade } from './clienteResumo'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function formatCep(cep: string) {
  const d = cep.replace(/\D/g, '')
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep
}

export function enderecoTexto(e: ClienteEndereco, comCidade = true) {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(', ')
  return [rua, e.complemento, e.bairro, comCidade ? e.cidade : '', e.cep ? `CEP ${formatCep(e.cep)}` : '']
    .filter(Boolean).join(' · ')
}

function contratoVariant(situacao: number | null): string {
  if (situacao === 2) return 'green'
  if (situacao === 5 || situacao === 6) return 'red'
  if (situacao === 3 || situacao === 4) return 'orange'
  return 'secondary'
}

// ── Busca ────────────────────────────────────────────────────────────────────

export function ResultadoBusca({ item, onSelect }: { item: ClienteBuscaItem; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface/40"
    >
      <span className="font-mono text-label text-primary font-bold w-16 flex-shrink-0 pt-0.5">{item.codigocliente}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-body text-text font-semibold truncate">{item.nome || item.nomefantasia || '—'}</span>
          {item.contratos_ativos > 0
            ? <Badge variant="green">{item.contratos_ativos === 1 ? 'Ativo' : `${item.contratos_ativos} ativos`}</Badge>
            : item.contratos > 0 && <Badge variant="secondary">Sem contrato ativo</Badge>}
        </div>
        <p className="text-caption text-muted truncate">
          {[item.documento, item.nomedacidade, item.bairro].filter(Boolean).join(' · ')}
        </p>
      </div>
    </button>
  )
}

// ── Cabeçalho ────────────────────────────────────────────────────────────────

export function ClienteHeader({ cliente, localizacao }: { cliente: ClienteCadastro; localizacao: ClienteLocalizacao | null }) {
  const nome = cliente.nome || cliente.nomefantasia
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-headline text-headline font-bold text-text truncate">{nome}</h1>
            {cliente.tipopessoa && <Badge variant="secondary" dot={false}>{cliente.tipopessoa}</Badge>}
            {cliente.vip && <Badge variant="purple">VIP</Badge>}
            {cliente.bloqueio_juridico && <Badge variant="red">Bloqueio jurídico</Badge>}
          </div>
          {(cliente.nome_social || (cliente.nomefantasia && cliente.nomefantasia !== nome)) && (
            <p className="text-caption text-muted mt-0.5">
              {cliente.nome_social ? `Nome social: ${cliente.nome_social}` : `Fantasia: ${cliente.nomefantasia}`}
            </p>
          )}
          <p className="text-label text-secondary mt-1 font-mono">
            Cód. {cliente.codigocliente}{cliente.documento && ` · ${cliente.documento}`}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-label">
          <dt className="text-muted">Cliente desde</dt><dd className="text-text font-mono">{cliente.cliente_desde ?? '—'}</dd>
          <dt className="text-muted">Vencimento</dt><dd className="text-text font-mono">{cliente.dia_vencimento ? `dia ${cliente.dia_vencimento}` : '—'}</dd>
        </dl>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 text-label">
        <p className="flex items-start gap-2 text-secondary">
          <House size={14} className="text-muted flex-shrink-0 mt-0.5" />
          <span>{enderecoTexto(cliente.endereco) || 'Endereço residencial não informado'}</span>
        </p>
        <p className="flex items-start gap-2 text-secondary">
          <Envelope size={14} className="text-muted flex-shrink-0 mt-0.5" />
          <span className="break-all">{cliente.email || 'E-mail não informado'}</span>
        </p>
        {localizacao && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${localizacao.lat},${localizacao.lng}`}
            target="_blank" rel="noreferrer"
            className="flex items-start gap-2 text-primary hover:underline sm:col-span-2"
            title="Coordenada registrada pelo app de campo no início da execução"
          >
            <Crosshair size={14} className="flex-shrink-0 mt-0.5" />
            <span>Localização confirmada em campo · OS {localizacao.numos} em {localizacao.data.toLocaleDateString('pt-BR')}</span>
          </a>
        )}
      </div>
    </Card>
  )
}

// ── Alertas ──────────────────────────────────────────────────────────────────

const ALERTA_ESTILO: Record<ClienteAlerta['tom'], { icon: typeof Warning; cls: string }> = {
  critical: { icon: WarningOctagon, cls: 'border-red/30 bg-red/10 text-red' },
  warning:  { icon: Warning,        cls: 'border-orange/30 bg-orange/10 text-orange' },
  info:     { icon: Info,           cls: 'border-primary/30 bg-primary/10 text-primary' },
}

export function ClienteAlertas({ alertas }: { alertas: ClienteAlerta[] }) {
  if (!alertas.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {alertas.map(a => {
        const { icon: Icon, cls } = ALERTA_ESTILO[a.tom]
        return (
          <span key={a.texto} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-label font-medium ${cls}`}>
            <Icon size={13} weight="bold" />{a.texto}
          </span>
        )
      })}
    </div>
  )
}

// ── Painéis ──────────────────────────────────────────────────────────────────
// Os painéis ficam lado a lado em linhas de grid que esticam cada card até a
// altura do mais alto da linha. O cabeçalho é o mesmo em todos (título + uma
// linha de apoio) para o conteúdo também começar na mesma altura.

const PAINEL = 'p-4 h-full flex flex-col'

function PainelTitulo({ titulo, sub }: { titulo: string; sub: string }) {
  return (
    <div className="mb-3">
      <p className="text-label font-semibold text-text">{titulo}</p>
      <p className="text-caption text-muted">{sub}</p>
    </div>
  )
}

// ── Contratos ────────────────────────────────────────────────────────────────

function PlanoContrato({ contrato: c, fidelidade }: { contrato: ClienteContrato; fidelidade?: ContratoFidelidade }) {
  const p = c.plano
  if (!p) return null
  const resumo = [p.velocidade_mb && `${p.velocidade_mb} Mega`, p.valor != null && brl(p.valor)].filter(Boolean).join(' · ')
  return (
    <div className="mt-3 rounded-lg bg-surface/40 px-3 py-2" title={p.descricao}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption uppercase tracking-label text-muted">Plano</span>
        <span className="text-body font-semibold text-text">{resumo || p.descricao}</span>
        {p.promocional && <Badge variant="orange" dot={false}>Promoção</Badge>}
      </div>
      {fidelidade
        ? <p className="mt-0.5 text-label text-secondary">
            Fidelidade {fidelidade.meses} meses · {fidelidade.vigente ? 'até' : 'encerrada em'}{' '}
            <span className="font-mono">{fidelidade.fim.toLocaleDateString('pt-BR')}</span>
          </p>
        : p.fidelidade_meses != null && <p className="mt-0.5 text-label text-secondary">Fidelidade {p.fidelidade_meses} meses</p>}
      <p className="mt-0.5 text-caption text-muted">Lido da ficha de venda</p>
    </div>
  )
}

export function ClienteContratos({ contratos, enderecoCliente, fidelidades }: {
  contratos: ClienteContrato[]; enderecoCliente: string; fidelidades: ContratoFidelidade[]
}) {
  return (
    <Card className={PAINEL}>
      <PainelTitulo titulo={`Contratos (${contratos.length})`} sub="Situação, plano e fidelidade" />
      {contratos.length === 0 && <p className="text-label text-muted">Nenhum contrato encontrado.</p>}
      <div className="divide-y divide-hairline">
        {contratos.map(c => {
          const endereco = enderecoTexto(c.endereco, false)
          return (
            <div key={c.contrato} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-body font-bold text-text">{c.contrato}</span>
                  {c.apelido && <span className="text-caption text-muted">{c.apelido}</span>}
                  <Badge variant={contratoVariant(c.situacao)}>{situacaoContratoLabel(c.situacao) ?? '—'}</Badge>
                </div>
                {c.valor != null && c.valor > 0 && <span className="font-mono text-body font-semibold text-text">{brl(c.valor)}</span>}
              </div>
              <dl className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-label">
                <div><dt className="text-muted">Venda</dt><dd className="font-mono text-secondary">{c.datavenda ?? '—'}</dd></div>
                <div><dt className="text-muted">Instalação</dt><dd className="font-mono text-secondary">{c.datainstalacao ?? '—'}</dd></div>
                {c.empresa && <div><dt className="text-muted">Carteira</dt><dd className="text-secondary">{c.empresa}</dd></div>}
                {c.situacaoanterior != null && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-muted">Situação anterior</dt>
                    <dd className="text-secondary">
                      {situacaoContratoLabel(c.situacaoanterior)}{c.datasituacaoanterior && ` até ${c.datasituacaoanterior}`}
                    </dd>
                  </div>
                )}
              </dl>
              <PlanoContrato contrato={c} fidelidade={fidelidades.find(f => f.contrato === c.contrato)} />
              {endereco && endereco !== enderecoCliente && (
                <p className="mt-2 flex items-start gap-1.5 text-label text-secondary">
                  <MapPin size={13} className="text-muted flex-shrink-0 mt-0.5" />{endereco}
                </p>
              )}
              {c.pontoreferencia && (
                <p className="mt-1 flex items-start gap-1.5 text-label text-secondary">
                  <Signpost size={13} className="text-muted flex-shrink-0 mt-0.5" />Referência: {c.pontoreferencia}
                </p>
              )}
              {c.observacao && <ObservacaoTexto titulo="Observação do contrato" texto={c.observacao} />}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ── OS por mês ───────────────────────────────────────────────────────────────
// Uma série, 12 barras: HTML puro com tokens em vez do bar-chart (recharts),
// que ainda carrega cores em hex. Sem legenda — o título nomeia a série.

export function OSPorMes({ porMes }: { porMes: ClienteResumo['porMes'] }) {
  const max = Math.max(1, ...porMes.map(p => p.n))
  const [ativo, setAtivo] = useState<number | null>(null)
  return (
    <Card className={PAINEL}>
      <PainelTitulo titulo="OS técnicas por mês" sub="Pela data de abertura, últimos 12 meses" />
      <div className="flex min-h-28 flex-1 items-end gap-0.5" role="img"
           aria-label={porMes.map(p => `${p.mes}: ${p.n}`).join(', ')}>
        {porMes.map((p, i) => (
          <div key={p.mes} className="relative flex h-full flex-1 items-end justify-center"
               onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)}>
            {ativo === i && (
              <span className="absolute -top-1 -translate-y-full whitespace-nowrap rounded-md border border-subtle bg-elevated px-2 py-1 text-caption text-text shadow-md z-10">
                {p.mes}: <b className="font-mono">{p.n}</b> OS
              </span>
            )}
            <div
              className={`w-full max-w-6 rounded-t transition-opacity ${p.n ? 'bg-primary' : 'bg-border'} ${ativo != null && ativo !== i ? 'opacity-50' : ''}`}
              style={{ height: p.n ? `${Math.max(6, (p.n / max) * 100)}%` : '2px' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5">
        {porMes.map((p, i) => (
          <span key={p.mes} className="flex-1 text-center text-caption text-muted">
            {i % 3 === 2 || i === porMes.length - 1 ? p.mes.split('/')[0] : ''}
          </span>
        ))}
      </div>
    </Card>
  )
}

export function Ranking({ titulo, sub, itens }: { titulo: string; sub: string; itens: { label: string; n: number }[] }) {
  const max = Math.max(1, ...itens.map(i => i.n))
  return (
    <Card className={PAINEL}>
      <PainelTitulo titulo={titulo} sub={sub} />
      {itens.length === 0 && <p className="text-caption text-muted">Sem dados.</p>}
      <ul className="space-y-1.5">
        {itens.map(i => (
          <li key={i.label}>
            <div className="flex justify-between gap-2 text-label">
              <span className="truncate text-secondary" title={i.label}>{i.label}</span>
              <span className="font-mono text-text">{i.n}</span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-surface">
              <div className="h-1 rounded-full bg-primary" style={{ width: `${(i.n / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ── Observação do cadastro ───────────────────────────────────────────────────

function ObservacaoTexto({ titulo, texto }: { titulo: string; texto: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="mt-2">
      <button onClick={() => setAberto(v => !v)} className="flex w-full items-center gap-2 text-left">
        {aberto ? <CaretDown size={12} className="text-muted" /> : <CaretRight size={12} className="text-muted" />}
        <span className="text-label font-semibold text-text">{titulo}</span>
      </button>
      {aberto && <pre className="mt-2 whitespace-pre-wrap font-sans text-label text-secondary">{texto.trim()}</pre>}
    </div>
  )
}

export function ObservacaoCadastro({ texto }: { texto: string }) {
  if (!texto.trim()) return null
  return (
    <Card className={PAINEL}>
      <PainelTitulo titulo="Observação do cadastro" sub="Ficha de venda: plano, fidelidade, contato" />
      {/* Altura limitada: uma ficha longa não estica a linha inteira de painéis. */}
      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-label text-secondary">{texto.trim()}</pre>
    </Card>
  )
}

// ── Histórico de OS ──────────────────────────────────────────────────────────

const PAGINA = 20

const campo = (os: OSRow, k: string) => String((os as unknown as Record<string, unknown>)[k] ?? '')

export function HistoricoOS({ resumo, truncado, auditoriaOk, onSelect }: {
  resumo: ClienteResumo; truncado: boolean; auditoriaOk: boolean; onSelect: (os: OSRow) => void
}) {
  const [comAdmin, setComAdmin] = useState(false)
  const [limite, setLimite] = useState(PAGINA)
  const linhas = useMemo(() => {
    const base = comAdmin ? [...resumo.tecnicas, ...resumo.administrativas] : resumo.tecnicas
    // o servidor já ordena por abertura; reordenar só quando mistura as duas listas
    return comAdmin
      ? base.sort((a, b) => Number(b.numos) - Number(a.numos))
      : base
  }, [resumo, comAdmin])

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={FileText} className="mt-0 mb-0">Histórico de OS ({linhas.length})</SectionTitle>
        {resumo.administrativas.length > 0 && (
          <label className="flex items-center gap-2 text-label text-secondary cursor-pointer">
            <input type="checkbox" checked={comAdmin} onChange={e => setComAdmin(e.target.checked)} />
            Incluir administrativas ({resumo.administrativas.length})
          </label>
        )}
      </div>
      <Card className="mt-3 overflow-x-auto">
        <table className="w-full text-label">
          <thead>
            <tr className="border-b border-subtle text-left text-caption uppercase tracking-label text-muted">
              <th className="px-3 py-2 font-semibold">OS</th>
              <th className="px-3 py-2 font-semibold">Abertura</th>
              <th className="px-3 py-2 font-semibold">Execução</th>
              <th className="px-3 py-2 font-semibold">Serviço</th>
              <th className="px-3 py-2 font-semibold">Equipe / técnico</th>
              {auditoriaOk && <th className="px-3 py-2 font-semibold text-right" title="Reagendamentos, pela auditoria do ERP">Reag.</th>}
              <th className="px-3 py-2 font-semibold">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {linhas.slice(0, limite).map(os => (
              <tr key={os.numos} onClick={() => onSelect(os)} className="cursor-pointer hover:bg-surface/40">
                <td className="px-3 py-2 font-mono font-bold text-primary">{os.numos}</td>
                <td className="px-3 py-2 font-mono text-secondary whitespace-nowrap">{fmtDate(os.datacadastro)?.split(' ')[0] ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-secondary whitespace-nowrap">{fmtDate(os.dataexecucao || os.databaixa) ?? '—'}</td>
                <td className="px-3 py-2 text-text max-w-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate" title={os.servico}>{os.servico || '—'}</span>
                    {isReincidencia(os) && <Badge variant="red" dot={false}>Reincidência</Badge>}
                  </div>
                </td>
                <td className="px-3 py-2 text-secondary whitespace-nowrap">
                  {shortEquipe((os.equipeexecutou as string | undefined) || os.nomedaequipe) || '—'}
                  {campo(os, 'nomeexecutante') && <span className="block text-caption text-muted">{campo(os, 'nomeexecutante')}</span>}
                </td>
                {auditoriaOk && (
                  <td className={`px-3 py-2 text-right font-mono ${Number(campo(os, 'reagendamentos')) >= 2 ? 'text-orange font-bold' : 'text-secondary'}`}
                      title={Number(campo(os, 'trocas_equipe')) ? `${campo(os, 'trocas_equipe')} troca(s) de equipe` : undefined}>
                    {Number(campo(os, 'reagendamentos')) || '—'}
                  </td>
                )}
                <td className="px-3 py-2"><Badge variant={situacaoVariant(os.descsituacao)}>{os.descsituacao || '—'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {linhas.length === 0 && <p className="px-3 py-6 text-center text-label text-muted">Nenhuma OS para este cliente.</p>}
      </Card>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-caption text-muted">
        <span>{truncado && `Mostrando as ${resumo.tecnicas.length + resumo.administrativas.length} OS mais recentes.`}</span>
        {linhas.length > limite && (
          <button onClick={() => setLimite(l => l + PAGINA * 2)} className="font-semibold text-primary hover:underline">
            Ver mais ({linhas.length - limite} restantes)
          </button>
        )}
      </div>
    </section>
  )
}
