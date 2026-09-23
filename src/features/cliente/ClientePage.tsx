import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IdentificationCard, MagnifyingGlass, ArrowLeft } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import { SearchBox } from '../../components/ui/SearchBox'
import { Card } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { EmptyState } from '../../components/ui/EmptyState'
import { KPIGridSkeleton, Skeleton } from '../../components/ui/Skeleton'
import OSDrawer from '../ordens/OSDrawer'
import { useCliente, useClienteBusca, termoBuscaValido } from '../../hooks/useCliente'
import type { OSRow } from '../../lib/types'
import { buildClienteResumo } from './clienteResumo'
import {
  ClienteAlertas, ClienteContratos, ClienteHeader, HistoricoOS, ObservacaoCadastro,
  OSPorMes, Ranking, ResultadoBusca, enderecoTexto,
} from './ClienteComponents'

const fmtDia = (d: Date) => d.toLocaleDateString('pt-BR')

function BuscaCliente({ compacta }: { compacta: boolean }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const { items, isLoading, error } = useClienteBusca(q)
  const buscou = termoBuscaValido(q)

  return (
    <div className={compacta ? 'w-full sm:w-80' : ''}>
      <SearchBox value={q} onChange={setQ} debounce={0}
                 placeholder="Nome, CPF/CNPJ, código, contrato ou nº da OS…" className="w-full" />
      {buscou && (
        <Card className={`mt-2 overflow-hidden ${compacta ? 'absolute right-0 z-30 w-80 sm:w-96 shadow-2xl' : ''}`}>
          {isLoading && <p className="px-4 py-3 text-label text-muted">Buscando…</p>}
          {error && <p className="px-4 py-3 text-label text-red">{error.message}</p>}
          {!isLoading && !error && items.length === 0 && (
            <p className="px-4 py-3 text-label text-muted">Nenhum cliente encontrado para "{q}".</p>
          )}
          <div className="divide-y divide-hairline max-h-96 overflow-y-auto">
            {items.map(item => (
              <ResultadoBusca key={item.codigocliente} item={item}
                              onSelect={() => { setQ(''); navigate(`/clientes/${item.codigocliente}`) }} />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function ClienteDetalhe({ codigo }: { codigo: string }) {
  const { data, isLoading, error } = useCliente(codigo)
  const [selecionada, setSelecionada] = useState<OSRow | null>(null)
  const resumo = useMemo(
    () => data ? buildClienteResumo(data.ordens, data.contratos, new Date(), data.auditoria_ok) : null,
    [data],
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <KPIGridSkeleton count={7} />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }
  if (error || !data || !resumo) {
    return <EmptyState icon={IdentificationCard} title="Não foi possível carregar o cliente"
                       description={error?.message ?? 'Cliente não encontrado.'} />
  }

  const { cliente, contratos } = data
  const ultima = resumo.ultimaVisita
  const temObservacao = cliente.observacao.trim().length > 0

  return (
    <div className="space-y-5">
      <ClienteHeader cliente={cliente} localizacao={resumo.localizacao} />
      <ClienteAlertas alertas={resumo.alertas} />

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
        <StatCard size="sm" outlined title="OS em 12 meses" value={resumo.os12m}
                  sub={`${resumo.tecnicas.length} no histórico`} />
        <StatCard size="sm" outlined title="Visitas" value={resumo.visitas12m} sub="executadas · 12m" />
        <StatCard size="sm" outlined title="Reincidências" value={resumo.reincidencias12m}
                  tone={resumo.reincidencias12m >= 2 ? 'critical' : resumo.reincidencias12m === 1 ? 'warning' : 'neutral'}
                  sub="ERP · 12m" />
        <StatCard size="sm" outlined title="Reagendamentos"
                  value={resumo.reagendamentos12m ?? '—'}
                  tone={(resumo.reagendamentos12m ?? 0) >= 3 ? 'warning' : 'neutral'}
                  sub={resumo.reagendamentos12m == null ? 'auditoria indisponível' : 'auditoria · 12m'} />
        <StatCard size="sm" outlined title="Última visita" value={ultima ? fmtDia(ultima.data) : '—'}
                  sub={ultima ? ultima.equipe : 'nenhuma execução'} />
        <StatCard size="sm" outlined title="Intervalo mediano"
                  value={resumo.intervaloMedianoDias != null ? `${resumo.intervaloMedianoDias} d` : '—'}
                  sub="entre visitas" />
        <StatCard size="sm" outlined title="OS abertas" value={resumo.abertas.length}
                  tone={resumo.abertas.length ? 'warning' : 'neutral'}
                  sub={resumo.abertas[0] ? `mais antiga: ${resumo.abertas[0].numos}` : 'nenhuma na fila'}
                  onClick={resumo.abertas[0] ? () => setSelecionada(resumo.abertas[0]) : undefined} />
      </div>

      {/* Duas linhas de grid: cada linha estica os painéis até a mesma altura,
          então topo e base ficam alinhados mesmo com conteúdos de tamanhos diferentes. */}
      <div className="grid gap-3 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <ClienteContratos contratos={contratos} enderecoCliente={enderecoTexto(cliente.endereco, false)}
                            fidelidades={resumo.fidelidades} />
        </div>
        <div className="lg:col-span-3">
          <OSPorMes porMes={resumo.porMes} />
        </div>
        {temObservacao && (
          <div className="lg:col-span-2">
            <ObservacaoCadastro texto={cliente.observacao} />
          </div>
        )}
        <div className={`grid gap-3 sm:grid-cols-2 ${temObservacao ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
          <Ranking titulo="Serviços mais frequentes" sub="OS técnicas, todo o histórico"
                   itens={resumo.servicosFrequentes.map(s => ({ label: s.servico, n: s.n }))} />
          <Ranking titulo="Equipes que atenderam" sub="Visitas executadas, todo o histórico"
                   itens={resumo.equipes.map(e => ({ label: e.equipe, n: e.n }))} />
        </div>
      </div>

      <HistoricoOS resumo={resumo} truncado={data.ordens_truncadas} auditoriaOk={data.auditoria_ok} onSelect={setSelecionada} />
      <OSDrawer os={selecionada} onClose={() => setSelecionada(null)} />
    </div>
  )
}

export default function ClientePage() {
  const { codigo } = useParams<{ codigo: string }>()
  const navigate = useNavigate()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cliente"
        description="Cadastro, contratos e histórico de atendimento"
        icon={IdentificationCard}
        titleExtra={codigo && (
          <button onClick={() => navigate('/clientes')} className="ml-2 inline-flex items-center gap-1 text-label text-muted hover:text-text">
            <ArrowLeft size={12} /> nova busca
          </button>
        )}
        actions={codigo ? <div className="relative"><BuscaCliente compacta /></div> : undefined}
      />
      {codigo
        ? <ClienteDetalhe codigo={codigo} />
        : (
          <div className="max-w-2xl space-y-3">
            <BuscaCliente compacta={false} />
            <p className="flex items-center gap-2 text-caption text-muted">
              <MagnifyingGlass size={12} />
              Busca na base completa do ERP, não só nas OS do período.
            </p>
          </div>
        )}
    </div>
  )
}
