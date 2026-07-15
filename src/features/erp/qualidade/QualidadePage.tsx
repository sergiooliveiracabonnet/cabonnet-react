import { useMemo, useState } from 'react'
import { AlertTriangle, MapPin, Users, RefreshCw, Wrench, Home, Star, Search, Sparkles, ClipboardCheck } from 'lucide-react'
import { useBacklog, type BacklogRow } from '../../../hooks/useBacklog'
import { AreaChart, Area, XAxis, YAxis, Grid, ChartTooltip, Legend } from '../../../components/ui/line-chart'
import { BarChart, Bar, XAxis as BXAxis, YAxis as BYAxis, Grid as BGrid, ChartTooltip as BTip } from '../../../components/ui/bar-chart'
import {
  KpiCard, EquipeRow, DrillTable,
  type Tipo, TIPO_LABEL, TIPO_COLOR,
  taxaColor,
} from './QualidadeComponents'
import { CausaRaizSection } from './CausaRaizSection'
import { RevisitaMotivosSection } from './RevisitaMotivosSection'

// ─── Datas (hora local, sem desvio UTC) ───────────────────────────────────────

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

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
function fmtPeriodo(ini: string): string {
  const [y, m] = ini.split('-').map(Number)
  return `${MESES[m - 1]}/${y}`
}

type Preset = 'atual' | 'anterior' | 'custom'

const TIPO_ICON: Record<Exclude<Tipo,'todos'>, typeof Wrench> = {
  instalacao: Home,
  manutencao: Wrench,
  servico:    Star,
}

// ─── Helpers de dados ────────────────────────────────────────────────────────

function parseDMY(s: string): string {
  // "DD/MM/YYYY" → "YYYY-MM-DD"
  if (!s || !s.includes('/')) return s
  const [d, m, y] = s.split('/')
  return `${y}-${m}-${d}`
}

interface DiaPoint { dia: string; label: string; inst: number; manut: number }

function buildDiario(rows: BacklogRow[]): DiaPoint[] {
  const map: Record<string, { inst: number; manut: number }> = {}
  for (const r of rows) {
    const iso = parseDMY(r.dataexecucao?.slice(0, 10) || r.datacadastro)
    if (!iso || iso.length < 10) continue
    if (!map[iso]) map[iso] = { inst: 0, manut: 0 }
    if (Number(r.revisita_inst)  === 1) map[iso].inst++
    if (Number(r.revisita_manut) === 1) map[iso].manut++
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, v]) => {
      const [, m, d] = iso.split('-')
      return { dia: iso, label: `${d}/${m}`, ...v }
    })
}

interface OcorrenciaItem { servico: string; count: number; os: BacklogRow[] }

