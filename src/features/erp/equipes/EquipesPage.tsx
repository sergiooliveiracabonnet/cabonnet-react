import { useMemo, useState } from 'react'
import { Package, Wrench, Network, BarChart2, TrendingUp, Search } from 'lucide-react'
import type { OSRow } from '../../../lib/types'
import { useERPRows }  from '../useERPRows'
import { shortEquipe } from '../../../lib/osFormat'
import { TEAMS, type Team } from '../erpConstants'
import { useERPStore }  from '../../../store/erpStore'
import {
  EquipeCard, TeamDrawer,
  type Metrics, type SlaEntry,
} from './EquipesComponents'

export default function EquipesPage() {
  const { rows, allRows, derived, isLoading } = useERPRows()
  const { custoEquipe, setCustoEquipe, equipeIndisponivel, toggleEquipeDisponivel } = useERPStore()
  const [search, setSearch]     = useState('')
  const [tipoFilter, setTipo]   = useState('')
  const [selected, setSelected] = useState<Team | null>(null)

  const teamRows = useMemo(() => {
    if (!selected) return []
    return rows.filter((r: OSRow) => {
      const code = shortEquipe(r.nomedaequipe || '').split(' - ')[0].trim()
      return code === selected.code
    })
  }, [rows, selected])

  const semaforo = useMemo(() => derived?.sla?.semaforo ?? [], [derived])

  const slaByCode = useMemo(() => {
    const map: Record<string, SlaEntry> = {}
    semaforo.forEach(s => {
      const code = shortEquipe(s.nome).split(' - ')[0].trim()
      map[code] = s
    })
    return map
  }, [semaforo])

  const leaderByCode = useMemo(() => {
    const leaders: Record<string, string> = {}
    const ages:    Record<string, number> = {}
    allRows.forEach(row => {
      if (!row.nomedaequipe) return
      const full  = shortEquipe(row.nomedaequipe)
      const parts = full.split(' - ')
      if (parts.length < 2) return
      const code   = parts[0].trim()
      const leader = parts[1].trim()
      if (!leader) return
      const age = row._agingAbertura ?? Infinity
      if (!(code in ages) || age < ages[code]) {
        leaders[code] = leader
        ages[code]    = age
      }
    })
    return leaders
  }, [allRows])

  const metricsByCode = useMemo(() => {
    const metrics: Record<string, Metrics> = {}
    rows.forEach(row => {
      if (!row.nomedaequipe) return
      const code = shortEquipe(row.nomedaequipe).split(' - ')[0].trim()
      if (!metrics[code]) metrics[code] = { queue: 0, criticas: 0, concluidas: 0 }
      metrics[code].queue++
      if (row._slaCritico) metrics[code].criticas++
      if (row.descsituacao === 'Concluída') metrics[code].concluidas++
    })
    return metrics
  }, [rows])

  const allTeams = useMemo(() => {
    const catalogCodes = new Set(TEAMS.map(t => t.code))
    const extra: Team[] = []
    Object.keys(metricsByCode).forEach(code => {
      if (catalogCodes.has(code)) return
      if (!code || code === '—' || code === 'INST' || code === 'MANUT' || code === 'REDE' || code === 'COPE') return
      const u    = code.toUpperCase()
      const tipo = u.startsWith('REDE') ? 'REDE' : u.startsWith('MANUT') ? 'MANUTENCAO' : 'INSTALACAO'
      extra.push({ code, leader: leaderByCode[code] ?? 'A definir', tipo, members: [] })
    })
    const merged = TEAMS.map(t => ({ ...t, leader: leaderByCode[t.code] ?? t.leader }))
    return [...merged, ...extra]
  }, [metricsByCode, leaderByCode])

  const filtered = useMemo(() => allTeams.filter(t => {
    if (tipoFilter && t.tipo !== tipoFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return t.code.toLowerCase().includes(q) || t.leader.toLowerCase().includes(q)
    }
    return true
  }), [allTeams, search, tipoFilter])

  const summary = useMemo(() => {
    const avgSla = semaforo.length > 0
      ? semaforo.reduce((s, r) => s + (r.sla || 0), 0) / semaforo.length
      : 0
    return {
      inst:  allTeams.filter(t => t.tipo === 'INSTALACAO').length,
      manut: allTeams.filter(t => t.tipo === 'MANUTENCAO').length,
      rede:  allTeams.filter(t => t.tipo === 'REDE').length,
      total: allTeams.length,
      avgSla,
    }
  }, [semaforo, allTeams])

  return (
    <div className="flex flex-col gap-5 p-6">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-headline font-bold text-text">Gestão de Equipes</h1>
          <p className="text-[12px] text-secondary mt-0.5">{summary.total} equipes ativas · ERP</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Instalação', value: summary.inst,  SIcon: Package,   iconCls: 'text-primary', bgCls: 'bg-primary/10' },
          { label: 'Manutenção', value: summary.manut, SIcon: Wrench,    iconCls: 'text-orange',  bgCls: 'bg-orange/10'  },
          { label: 'Rede',       value: summary.rede,  SIcon: Network,   iconCls: 'text-green',   bgCls: 'bg-green/10'   },
          { label: 'OS na Fila', value: rows.length,   SIcon: BarChart2, iconCls: 'text-purple',  bgCls: 'bg-purple/10'  },
          { label: 'SLA Médio',  value: `${summary.avgSla.toFixed(0)}%`, SIcon: TrendingUp, iconCls: 'text-primary', bgCls: 'bg-primary/10' },
        ].map(s => {
          const SI = s.SIcon
          return (
            <div key={s.label} className="bg-elevated border border-white/[0.08] rounded-xl px-4 py-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg ${s.bgCls} flex items-center justify-center flex-shrink-0`}>
                <SI size={14} className={s.iconCls} />
              </div>
              <div>
                <p className="text-lg font-headline font-bold text-text leading-none">{s.value}</p>
                <p className="text-[10px] text-secondary">{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar equipe ou técnico…"
            className="pl-8 pr-3 py-2 text-[12px] bg-elevated border border-white/[0.08] rounded-lg w-64
                       text-text placeholder:text-muted focus:outline-none focus:border-primary/40"
          />
        </div>

        <div className="flex gap-1 bg-elevated border border-white/[0.08] rounded-lg p-0.5">
          {[
            { value: '',           label: 'Todas'      },
            { value: 'INSTALACAO', label: 'Instalação' },
            { value: 'MANUTENCAO', label: 'Manutenção' },
            { value: 'REDE',       label: 'Rede'       },
          ].map(opt => (
            <button key={opt.value} onClick={() => setTipo(opt.value)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150
                          ${tipoFilter === opt.value
                            ? 'bg-primary/20 text-primary'
                            : 'text-secondary hover:text-text hover:bg-surface/40'}`}>
              {opt.label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[11px] text-muted">
          {filtered.length} equipe{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-secondary text-sm">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Carregando…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(team => (
            <EquipeCard
              key={team.code}
              team={team}
              metrics={metricsByCode[team.code] ?? { queue: 0, criticas: 0, concluidas: 0 }}
              slaData={slaByCode[team.code]}
              custoMensal={custoEquipe[team.code] ?? 0}
              indisponivel={!!equipeIndisponivel[team.code]}
              onClick={setSelected}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full py-20 text-center text-muted text-sm">
              Nenhuma equipe encontrada
            </div>
          )}
        </div>
      )}

      {selected && (
        <TeamDrawer
          team={selected}
          teamRows={teamRows}
          metrics={metricsByCode[selected.code] ?? { queue: 0, criticas: 0, concluidas: 0 }}
          slaData={slaByCode[selected.code]}
          custoMensal={custoEquipe[selected.code] ?? 0}
          onCustoChange={(v) => setCustoEquipe(selected.code, v)}
          indisponivel={!!equipeIndisponivel[selected.code]}
          onToggleDisponivel={() => toggleEquipeDisponivel(selected.code)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
