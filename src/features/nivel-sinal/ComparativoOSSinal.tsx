import { useMemo } from 'react'
import { ChartBar, MapPin, WarningCircle } from '@phosphor-icons/react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import type { OSRow } from '../../lib/types'
import { buildBairroComparativo } from './osSinalComparativo'
import type { SignalRow } from './nivelSinal'

interface ComparativoOSSinalProps {
  osRows: OSRow[]
  signalRows: SignalRow[]
  hasCsv: boolean
}

export function ComparativoOSSinal({ osRows, signalRows, hasCsv }: ComparativoOSSinalProps) {
  const comparativo = useMemo(() => buildBairroComparativo(osRows, signalRows), [osRows, signalRows])
  const comOS = useMemo(() => comparativo.filter(item => item.osCount > 0).length, [comparativo])
  const comSinal = useMemo(() => comparativo.filter(item => item.sinalTotal > 0).length, [comparativo])
  const emAmbos = useMemo(() => comparativo.filter(item => item.osCount > 0 && item.sinalTotal > 0).length, [comparativo])

  return <div className="space-y-4">
    <PageHeader title="OS × Nível de Sinal" icon={ChartBar}
      description="Bairros com mais manutenções solicitadas pelo cliente, cruzados com o alerta de sinal do CSV carregado" />

    {!hasCsv ? (
      <Card><EmptyState icon={WarningCircle} title="Carregue o CSV de sinal"
        description="Sem o CSV de sinal carregado na aba Análise de sinal, não há o que cruzar com as ordens de manutenção." /></Card>
    ) : !comparativo.length ? (
      <Card><EmptyState icon={WarningCircle} title="Nada para comparar no recorte atual"
        description="Sem ordens de manutenção com bairro preenchido no período selecionado (filtro de data no topo do sistema), ou sem alerta de sinal no bairro." /></Card>
    ) : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard title="Bairros com OS de manutenção" value={comOS} sub="no período selecionado" icon={ChartBar} />
        <StatCard title="Bairros com alerta de sinal" value={comSinal} sub="no CSV carregado" icon={WarningCircle} />
        <StatCard title="Bairros nos dois" value={emAmbos} sub="OS de manutenção + alerta de sinal" tone={emAmbos ? 'critical' : 'ok'} icon={MapPin} />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-body font-semibold text-text">Bairros por proximidade — OS × sinal</h2>
          <p className="mt-0.5 text-caption text-muted">Ordenado pelo maior número de ordens de manutenção. Linhas destacadas também têm ONUs em nível crítico de sinal no mesmo bairro.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-left text-label">
            <thead className="bg-surface/70 text-caption uppercase tracking-wide text-muted"><tr>
              {['Bairro / Cidade', 'OS de manutenção', 'ONUs c/ alerta', 'Críticas', 'Atenção', 'RX médio'].map(label =>
                <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}
            </tr></thead>
            <tbody>{comparativo.map(item => (
              <tr key={`${item.cidade}|${item.bairro}`}
                className={`border-t border-border transition-colors hover:bg-surface/50 ${item.osCount > 0 && item.sinalCriticos > 0 ? 'bg-red/[0.05]' : ''}`}>
                <td className="px-4 py-3"><span className="block text-text">{item.bairro}</span><span className="text-caption text-muted">{item.cidade}</span></td>
                <td className="px-4 py-3 tabular-nums">
                  {item.osCount > 0 ? <span className="block font-semibold text-text">{item.osCount}</span> : <span className="text-muted">—</span>}
                  {item.osCriticas > 0 && <span className="block text-caption text-red">{item.osCriticas} SLA crítico</span>}
                </td>
                <td className="px-4 py-3 tabular-nums text-text">{item.sinalTotal || <span className="text-muted">—</span>}</td>
                <td className="px-4 py-3 tabular-nums">{item.sinalCriticos > 0 ? <span className="font-semibold text-red">{item.sinalCriticos}</span> : <span className="text-muted">—</span>}</td>
                <td className="px-4 py-3 tabular-nums">{item.sinalAtencao > 0 ? <span className="font-semibold text-orange">{item.sinalAtencao}</span> : <span className="text-muted">—</span>}</td>
                <td className="px-4 py-3 tabular-nums text-secondary">{item.rxMedio != null ? `${item.rxMedio} dBm` : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </>}
  </div>
}
