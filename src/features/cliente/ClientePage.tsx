import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Calendar, CalendarX, ClipboardText, IdentificationCard, MagnifyingGlass, Repeat, Timer, Wrench, ArrowLeft } from '@phosphor-icons/react'
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
        <KPIGridSkeleton count={8} />
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

  return (
    <div className="space-y-5">
      <ClienteHeader cliente={cliente} localizacao={resumo.localizacao} />
      <ClienteAlertas alertas={resumo.alertas} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="OS em 12 meses" value={resumo.os12m} icon={ClipboardText}
                  sub={`${resumo.tecnicas.length} no histórico`} />
        <StatCard title="Visitas executadas" value={resumo.visitas12m} icon={Wrench} sub="últimos 12 meses" />
        <StatCard title="Reincidências" value={resumo.reincidencias12m} icon={Repeat}
                  tone={resumo.reincidencias12m >= 2 ? 'critical' : resumo.reincidencias12m === 1 ? 'warning' : 'neutral'}
                  sub="marcadas pelo ERP · 12 meses" />
        <StatCard title="Reagendamentos" icon={CalendarX}
                  value={resumo.reagendamentos12m ?? '—'}
                  tone={(resumo.reagendamentos12m ?? 0) >= 3 ? 'warning' : 'neutral'}
                  sub={resumo.reagendamentos12m == null ? 'auditoria indisponível' : 'auditoria do ERP · 12 meses'} />
        <StatCard title="Última visita" value={ultima ? fmtDia(ultima.data) : '—'} icon={Calendar}
                  sub={ultima ? (ultima.tecnico || ultima.equipe) : 'nenhuma execução'} />
        <StatCard title="Intervalo mediano" icon={Timer}
                  value={resumo.intervaloMedianoDias != null ? `${resumo.intervaloMedianoDias} d` : '—'}
                  sub="entre visitas" />
        <StatCard title="OS abertas" value={resumo.abertas.length} icon={ClipboardText}
                  tone={resumo.abertas.length ? 'warning' : 'neutral'}
                  sub={resumo.abertas[0] ? `mais antiga: ${resumo.abertas[0].numos}` : 'nenhuma na fila'}
                  onClick={resumo.abertas[0] ? () => setSelecionada(resumo.abertas[0]) : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2 space-y-3">
          <ClienteContratos contratos={contratos} enderecoCliente={enderecoTexto(cliente.endereco, false)}
                            fidelidades={resumo.fidelidades} />
          <ObservacaoCadastro texto={cliente.observacao} />
        </div>
        <div className="lg:col-span-3 grid gap-3 sm:grid-cols-2 content-start">
          <div className="sm:col-span-2"><OSPorMes porMes={resumo.porMes} /></div>
          <Ranking titulo="Serviços mais frequentes" itens={resumo.servicosFrequentes.map(s => ({ label: s.servico, n: s.n }))} />
          <Ranking titulo="Equipes que atenderam" itens={resumo.equipes.map(e => ({ label: e.equipe, n: e.n }))} />
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
