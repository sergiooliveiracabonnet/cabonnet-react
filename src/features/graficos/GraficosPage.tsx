// @ts-nocheck
import { useState, useMemo, useCallback, useEffect } from 'react'
import { BarChart2, TrendingUp, Sliders, ZoomIn, MousePointerClick, ChevronUp, ChevronDown } from 'lucide-react'
import { useOSDerived }   from '../../contexts/OSDataContext'
import { buildGraficos }  from '../../lib/builders'
import { shortEquipe }    from '../../lib/osFormat'
import { TabBar }         from '../../components/ui/TabBar'
import { ChartCard }      from '../../components/ui/ChartCard'
import { SectionTitle }   from '../../components/ui/SectionTitle'
import { Modal }          from '../../components/ui/Modal'
import { DonutChart }     from '../../components/ui/DonutChart'
import { BarChart, Bar, XAxis, YAxis, ChartTooltip, Grid, Legend, Cell } from '../../components/ui/bar-chart'
import { AreaChart, Area }                                                 from '../../components/ui/line-chart'
import { XAxis as LXAxis, YAxis as LYAxis, ChartTooltip as LTooltip, Grid as LGrid, Legend as LLegend } from '../../components/ui/line-chart'

// ─── Constants ────────────────────────────────────────────────────────────────
const FORN_PILLS = [
  { value: '',           label: 'Todos'      },
  { value: 'WES',        label: 'WES'        },
  { value: 'Instacable', label: 'Instacable' },
  { value: 'THM',        label: 'THM'        },
  { value: 'REDE',       label: 'Rede'       },
  { value: 'MANUTENCAO', label: 'Manutenção' },
]

const TABS = [
  { id: 'distribuicao', label: 'Distribuição', icon: BarChart2  },
  { id: 'tendencia',    label: 'Tendência',    icon: TrendingUp },
  { id: 'estatistica',  label: 'Estatística',  icon: Sliders    },
  { id: 'cohort',       label: 'Cohort',       icon: ZoomIn     },
]

const COLORS = ['#0ea5e9','#22c55e','#eab308','#f97316','#a78bfa','#ef4444','#06b6d4','#ec4899','#84cc16','#8b5cf6']

// ─── Date helpers ─────────────────────────────────────────────────────────────
const toISODate = (s) => {
  if (!s) return ''
  const p = (s || '').split(' ')[0].split(/[/\\]/)
  return p.length >= 3 ? `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}` : ''
}
const toISOMonth    = (s) => toISODate(s).slice(0, 7)
const closeISO      = (r) => toISODate((r.databaixa || r.dataexecucao || ''))
const closeISOMonth = (r) => closeISO(r).slice(0, 7)

const AGING_FILTER = {
  '0-1d':  r => r._aging != null && r._aging <= 1,
  '2-3d':  r => r._aging != null && r._aging >= 2 && r._aging <= 3,
  '4-7d':  r => r._aging != null && r._aging >= 4 && r._aging <= 7,
  '8-14d': r => r._aging != null && r._aging >= 8 && r._aging <= 14,
  '15+d':  r => r._aging != null && r._aging >= 15,
}

// ─── Data converters ──────────────────────────────────────────────────────────
const toLV = (d) =>
  d?.labels?.length ? d.labels.map((name, i) => ({ name, value: d.values?.[i] ?? 0 })) : []

const toMulti = (d) => {
  if (!d?.labels?.length) return []
  const keys = Object.keys(d).filter(k => k !== 'labels')
  return d.labels.map((name, i) => ({
    name,
    ...Object.fromEntries(keys.map(k => [k, d[k]?.[i] ?? 0])),
  }))
}

