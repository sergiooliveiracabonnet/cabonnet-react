import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DownloadSimple } from '@phosphor-icons/react'
import type { OSRow } from '../../lib/types'
import { useOSDerived } from '../../contexts/OSDataContext'
import { useAuthStore } from '../../store/authStore'
import { exportCSV } from '../../lib/export'
import { KPIGridSkeleton } from '../../components/ui/Skeleton'
import { Modal } from '../../components/ui/Modal'
import OSDrawer from '../ordens/OSDrawer'
import { CoortePanel } from '../dashboard/CoortePanel'
import { ChurnPanel } from '../dashboard/ChurnPanel'
import { MetaMesCard, FornecedoresPanel, QualidadePeriodoCard } from '../dashboard/DashboardPaineis'
import { RevisitasEquipePanel, RevisitasTendenciaPanel, RevisitasIntervaloPanel, type RevisitasView } from './RevisitasPaineis'
import { KpiModalTable } from '../dashboard/DashboardKpiModal'
import { filterRowsByFornecedor } from '../dashboard/DashboardDrilldowns'
import type { ModalState, TypedDashboard } from '../dashboard/DashboardTypes'

export default function QualidadeTendenciaPage() {
  const { derived: { dashboard, revisitas, coorte, churn }, rows, isLoading } = useOSDerived()
  const { fornecedores, pulso } = dashboard as unknown as TypedDashboard
  const rev = revisitas as unknown as RevisitasView | null
  const taxaRevisitas = rev?.taxa?.geral ?? null
  const role    = useAuthStore(s => s.role)
  const modulos = useAuthStore(s => s.modulos)
  const temModulo = (modulo: string) => role === 'gestor' || modulos.includes(modulo)
  const navigate = useNavigate()

  const [modal,    setModal]    = useState<ModalState | null>(null)
  const [drawerOS, setDrawerOS] = useState<OSRow | null>(null)

  if (isLoading) return <KPIGridSkeleton count={6} />

  return (
    <>
      <div className="space-y-4 max-w-screen-2xl">
        <header>
          <h1 className="text-title font-bold text-text">Qualidade e tendência</h1>
          <p className="mt-0.5 text-caption text-muted">Metas, reincidência e fornecedores.</p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CoortePanel buckets={coorte.buckets} linhas={coorte.linhas} />
          <ChurnPanel
            janelaDias={churn.janelaDias}
            clientes={churn.clientes}
            totalReincidentes={churn.totalReincidentes}
            totalBase={churn.totalBase}
            pctReincidencia={churn.pctReincidencia}
            onOpen={(title, filtered) => setModal({ title, rows: filtered })}
            onOpenReport={() => navigate('/relatorio-reincidencias')}
          />
          <MetaMesCard meta={pulso.metaMes} />
          <FornecedoresPanel fornecedores={fornecedores}
                             onOpen={f => setModal({ title: `Fornecedor ${f} — OS do período`, rows: filterRowsByFornecedor(rows, f) })}
                             onOpenReport={temModulo('fornecedor') ? () => navigate('/fornecedor') : undefined} />
          <QualidadePeriodoCard pulso={pulso} taxaRevisitas={taxaRevisitas} />
        </div>

        {rev && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <RevisitasEquipePanel porEquipe={rev.porEquipe} />
            <RevisitasTendenciaPanel intervalo={rev.intervalo} tendencia={rev.tendencia} taxaGeral={rev.taxa.geral} />
            <RevisitasIntervaloPanel diasDist={rev.diasDist} tempoMedio={rev.tempoMedio} total={rev.totalRevisitas} />
          </div>
        )}
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.title ?? ''}
        subtitle={`${modal?.rows?.length ?? 0} ordens de serviço`}
        maxWidth="1120px"
        headerAction={
          (modal?.rows?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const date = new Date().toISOString().slice(0, 10)
                  exportCSV(modal!.rows, `os_${modal!.title.toLowerCase().replace(/\s+/g, '_')}_${date}.csv`)
                }}
                className="flex items-center gap-1.5 text-caption text-muted hover:text-primary
                           border border-subtle hover:border-primary/30 rounded-md px-2.5 py-1
                           transition-all duration-fast"
              >
                <DownloadSimple size={11} /> CSV
              </button>
            </div>
          )
        }
      >
        <KpiModalTable key={modal?.title} rows={modal?.rows ?? []} onOS={os => { setModal(null); setDrawerOS(os) }} />
      </Modal>

      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />
    </>
  )
}
