import { useMemo, useState } from 'react'
import { RefreshCw, AlertTriangle, LayoutDashboard, Home, Wrench, Star } from 'lucide-react'
import { useBacklog } from '../../../hooks/useBacklog'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { TabBar } from '../../../components/ui/TabBar'
import { PageHeader } from '../../../components/ui/PageHeader'
import { PainelTab } from './PainelTab'
import { RevisitaTab } from './RevisitaTab'
import { FiltrosBiTecnica } from './FiltrosBiTecnica'
import { filtrarBacklogRows, FILTROS_VAZIOS, type BiTecnicaFiltros } from '../../../lib/builders/biTecnicaFiltros'
import { buildVt24hStats } from '../../../lib/builders/vt24h'

function isoDate(d: Date): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mesAtualRange():    [string, string] {
  const h = new Date()
  return [isoDate(new Date(h.getFullYear(), h.getMonth(), 1)),
          isoDate(new Date(h.getFullYear(), h.getMonth() + 1, 1))]
}
function mesAnteriorRange(): [string, string] {
  const h = new Date()
  return [isoDate(new Date(h.getFullYear(), h.getMonth() - 1, 1)),
          isoDate(new Date(h.getFullYear(), h.getMonth(), 1))]
}

type Preset = 'atual' | 'anterior' | 'custom'

const TABS = [
  { id: 'painel',     label: 'Painel',             icon: LayoutDashboard },
  { id: 'instalacao', label: 'Revisita Instalação', icon: Home            },
  { id: 'servico',    label: 'Revisita Serviço',    icon: Star            },
  { id: 'manutencao', label: 'Revisita Manutenção', icon: Wrench          },
]

export default function BiGestaoTecnicaPage() {
  const [tab,       setTab]       = useState('painel')
  const [preset,    setPreset]    = useState<Preset>('atual')
  const [customIni, setCustomIni] = useState(() => mesAnteriorRange()[0])
  const [customFim, setCustomFim] = useState(() => isoDate(new Date()))
  const [filtros,   setFiltros]   = useState<BiTecnicaFiltros>(FILTROS_VAZIOS)

  const [inicio, fim] = useMemo<[string, string]>(() => {
    if (preset === 'atual')    return mesAtualRange()
    if (preset === 'anterior') return mesAnteriorRange()
    // Se o usuário escolher as datas invertidas, troca em vez de descartar a
    // data final — evita colapsar silenciosamente pra uma janela de 1 dia.
    const [ini, fimEscolhido] = customIni <= customFim ? [customIni, customFim] : [customFim, customIni]
    const amanha = isoDate(new Date(new Date(fimEscolhido).getTime() + 86_400_000))
    return [ini, amanha]
  }, [preset, customIni, customFim])

  const { data, isLoading, isError, refetch, isFetching } = useBacklog(inicio, fim)
  const { allRows } = useOSDerived()

  const dataFiltrado = useMemo(
    () => data ? filtrarBacklogRows(data, filtros) : undefined,
    [data, filtros]
  )
  const vt24h = useMemo(() => buildVt24hStats(allRows, inicio, fim), [allRows, inicio, fim])

  return (
    <div className="space-y-4 max-w-[1600px]">
      <PageHeader
        title="BI-Gestão Técnica"
        description="Painel técnico e revisitas por tipo de serviço — portado do i-Manager"
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border border-white/[0.08] bg-surface/40 overflow-hidden text-label">
          {(['atual', 'anterior', 'custom'] as Preset[]).map((v, i) => (
            <button key={v} onClick={() => setPreset(v)}
                    className={`px-3 py-1.5 transition-colors ${
                      preset === v ? 'bg-primary/20 text-primary font-semibold' : 'text-muted hover:text-text'
                    }`}>
              {['Mês Atual', 'Mês Anterior', 'Personalizado'][i]}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={customIni} onChange={e => setCustomIni(e.target.value)}
                   className="px-2 py-1.5 rounded-lg border border-white/[0.08] bg-surface/40
                              text-label text-text focus:outline-none" />
            <span className="text-caption text-muted">até</span>
            <input type="date" value={customFim} onChange={e => setCustomFim(e.target.value)}
                   className="px-2 py-1.5 rounded-lg border border-white/[0.08] bg-surface/40
                              text-label text-text focus:outline-none" />
          </div>
        )}
        <button onClick={() => refetch()} disabled={isFetching}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08]
                           bg-surface/40 text-label text-muted hover:text-text transition-colors disabled:opacity-50">
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {isLoading && !data && (
        <div className="flex items-center justify-center py-24 gap-3 text-secondary text-sm">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Carregando…
        </div>
      )}

      {isError && !data && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-8 text-center">
          <AlertTriangle size={20} className="text-red-400 mx-auto mb-2" />
          <p className="text-body text-red-400">Erro ao carregar dados.</p>
          <button onClick={() => refetch()} className="mt-3 text-caption text-muted underline">Tentar novamente</button>
        </div>
      )}

      {data && (
        <div className={`space-y-4 transition-opacity duration-200 ${isFetching ? 'opacity-60' : ''}`}>
          <FiltrosBiTecnica rows={data.rows} filtros={filtros} onChange={setFiltros} />
          <div>
            {tab === 'painel'     && <PainelTab data={dataFiltrado} vt24h={vt24h} />}
            {tab === 'instalacao' && <RevisitaTab data={dataFiltrado} tipo="instalacao" />}
            {tab === 'servico'    && <RevisitaTab data={dataFiltrado} tipo="servico" />}
            {tab === 'manutencao' && <RevisitaTab data={dataFiltrado} tipo="manutencao" />}
          </div>
        </div>
      )}
    </div>
  )
}