// ─── Drill Modal ───────────────────────────────────────────────────────────────
const DRILL_COLS = [
  { key: 'numos',        label: 'OS'       },
  { key: 'nomecliente',  label: 'Cliente'  },
  { key: 'descsituacao', label: 'Status'   },
  { key: 'nomedacidade', label: 'Cidade'   },
  { key: 'nomedaequipe', label: 'Equipe'   },
  { key: 'datacadastro', label: 'Abertura' },
  { key: '_aging',       label: 'Aging'    },
  { key: 'tiposervico',  label: 'Tipo'     },
]

function drillSortValue(r, key) {
  if (key === 'numos')        return parseInt(r.numos) || 0
  if (key === '_aging')       return r._aging ?? -1
  if (key === 'datacadastro') return toISODate(r.datacadastro ?? '')
  return (r[key] ?? '').toString().toLowerCase()
}

function DrillModal({ drill, onClose }) {
  const [search, setSearch] = useState('')
  const [sort,   setSort]   = useState({ key: '_aging', dir: 'desc' })

  useEffect(() => {
    setSearch('')
    setSort({ key: '_aging', dir: 'desc' })
  }, [drill?.title])

  if (!drill) return null
  const { title, rows } = drill

  function toggleSort(key) {
    setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))
  }

  const lc = search.toLowerCase()
  const filtered = search
    ? rows.filter(r =>
        (r.numos || '').includes(search) ||
        (r.nomecliente || '').toLowerCase().includes(lc) ||
        (r.nomedacidade || '').toLowerCase().includes(lc) ||
        (r.nomedaequipe || '').toLowerCase().includes(lc) ||
        (r.descsituacao || '').toLowerCase().includes(lc)
      )
    : rows

  const sorted = [...filtered].sort((a, b) => {
    const av = drillSortValue(a, sort.key)
    const bv = drillSortValue(b, sort.key)
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv
    return sort.dir === 'asc' ? cmp : -cmp
  })

  return (
    <Modal open title={title}
      subtitle={`${rows.length} OS encontradas${search ? ` · ${sorted.length} exibidas` : ''}`}
      onClose={onClose} maxWidth="1100px"
    >
      <div className="p-4 space-y-3">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por OS, cliente, cidade ou equipe..."
          className="w-full bg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-[12px]
                     text-text placeholder:text-muted/60 outline-none focus:border-primary/50 transition-colors"
          autoFocus />
        <div className="overflow-auto max-h-[55vh]">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-white/[0.06] bg-surface">
                {DRILL_COLS.map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)}
                    className="px-3 py-2 text-left text-[11px] font-bold text-muted uppercase tracking-wide
                               whitespace-nowrap cursor-pointer select-none hover:text-secondary transition-colors">
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sort.key !== col.key
                        ? <ChevronDown size={9} className="opacity-20 flex-shrink-0" />
                        : sort.dir === 'asc'
                          ? <ChevronUp   size={9} className="text-primary flex-shrink-0" />
                          : <ChevronDown size={9} className="text-primary flex-shrink-0" />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {sorted.slice(0, 250).map(r => (
                <tr key={r.numos} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2 font-mono text-primary whitespace-nowrap">{r.numos}</td>
                  <td className="px-3 py-2 text-secondary max-w-[140px] truncate">{r.nomecliente || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                      r.descsituacao === 'Concluída'   ? 'badge-green'  :
                      r.descsituacao === 'Atendimento' ? 'badge-cyan'   :
                      r.descsituacao === 'Pendente'    ? 'badge-yellow' :
                      'bg-white/[0.05] text-muted'
                    }`}>{r.descsituacao}</span>
                  </td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap">{r.nomedacidade || '—'}</td>
                  <td className="px-3 py-2 text-muted max-w-[130px] truncate" title={r.nomedaequipe}>{r.nomedaequipe || '—'}</td>
                  <td className="px-3 py-2 font-mono text-muted whitespace-nowrap">{r.datacadastro?.split(' ')[0] || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r._aging != null ? (
                      <span className={`font-mono font-semibold ${r._aging > 7 ? 'text-red' : r._aging > 3 ? 'text-yellow' : 'text-green'}`}>
                        {r._aging}d
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap truncate max-w-[100px]">{r.tiposervico || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > 250 && (
            <p className="text-center text-[11px] text-muted py-3">
              Mostrando 250 de {sorted.length} resultados — refine a busca para ver mais
            </p>
          )}
          {sorted.length === 0 && (
            <p className="text-center text-[11px] text-muted py-8">Nenhuma OS encontrada para este filtro</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function GraficosPage() {
  const [tab,        setTab]        = useState('distribuicao')
  const [fornecedor, setFornecedor] = useState('')
  const [drill,      setDrill]      = useState(null)

  const { rows, derived: { graficos: graficosCtx } } = useOSDerived()

  const activeRows = useMemo(
    () => fornecedor ? rows.filter(r => r._fornecedor === fornecedor) : rows,
    [rows, fornecedor]
  )
  const d = useMemo(
    () => fornecedor ? buildGraficos(activeRows) : graficosCtx,
    [activeRows, fornecedor, graficosCtx]
  )

  const openDrill = useCallback((title, filteredRows) => {
    setDrill({ title, rows: filteredRows })
  }, [])

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-headline text-xl font-semibold text-text">Gráficos & Análises</h2>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted/60">
            <MousePointerClick size={11} className="flex-shrink-0" />
            <span>Clique nos gráficos para ver as OS detalhadas</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-medium text-muted/60 mr-0.5">Frente:</span>
          {FORN_PILLS.map(f => (
            <button key={f.value} onClick={() => setFornecedor(f.value)}
              className={`text-[11px] font-medium px-3 py-1 rounded-md border transition-all duration-150 cursor-pointer
                          ${fornecedor === f.value
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-white/[0.08] text-muted hover:text-secondary hover:border-white/[0.14]'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} className="mb-2" />

      {tab === 'distribuicao' && <TabDistribuicao d={d} rows={activeRows} onDrill={openDrill} />}
      {tab === 'tendencia'    && <TabTendencia    d={d} rows={activeRows} onDrill={openDrill} />}
      {tab === 'estatistica'  && <TabEstatistica  d={d} rows={activeRows} onDrill={openDrill} />}
      {tab === 'cohort'       && <TabCohort       d={d} rows={activeRows} onDrill={openDrill} />}

      <DrillModal drill={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

// ─── Tab: Distribuição ────────────────────────────────────────────────────────
function TabDistribuicao({ d, rows, onDrill }) {
  const statusData  = toLV(d.status)
  const tipoData    = toLV(d.tipo)
  const cidadeData  = toLV(d.cidade)
  const equipesData = toLV(d.equipes)
  const agingData   = toLV(d.aging)
  const eficData    = toLV(d.eficiencia)

  const evolucaoData = (d.evolucao?.labels ?? []).map((name, i) => ({
    name,
    Abertas:    d.evolucao?.abertas?.[i]    ?? 0,
    Concluídas: d.evolucao?.concluidas?.[i] ?? 0,
  }))

  return (
    <div className="space-y-4">
      <SectionTitle icon={BarChart2}>Distribuição de OS</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <ChartCard title="Status das OS" dot="#22c55e" height="h-56">
          <DonutChart
            data={statusData} colors={COLORS} centerLabel="OS"
            onClick={(entry) => onDrill(`Status: ${entry.name}`, rows.filter(r => r.descsituacao === entry.name))}
          />
        </ChartCard>

        <ChartCard title="Categoria de OS" dot="#06b6d4" height="h-56">
          <DonutChart
            data={tipoData} colors={COLORS} centerLabel="OS"
            onClick={(entry) => {
              const catMap = {
                'Instalação':      'INSTALACAO',
                'VT / Manutenção': 'VT_MANUTENCAO',
                'Serviço':         'SERVICO',
                'Rede':            'REDE',
              }
              const cat = catMap[entry.name]
              onDrill(`${entry.name}`, cat
                ? rows.filter(r => r._categoria === cat)
                : rows.filter(r => entry.name === 'Serviço' ? r._categoria === 'SERVICO' : false)
              )
            }}
          />
        </ChartCard>

        <ChartCard title="OS por Cidade" dot="#eab308" height="h-56">
          <BarChart data={cidadeData} layout="vertical">
            <Bar dataKey="value" fill="#eab308"
              onClick={(data) => onDrill(`Cidade: ${data.name}`, rows.filter(r => (r.nomedacidade || '').trim() === data.name))} />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={130} />
            <Grid /><ChartTooltip />
          </BarChart>
        </ChartCard>

      </div>

      <SectionTitle icon={BarChart2}>Desempenho Operacional</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <ChartCard title="Top 10 Equipes — Volume de OS" dot="#0ea5e9" height="h-64" className="lg:col-span-2">
          <BarChart data={equipesData}>
            <Bar dataKey="value" fill="#0ea5e9"
              onClick={(data) => onDrill(`Equipe: ${data.name}`, rows.filter(r => shortEquipe(r.nomedaequipe || '') === data.name))} />
            <XAxis dataKey="name" /><YAxis /><Grid /><ChartTooltip />
          </BarChart>
        </ChartCard>

        <ChartCard title="SLA — Aging das OS" dot="#f97316" height="h-64">
          <BarChart data={agingData}>
            <Bar dataKey="value" fill="#f97316"
              onClick={(data) => { const fn = AGING_FILTER[data.name]; if (fn) onDrill(`Aging: ${data.name}`, rows.filter(fn)) }} />
            <XAxis dataKey="name" /><YAxis /><Grid /><ChartTooltip />
          </BarChart>
        </ChartCard>

      </div>

      <SectionTitle icon={BarChart2}>Eficiência & Tendência</SectionTitle>
      <ChartCard title="Taxa de Conclusão por Equipe (%)" dot="#22c55e" height="h-96">
        <BarChart data={eficData}>
          <Bar dataKey="value" fill="#22c55e"
            onClick={(data) => onDrill(`Equipe: ${data.name}`, rows.filter(r => shortEquipe(r.nomedaequipe || '') === data.name))} />
          <XAxis dataKey="name" /><YAxis /><Grid /><ChartTooltip suffix="%" />
        </BarChart>
      </ChartCard>

      <ChartCard title="Evolução Diária — Abertas vs Concluídas por Data de Fechamento" dot="#0ea5e9" height="h-80">
        <AreaChart
          data={evolucaoData}
          onClick={(cd) => {
            if (!cd?.activeLabel || !cd?.activePayload?.length) return
            const label = cd.activeLabel
            const ds    = cd.activePayload[0].name
            if (ds === 'Abertas')
              onDrill(`Abertas em ${label}`, rows.filter(r => toISODate(r.datacadastro) === label))
            else
              onDrill(`Concluídas em ${label}`, rows.filter(r => r.descsituacao === 'Concluída' && closeISO(r) === label))
          }}
        >
          <Area dataKey="Abertas"    stroke="#0ea5e9" fill="#0ea5e9" name="Abertas"    />
          <Area dataKey="Concluídas" stroke="#22c55e" fill="#22c55e" name="Concluídas" />
          <LXAxis dataKey="name" /><LYAxis /><LGrid /><LTooltip /><LLegend />
        </AreaChart>
      </ChartCard>
    </div>
  )
}

// ─── Tab: Tendência ───────────────────────────────────────────────────────────
function TabTendencia({ d, rows, onDrill }) {
  const mensalData = (d.mensal?.labels ?? []).map((name, i) => ({
    name,
    Abertas:        d.mensal?.abertas?.[i]     ?? 0,
    Concluídas:     d.mensal?.concluidas?.[i]  ?? 0,
    'SLA Excedido': d.mensal?.slaExcedido?.[i] ?? 0,
  }))

  const comparativoData = toMulti(d.comparativo)
  const taxaDiaData     = toLV(d.taxaDia)
  const burndownData    = toMulti(d.burndown)

  return (
    <div className="space-y-4">
      <SectionTitle icon={TrendingUp}>Visão Mensal — Abertura vs Conclusão</SectionTitle>

      <ChartCard title="Abertura × Conclusão × SLA Excedido — Mês a Mês" dot="#0ea5e9" height="h-80">
        <AreaChart
          data={mensalData}
          onClick={(cd) => {
            if (!cd?.activeLabel || !cd?.activePayload?.length) return
            const label = cd.activeLabel
            const ds    = cd.activePayload[0].name
            if (ds === 'Concluídas')
              onDrill(`Concluídas em ${label}`, rows.filter(r => r.descsituacao === 'Concluída' && closeISOMonth(r) === label))
            else if (ds === 'SLA Excedido')
              onDrill(`SLA Excedido em ${label}`, rows.filter(r => r._slaExcedido && toISOMonth(r.datacadastro) === label))
            else
              onDrill(`Abertas em ${label}`, rows.filter(r => toISOMonth(r.datacadastro) === label))
          }}
        >
          <Area dataKey="Abertas"      stroke="#0ea5e9" fill="#0ea5e9" name="Abertas"      />
          <Area dataKey="Concluídas"   stroke="#22c55e" fill="#22c55e" name="Concluídas"   />
          <Area dataKey="SLA Excedido" stroke="#ef4444" fill="#ef4444" fillOpacity={0.08} name="SLA Excedido" />
          <LXAxis dataKey="name" /><LYAxis /><LGrid /><LTooltip /><LLegend />
        </AreaChart>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <ChartCard title="OS por Dia — Comparativo de Status" dot="#0ea5e9" height="h-64">
          <BarChart
            data={comparativoData}
            onClick={(cd) => {
              if (!cd?.activeLabel || !cd?.activePayload?.length) return
              const label = cd.activeLabel
              const ds    = cd.activePayload[0].name
              if (ds === 'concluida')
                onDrill(`Concluídas em ${label}`, rows.filter(r => r.descsituacao === 'Concluída' && closeISO(r) === label))
              else if (ds === 'pendente')
                onDrill(`Pendentes abertos em ${label}`, rows.filter(r => r.descsituacao === 'Pendente' && toISODate(r.datacadastro) === label))
              else
                onDrill(`Em Atendimento abertos em ${label}`, rows.filter(r => r.descsituacao === 'Atendimento' && toISODate(r.datacadastro) === label))
            }}
          >
            {comparativoData[0] && Object.keys(comparativoData[0]).filter(k => k !== 'name').map((k, i) => (
              <Bar key={k} dataKey={k} fill={COLORS[i] ?? '#64748b'} name={k} />
            ))}
            <XAxis dataKey="name" /><YAxis /><Grid /><ChartTooltip /><Legend />
          </BarChart>
        </ChartCard>

        <ChartCard title="Taxa de Conclusão por Dia (%) — cohort por abertura" dot="#22c55e" height="h-64">
          <AreaChart
            data={taxaDiaData}
            onClick={(cd) => { if (cd?.activeLabel) onDrill(`OS abertas em ${cd.activeLabel}`, rows.filter(r => toISODate(r.datacadastro) === cd.activeLabel)) }}
          >
            <Area dataKey="value" stroke="#22c55e" fill="#22c55e" name="Taxa %" />
            <LXAxis dataKey="name" /><LYAxis /><LGrid /><LTooltip suffix="%" />
          </AreaChart>
        </ChartCard>

      </div>

      <ChartCard title="Meta vs Realizado — Concluídas por Mês de Fechamento" dot="#06b6d4" height="h-64">
        <AreaChart
          data={burndownData}
          onClick={(cd) => {
            if (!cd?.activeLabel || !cd?.activePayload?.length) return
            const label = cd.activeLabel
            const ds    = cd.activePayload[0].name
            if (ds === 'realizado')
              onDrill(`Concluídas em ${label}`, rows.filter(r => r.descsituacao === 'Concluída' && closeISOMonth(r) === label))
            else
              onDrill(`Abertas em ${label}`, rows.filter(r => toISOMonth(r.datacadastro) === label))
          }}
        >
          {burndownData[0] && Object.keys(burndownData[0]).filter(k => k !== 'name').map((k, i) => (
            <Area key={k} dataKey={k} stroke={COLORS[i] ?? '#64748b'} fill={COLORS[i] ?? '#64748b'} name={k} />
          ))}
          <LXAxis dataKey="name" /><LYAxis /><LGrid /><LTooltip /><LLegend />
        </AreaChart>
      </ChartCard>
    </div>
  )
}

// ─── Tab: Estatística ─────────────────────────────────────────────────────────
function TabEstatistica({ d, rows, onDrill }) {
  const agingData  = toLV(d.aging)
  const cidadeData = toLV(d.cidade)
  const eficData   = toLV(d.eficiencia)

  return (
    <div className="space-y-4">
      <SectionTitle icon={Sliders}>Estatísticas de Aging</SectionTitle>

      <ChartCard title="Distribuição de Aging das OS Ativas" dot="#f97316" height="h-64">
        <BarChart data={agingData}>
          <Bar dataKey="value" fill="#f97316"
            onClick={(data) => { const fn = AGING_FILTER[data.name]; if (fn) onDrill(`Aging: ${data.name}`, rows.filter(fn)) }} />
          <XAxis dataKey="name" /><YAxis /><Grid /><ChartTooltip />
        </BarChart>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <ChartCard title="OS por Cidade" dot="#eab308" height="h-64">
          <BarChart data={cidadeData} layout="vertical">
            <Bar dataKey="value" fill="#eab308"
              onClick={(data) => onDrill(`Cidade: ${data.name}`, rows.filter(r => (r.nomedacidade || '').trim() === data.name))} />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={130} />
            <Grid /><ChartTooltip />
          </BarChart>
        </ChartCard>

        <ChartCard title="Taxa por Equipe (%)" dot="#22c55e" height="h-64">
          <BarChart data={eficData}>
            <Bar dataKey="value" fill="#22c55e"
              onClick={(data) => onDrill(`Equipe: ${data.name}`, rows.filter(r => shortEquipe(r.nomedaequipe || '') === data.name))} />
            <XAxis dataKey="name" /><YAxis /><Grid /><ChartTooltip suffix="%" />
          </BarChart>
        </ChartCard>

      </div>
    </div>
  )
}

// ─── Tab: Cohort ──────────────────────────────────────────────────────────────
function TabCohort({ d, rows, onDrill }) {
  const c = d.cohort ?? { labels: [], total: [], concluidas: [], mesmoMes: [], taxaResolucao: [], mttr: [] }

  const cohortBarData = c.labels.map((name, i) => ({
    name,
    Abertas:     c.total[i]      ?? 0,
    Concluídas:  c.concluidas[i] ?? 0,
    'Mesmo Mês': c.mesmoMes[i]   ?? 0,
  }))

  const taxaData = c.labels.map((name, i) => ({ name, value: c.taxaResolucao[i] ?? 0 }))
  const mttrData = c.labels.map((name, i) => ({
    name, value: c.mttr[i] ?? 0,
    fill: (c.mttr[i] ?? 0) <= 2 ? '#22c55e' : (c.mttr[i] ?? 0) <= 5 ? '#eab308' : '#ef4444',
  }))

  return (
    <div className="space-y-4">
      <SectionTitle icon={ZoomIn}>Cohort de Resolução por Mês de Abertura</SectionTitle>
      <p className="text-[11px] text-muted -mt-2">
        Cada coluna representa as OS abertas naquele mês e como evoluíram (últimos 12 meses)
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <ChartCard title="Abertas vs. Concluídas por Mês de Abertura" dot="#0ea5e9" height="h-64">
          <BarChart data={cohortBarData}>
            <Bar dataKey="Abertas"    fill="#0ea5e9" name="Abertas"
              onClick={(data) => onDrill(`Cohort ${data.name} — todas as OS`, rows.filter(r => toISOMonth(r.datacadastro) === data.name))} />
            <Bar dataKey="Concluídas" fill="#22c55e" name="Concluídas"
              onClick={(data) => onDrill(`Cohort ${data.name} — Concluídas`, rows.filter(r => r.descsituacao === 'Concluída' && toISOMonth(r.datacadastro) === data.name))} />
            <Bar dataKey="Mesmo Mês"  fill="#a78bfa" name="Mesmo Mês"
              onClick={(data) => onDrill(`Cohort ${data.name} — Mesmo Mês`, rows.filter(r => r.descsituacao === 'Concluída' && toISOMonth(r.datacadastro) === data.name && closeISOMonth(r) === data.name))} />
            <XAxis dataKey="name" /><YAxis /><Grid /><ChartTooltip /><Legend />
          </BarChart>
        </ChartCard>

        <ChartCard title="Taxa de Resolução por Cohort (%)" dot="#22c55e" height="h-64">
          <AreaChart
            data={taxaData}
            onClick={(cd) => { if (cd?.activeLabel) onDrill(`Cohort ${cd.activeLabel} — Concluídas`, rows.filter(r => r.descsituacao === 'Concluída' && toISOMonth(r.datacadastro) === cd.activeLabel)) }}
            style={{ cursor: 'pointer' }}
          >
            <Area dataKey="value" stroke="#22c55e" fill="rgba(34,197,94,0.08)" name="Taxa Resolução" />
            <LXAxis dataKey="name" /><LYAxis domain={[0, 100]} /><LGrid /><LTooltip suffix="%" />
          </AreaChart>
        </ChartCard>

      </div>

      <ChartCard title="MTTR Médio por Mês de Abertura (dias)" dot="#f97316" height="h-56">
        <BarChart data={mttrData}>
          <Bar dataKey="value" name="MTTR (dias)"
            onClick={(data) => onDrill(`Cohort ${data.name} — todas as OS`, rows.filter(r => toISOMonth(r.datacadastro) === data.name))}>
            {mttrData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
          <XAxis dataKey="name" /><YAxis /><Grid />
          <ChartTooltip suffix=" dias" formatter={(v) => `MTTR: ${v} dias`} />
        </BarChart>
      </ChartCard>

      {c.labels.length > 0 && (
        <div className="bg-card border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
              Tabela Cohort Detalhada
              <span className="ml-2 font-normal normal-case tracking-normal text-muted/50">
                — clique em uma linha para ver as OS
              </span>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] bg-surface">
                  {['Mês','Abertas','Concluídas','Mesmo Mês','Taxa Res.','MTTR Méd.'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold text-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {c.labels.map((label, i) => {
                  const taxa  = c.taxaResolucao[i] ?? 0
                  const mttrV = c.mttr[i] ?? 0
                  return (
                    <tr key={label}
                      className="hover:bg-white/[0.04] cursor-pointer transition-colors"
                      onClick={() => onDrill(`Cohort ${label}`, rows.filter(r => toISOMonth(r.datacadastro) === label))}>
                      <td className="px-4 py-2.5 font-mono text-primary">{label}</td>
                      <td className="px-4 py-2.5 font-mono">{c.total[i] ?? 0}</td>
                      <td className="px-4 py-2.5 font-mono text-green-400">{c.concluidas[i] ?? 0}</td>
                      <td className="px-4 py-2.5 font-mono text-purple-400">{c.mesmoMes[i] ?? 0}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-mono text-[11px] font-semibold ${taxa >= 80 ? 'text-green-400' : taxa >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {taxa}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`font-mono text-[11px] ${mttrV <= 2 ? 'text-green-400' : mttrV <= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {mttrV}d
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