function buildOcorrencias(rows: BacklogRow[]): OcorrenciaItem[] {
  const map: Record<string, BacklogRow[]> = {}
  for (const r of rows) {
    const key = (r.servico || 'Sem descrição').trim()
    if (!map[key]) map[key] = []
    map[key].push(r)
  }
  return Object.entries(map)
    .map(([servico, os]) => ({ servico, count: os.length, os }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
}

// ─── Helpers visuais ─────────────────────────────────────────────────────────

function fmt(n: number): string { return n.toLocaleString('pt-BR') }

// ─── QualidadePage ────────────────────────────────────────────────────────────

export default function QualidadePage() {
  const [preset,    setPreset]    = useState<Preset>('atual')
  const [customIni, setCustomIni] = useState(() => mesAnteriorRange()[0])
  const [customFim, setCustomFim] = useState(() => isoDate(new Date()))
  const [tipoAtivo, setTipoAtivo] = useState<Tipo>('todos')
  const [showDrill, setShowDrill] = useState(false)

  const [inicio, fim] = useMemo<[string, string]>(() => {
    if (preset === 'atual')    return mesAtualRange()
    if (preset === 'anterior') return mesAnteriorRange()
    const f   = customFim < customIni ? customIni : customFim
    const amanha = isoDate(new Date(new Date(f).getTime() + 86_400_000))
    return [customIni, amanha]
  }, [preset, customIni, customFim])

  const { data, isLoading, isError, refetch, isFetching } = useBacklog(inicio, fim)

  // ── Revisitas = qualquer flag de revisita ativo ───────────────────────
  const revisitas = useMemo(
    () => (data?.rows ?? []).filter(r =>
      Number(r.revisita_inst) === 1 ||
      Number(r.revisita_manut) === 1 ||
      Number(r.revisita_serv) === 1
    ),
    [data]
  )
  const totalOS   = data?.kpis.total ?? 0

  // Filtradas pelo tipo ativo — usa os flags do SQL
  const revisitasFiltradas = useMemo(() => {
    if (tipoAtivo === 'todos')       return revisitas
    if (tipoAtivo === 'instalacao')  return revisitas.filter(r => Number(r.revisita_inst)  === 1)
    if (tipoAtivo === 'manutencao')  return revisitas.filter(r => Number(r.revisita_manut) === 1)
    if (tipoAtivo === 'servico')     return revisitas.filter(r => Number(r.revisita_serv)  === 1)
    return revisitas
  }, [revisitas, tipoAtivo])

  // Contagens diretas pelos flags SQL
  const contagens = useMemo(() => ({
    instalacao: revisitas.filter(r => Number(r.revisita_inst)  === 1).length,
    manutencao: revisitas.filter(r => Number(r.revisita_manut) === 1).length,
    servico:    revisitas.filter(r => Number(r.revisita_serv)  === 1).length,
  }), [revisitas])

  // Ranking por equipe — usa revisitasFiltradas vs total do mesmo tipo
  const rankingEquipe = useMemo(() => {
    const allRows = data?.rows ?? []
    const totalMap: Record<string, number> = {}
    const revMap:   Record<string, number> = {}

    for (const r of allRows) {
      const eq    = r.nomedaequipe || 'Sem equipe'
      const isRev = tipoAtivo === 'todos'
        ? (Number(r.revisita_inst) + Number(r.revisita_manut) + Number(r.revisita_serv)) > 0
        : tipoAtivo === 'instalacao' ? Number(r.revisita_inst)  === 1
        : tipoAtivo === 'manutencao' ? Number(r.revisita_manut) === 1
        :                               Number(r.revisita_serv)  === 1
      totalMap[eq] = (totalMap[eq] ?? 0) + 1
      if (isRev) revMap[eq] = (revMap[eq] ?? 0) + 1
    }
    return Object.entries(revMap)
      .map(([equipe, rev]) => ({
        equipe,
        total: totalMap[equipe] ?? 0,
        rev,
        taxa: totalMap[equipe] ? Math.round((rev / totalMap[equipe]) * 100) : 0,
      }))
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 15)
  }, [data, tipoAtivo])

  // Clientes crônicos (3+ revisitas no período)
  const cronicos = useMemo(() => {
    const cnt: Record<string, { nome: string; count: number }> = {}
    for (const r of revisitasFiltradas) {
      const k = String(r.codigocliente || r.nomecliente)
      if (!cnt[k]) cnt[k] = { nome: r.nomecliente, count: 0 }
      cnt[k].count++
    }
    return Object.values(cnt)
      .filter(c => c.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
  }, [revisitasFiltradas])

  // Por cidade
  const porCidade = useMemo(() => {
    const m: Record<string, { rev: number; total: number }> = {}
    for (const r of (data?.rows ?? [])) {
      const c     = r.nomedacidade || 'Sem cidade'
      const isRev = tipoAtivo === 'todos'
        ? (Number(r.revisita_inst) + Number(r.revisita_manut) + Number(r.revisita_serv)) > 0
        : tipoAtivo === 'instalacao' ? Number(r.revisita_inst)  === 1
        : tipoAtivo === 'manutencao' ? Number(r.revisita_manut) === 1
        :                               Number(r.revisita_serv)  === 1
      if (!m[c]) m[c] = { rev: 0, total: 0 }
      m[c].total++
      if (isRev) m[c].rev++
    }
    return Object.entries(m)
      .map(([cidade, v]) => ({ cidade, ...v, taxa: v.total ? Math.round((v.rev / v.total) * 100) : 0 }))
      .sort((a, b) => b.rev - a.rev)
  }, [data, tipoAtivo])

  const maxRev    = Math.max(1, ...rankingEquipe.map(e => e.rev))
  const taxaGeral = totalOS > 0 ? Math.round((revisitasFiltradas.length / totalOS) * 100) : 0
  // Taxa de primeira visita (first-time-fix): OS do período que NÃO precisaram de retorno.
  // É o complemento direto da taxa de revisita — já era calculável, só nunca tinha sido
  // exposta como KPI nomeado e destacado.
  const taxaPrimeiraVisita = totalOS > 0 ? 100 - taxaGeral : 0
  const cor       = TIPO_COLOR[tipoAtivo]

  // Gráfico diário — sempre inst + manut independente do filtro de tipo
  const diario      = useMemo(() => buildDiario(revisitas), [revisitas])
  // Ocorrências — no tipo ativo
  const ocorrencias = useMemo(() => buildOcorrencias(revisitasFiltradas), [revisitasFiltradas])
  const [ocSelecionada, setOcSelecionada] = useState<OcorrenciaItem | null>(null)

  return (
    <div className="space-y-4 max-w-[1600px]">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-headline font-bold text-text mb-0.5">Qualidade — Revisitas</h1>
          <p className="text-label text-muted">
            Clientes que abriram nova OS após atendimento recente · instalação · manutenção · serviço
          </p>
        </div>

        {/* Controles de período */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-white/[0.08] bg-surface/40 overflow-hidden text-label">
            {(['atual','anterior','custom'] as Preset[]).map((v, i) => (
              <button key={v} onClick={() => setPreset(v)}
                      className={`px-3 py-1.5 transition-colors ${
                        preset === v ? 'bg-primary/20 text-primary font-semibold' : 'text-muted hover:text-text'
                      }`}>
                {['Mês Atual','Mês Anterior','Personalizado'][i]}
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
      </div>

      {/* Loading inicial */}
      {isLoading && !data && (
        <div className="flex items-center justify-center py-24 gap-3 text-secondary text-sm">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Consultando iManager…
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

          {/* Período + status */}
          <div className="flex items-center gap-2">
            <span className="text-caption text-muted">Período:</span>
            <span className="text-caption font-semibold text-text">{fmtPeriodo(data.periodo)}</span>
            {isFetching && (
              <span className="flex items-center gap-1 text-caption text-primary">
                <RefreshCw size={10} className="animate-spin" /> Atualizando…
              </span>
            )}
          </div>

          {/* ── Gráfico diário ───────────────────────────────────────────── */}
          {diario.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-[3px] h-4 rounded-full bg-violet-400 flex-shrink-0" />
                <span className="text-caption font-bold uppercase tracking-[0.07em] text-violet-400">
                  Acompanhamento Diário — Instalação vs Manutenção
                </span>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
                <div style={{ height: 220 }}>
                  <AreaChart data={diario}>
                    <defs>
                      <linearGradient id="gradInst"  x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
                      </linearGradient>
                      <linearGradient id="gradManut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#f97316" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <Grid />
                    <XAxis dataKey="label" interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} />
                    <ChartTooltip suffix=" revisitas" />
                    <Legend />
                    <Area dataKey="inst"  name="Instalação" stroke="#3b82f6" fill="url(#gradInst)"  strokeWidth={2} />
                    <Area dataKey="manut" name="Manutenção" stroke="#f97316" fill="url(#gradManut)" strokeWidth={2} />
                  </AreaChart>
                </div>
              </div>
            </section>
          )}

          {/* Tabs por tipo */}
          <div className="flex gap-2 flex-wrap">
            {(['todos','instalacao','manutencao','servico'] as Tipo[]).map(t => {
              const count = t === 'todos' ? revisitas.length : contagens[t as keyof typeof contagens]
              const Icon  = t !== 'todos' ? TIPO_ICON[t as Exclude<Tipo,'todos'>] : null
              const color = TIPO_COLOR[t]
              const ativo = tipoAtivo === t
              return (
                <button key={t} onClick={() => setTipoAtivo(t)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-label
                                    transition-all ${ativo
                                      ? 'font-bold border-current'
                                      : 'border-white/[0.08] text-muted hover:text-text bg-surface/30'}`}
                        style={ativo ? { color, borderColor: `${color}50`, background: `${color}10` } : {}}>
                  {Icon && <Icon size={12} />}
                  <span>{TIPO_LABEL[t]}</span>
                  <span className={`font-mono font-black text-body tabular-nums ml-1`}
                        style={{ color: ativo ? color : undefined }}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiCard label="Taxa de Primeira Visita"
                     value={`${taxaPrimeiraVisita}%`}
                     sub={`${fmt(totalOS - revisitasFiltradas.length)} de ${fmt(totalOS)} OS resolvidas sem retorno`}
                     color={taxaColor(taxaGeral)} delay={0} />
            <KpiCard label={`Revisitas${tipoAtivo !== 'todos' ? ` · ${TIPO_LABEL[tipoAtivo]}` : ' · Total'}`}
                     value={revisitasFiltradas.length}
                     sub={`${taxaGeral}% do total de ${fmt(totalOS)} OS no período`}
                     color={cor} delay={30} />
            <KpiCard label="Inst → Manut (BI)"
                     value={data?.kpis.rev_inst ?? 0}
                     sub="instalações que geraram VT no mesmo mês"
                     color="#3b82f6" delay={60} />
            <KpiCard label="Manut Repetida (BI)"
                     value={data?.kpis.rev_manut ?? 0}
                     sub="2ª+ manutenção do mesmo cliente no mês"
                     color="#f97316" delay={90} />
            <KpiCard label="Serviço → Manut (BI)"
                     value={data?.kpis.rev_serv ?? 0}
                     sub="serviço técnico que gerou VT no mesmo mês"
                     color="#22d3ee" delay={120} />
          </div>

          {/* ── Ocorrências que causam revisitas ────────────────────────── */}
          {ocorrencias.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: cor }} />
                <span className="text-caption font-bold uppercase tracking-[0.07em]" style={{ color: cor }}>
                  Principais Ocorrências — clique para ver as OS
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">

                {/* Gráfico horizontal */}
                <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
                  <div style={{ height: Math.max(180, ocorrencias.length * 34) }}>
                    <BarChart
                      data={ocorrencias.map(o => ({
                        servico: o.servico.length > 32 ? o.servico.slice(0, 32) + '…' : o.servico,
                        _full:   o.servico,
                        count:   o.count,
                      }))}
                      layout="vertical"
                    >
                      <BGrid horizontal={false} vertical />
                      <BXAxis type="number" allowDecimals={false} />
                      <BYAxis type="category" dataKey="servico" width={200} tick={{ fontSize: 10 }} />
                      <BTip suffix=" revisitas" />
                      <Bar
                        dataKey="count"
                        name="Revisitas"
                        fill={cor}
                        radius={3}
                        onClick={(row: any) => {
                          const found = ocorrencias.find(o => o.servico === row._full)
                          setOcSelecionada(found ?? null)
                        }}
                      />
                    </BarChart>
                  </div>
                  <p className="text-caption text-muted mt-2 text-center">Clique numa barra para ver as OS</p>
                </div>

                {/* Painel de OS da ocorrência selecionada */}
                <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
                  {ocSelecionada ? (
                    <>
                      <div className="px-4 py-3 border-b border-white/[0.05] flex items-start justify-between gap-2">
                        <div>
                          <p className="text-caption font-bold text-text leading-tight">{ocSelecionada.servico}</p>
                          <p className="text-caption text-muted mt-0.5">{ocSelecionada.count} revisitas</p>
                        </div>
                        <button onClick={() => setOcSelecionada(null)}
                                className="text-caption text-muted hover:text-text transition-colors flex-shrink-0">✕</button>
                      </div>
                      <div className="overflow-y-auto max-h-[340px] divide-y divide-white/[0.04]">
                        {ocSelecionada.os.map(r => (
                          <div key={r.numos} className="px-4 py-2.5 hover:bg-surface/20 transition-colors">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-label text-primary flex-shrink-0">{r.numos}</span>
                              <span className="text-caption text-muted flex-shrink-0">{r.datacadastro}</span>
                            </div>
                            <p className="text-[11.5px] text-text truncate mt-0.5">{r.nomecliente}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-caption text-muted">{r.nomedacidade}</span>
                              <span className="text-caption text-muted/50">·</span>
                              <span className="text-caption text-muted truncate">{r.nomedaequipe || '—'}</span>
                              <span className="text-caption text-muted/50 ml-auto flex-shrink-0">·</span>
                              <span className="text-caption text-muted flex-shrink-0">{r.descsituacao}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted">
                      <Search size={24} className="opacity-30" />
                      <p className="text-label">Selecione uma ocorrência no gráfico</p>
                      <p className="text-caption opacity-60">para ver as OS associadas</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Ranking equipe + Cidades + Crônicos */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

            {/* Ranking por equipe */}
            {rankingEquipe.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: cor }} />
                  <Users size={12} style={{ color: cor }} className="flex-shrink-0" />
                  <span className="text-caption font-bold uppercase tracking-[0.07em]" style={{ color: cor }}>
                    Ranking — Revisitas por Equipe
                  </span>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/[0.05] bg-surface/10">
                          {['#','Equipe','Total OS','Revisitas','Taxa','Status'].map(h => (
                            <th key={h} className="px-3 py-2.5 text-right first:text-left first:px-4
                                                    text-caption font-bold uppercase tracking-[0.05em] text-muted">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rankingEquipe.map((eq, i) => (
                          <EquipeRow key={eq.equipe} rank={i + 1} eq={eq} max={maxRev} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* Coluna direita: cidades + crônicos */}
            <div className="space-y-3">

              {/* Por cidade */}
              {porCidade.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-[3px] h-4 rounded-full bg-cyan-400 flex-shrink-0" />
                    <MapPin size={12} className="text-cyan-400 flex-shrink-0" />
                    <span className="text-caption font-bold uppercase tracking-[0.07em] text-cyan-400">
                      Por Cidade
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden divide-y divide-white/[0.04]">
                    {porCidade.map(c => {
                      const color = taxaColor(c.taxa)
                      const maxC  = porCidade[0]?.rev ?? 1
                      return (
                        <div key={c.cidade} className="flex items-center gap-3 px-4 py-3 hover:bg-surface/20 transition-colors">
                          <span className="text-label font-semibold text-text w-32 flex-shrink-0 truncate">{c.cidade}</span>
                          <div className="flex-1 h-1.5 bg-surface/40 rounded-full overflow-hidden">
                            <div className="h-full rounded-full"
                                 style={{ width: `${Math.round((c.rev/maxC)*100)}%`, background: color }} />
                          </div>
                          <span className="font-mono font-bold text-body w-8 text-right" style={{ color }}>{c.rev}</span>
                          <span className="text-caption text-muted w-9 text-right">{c.taxa}%</span>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Clientes crônicos */}
              {cronicos.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-[3px] h-4 rounded-full bg-red-400 flex-shrink-0" />
                    <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
                    <span className="text-caption font-bold uppercase tracking-[0.07em] text-red-400">
                      Crônicos — 2+ revisitas
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
                    <div className="max-h-64 overflow-y-auto divide-y divide-white/[0.04]">
                      {cronicos.map(c => {
                        const color = c.count >= 4 ? '#f87171' : c.count >= 3 ? '#f97316' : '#facc15'
                        return (
                          <div key={c.nome} className="flex items-center gap-2 px-4 py-2.5 hover:bg-surface/20 transition-colors">
                            <p className="flex-1 text-[11.5px] text-text truncate">{c.nome}</p>
                            <span className="font-mono font-bold text-body" style={{ color }}>{c.count}×</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* Drill-down */}
          <div>
            <button onClick={() => setShowDrill(v => !v)}
                    className="text-label text-muted hover:text-text transition-colors py-1 flex items-center gap-1">
              {showDrill ? '▲ Ocultar' : '▼ Ver'} lista completa de revisitas ({fmt(revisitasFiltradas.length)})
            </button>
          </div>
          {showDrill && <DrillTable rows={revisitasFiltradas} />}

          {/* ── Causa Raiz registrada pelo time (real, via Telegram) ─── */}
          <section className="space-y-2 pt-2">
            <div className="flex items-center gap-2.5">
              <div className="w-[3px] h-4 rounded-full bg-teal-400 flex-shrink-0" />
              <ClipboardCheck size={12} className="text-teal-400 flex-shrink-0" />
              <span className="text-caption font-bold uppercase tracking-[0.07em] text-teal-400">
                Causa Raiz Registrada pelo Time
              </span>
            </div>
            <RevisitaMotivosSection />
          </section>

          {/* ── Causa Raiz por IA (inferida das observações) ─────────── */}
          <section className="space-y-2 pt-2">
            <div className="flex items-center gap-2.5">
              <div className="w-[3px] h-4 rounded-full bg-violet-500 flex-shrink-0" />
              <Sparkles size={12} className="text-violet-400 flex-shrink-0" />
              <span className="text-caption font-bold uppercase tracking-[0.07em] text-violet-400">
                Causa Raiz de Revisitas (IA, inferida das observações)
              </span>
            </div>
            <CausaRaizSection inicio={inicio} fim={fim} />
          </section>

        </div>
      )}
    </div>
  )
}
