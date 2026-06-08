import { useMemo, useState } from 'react'
import { AlertTriangle, MapPin, Users, RefreshCw, Search, Wrench, Home, Star } from 'lucide-react'
import { useBacklog, type BacklogRow } from '../../../hooks/useBacklog'
import { AreaChart, Area, XAxis, YAxis, Grid, ChartTooltip, Legend } from '../../../components/ui/line-chart'
import { BarChart, Bar, XAxis as BXAxis, YAxis as BYAxis, Grid as BGrid, ChartTooltip as BTip } from '../../../components/ui/bar-chart'

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

// ─── Classificação por tipo ───────────────────────────────────────────────────

type Tipo = 'todos' | 'instalacao' | 'manutencao' | 'servico'

// Serviços técnicos pontuais (não VT, não instalação)
const SERVICO_KEYWORDS = [
  'TRANSF',           // transferência de endereço
  'MUDANCA PONTO', 'MUDANÇA PONTO',
  'MUDANCA DE ENDER', 'MUDANÇA DE ENDER',
  'CABEAMENTO',
  'ROTEADOR',
  'TROCA DE ONU', 'TROCA DE ONT',
  ' ONU ', '-ONU', 'ONU-',
  'TROCA DE EQUIPAMENTO', 'EQUIPAMENTO - TROCA', 'EQUIP - TROCA',
  'TROCA DE CABO',
  'CONFIGURACAO', 'CONFIGURAÇÃO',
  'PONTO EXTRA',
  'MUDANCA PONTO DE CONEXAO',
]

// VT = Visita Técnica → Manutenção
const VT_KEYWORDS = [
  ' VT ', '-VT', 'VT-', 'VT 24', 'VT24',
  'VISITA TEC', 'VISITA TÉC',
  'ASSISTENCIA', 'ASSISTÊNCIA',
]

function classificaTipo(servico: string, tiposervico: string): Exclude<Tipo, 'todos'> {
  const s = (servico     ?? '').toUpperCase().trim()
  const t = (tiposervico ?? '').toUpperCase().trim()

  // Instalação — checa servico primeiro, depois tiposervico
  if (s.includes('INSTALAC') || s.includes('INSTALAÇÃO') ||
      s.includes('PRIMEIRA CONEXAO') || s.includes('PRIMEIRA CONEXÃO') ||
      t.includes('INSTALAC'))
    return 'instalacao'

  // Serviços técnicos pontuais
  if (SERVICO_KEYWORDS.some(k => s.includes(k)))
    return 'servico'

  // VT / Manutenção
  if (VT_KEYWORDS.some(k => s.includes(k)) ||
      s.includes('MANUTENC') || s.includes('MANUTEN') ||
      t.includes('MANUTENC'))
    return 'manutencao'

  // Fallback pelo tiposervico genérico
  if (t.includes('INSTALAC')) return 'instalacao'
  if (t.includes('SERVIC'))   return 'servico'

  return 'manutencao' // default técnico
}

const TIPO_LABEL: Record<Tipo, string> = {
  todos:      'Todos',
  instalacao: 'Instalação',
  manutencao: 'Manutenção',
  servico:    'Serviço / Interno',
}
const TIPO_COLOR: Record<Tipo, string> = {
  todos:      '#c4b5fd',
  instalacao: '#3b82f6',
  manutencao: '#f97316',
  servico:    '#22d3ee',
}
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

function taxaColor(taxa: number): string {
  if (taxa >= 25) return '#f87171'
  if (taxa >= 15) return '#f97316'
  if (taxa >= 8)  return '#facc15'
  return '#4ade80'
}
function taxaLabel(taxa: number): string {
  if (taxa >= 25) return 'Crítico'
  if (taxa >= 15) return 'Alto'
  if (taxa >= 8)  return 'Médio'
  return 'OK'
}

// ─── Componentes ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, delay = 0 }: {
  label: string; value: string | number; sub: string; color: string; delay?: number
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card animate-card-enter"
         style={{ borderColor: `${color}22`, animationDelay: `${delay}ms` }}>
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: color }} />
      <div className="p-4">
        <p className="text-[11px] text-muted mb-2">{label}</p>
        <p className="font-mono font-black tabular-nums text-[28px] leading-none" style={{ color }}>
          {typeof value === 'number' ? fmt(value) : value}
        </p>
        <p className="text-[10px] text-muted mt-1">{sub}</p>
      </div>
    </div>
  )
}

interface EquipeStats { equipe: string; total: number; rev: number; taxa: number }

function EquipeRow({ rank, eq, max }: { rank: number; eq: EquipeStats; max: number }) {
  const color = taxaColor(eq.taxa)
  const barW  = max > 0 ? Math.round((eq.rev / max) * 100) : 0
  return (
    <tr className="border-b border-white/[0.04] hover:bg-surface/20 transition-colors">
      <td className="px-4 py-3 w-10">
        {rank <= 3
          ? <span className="font-mono font-black text-[13px]"
                  style={{ color: ['#f87171','#f97316','#facc15'][rank - 1] }}>#{rank}</span>
          : <span className="font-mono text-[12px] text-muted">{rank}</span>}
      </td>
      <td className="px-3 py-3 max-w-[180px]">
        <p className="text-[12px] font-semibold text-text truncate">{eq.equipe}</p>
      </td>
      <td className="px-3 py-3 text-right font-mono text-[13px] text-muted">{fmt(eq.total)}</td>
      <td className="px-3 py-3 text-right">
        <p className="font-mono font-bold text-[16px] leading-none" style={{ color }}>{fmt(eq.rev)}</p>
        <div className="mt-1 h-1 w-16 ml-auto bg-surface/40 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${barW}%`, background: color }} />
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <p className="font-mono font-bold text-[16px] leading-none" style={{ color }}>{eq.taxa}%</p>
      </td>
      <td className="px-3 py-3 text-right">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{ background: `${color}12`, borderColor: `${color}30`, color }}>
          {taxaLabel(eq.taxa)}
        </span>
      </td>
    </tr>
  )
}

function DrillTable({ rows }: { rows: BacklogRow[] }) {
  const [search, setSearch] = useState('')
  const [cidade, setCidade] = useState('Todas')
  const [page,   setPage]   = useState(1)
  const PAGE = 50

  const cidades = useMemo(() => ['Todas', ...Array.from(new Set(rows.map(r => r.nomedacidade).filter(Boolean))).sort()], [rows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return rows.filter(r => {
      if (cidade !== 'Todas' && r.nomedacidade !== cidade) return false
      if (q && !r.numos.includes(q) && !r.nomecliente.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, cidade, search])

  const totalPages = Math.ceil(filtered.length / PAGE)
  const slice      = filtered.slice((page - 1) * PAGE, page * PAGE)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px] max-w-[260px]">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                 placeholder="Buscar numos ou cliente…"
                 className="w-full pl-8 pr-3 py-2 rounded-lg border border-white/[0.08] bg-surface/40
                            text-[12px] text-text placeholder-muted focus:outline-none focus:border-primary/40" />
        </div>
        <select value={cidade} onChange={e => { setCidade(e.target.value); setPage(1) }}
                className="px-3 py-2 rounded-lg border border-white/[0.08] bg-surface/40 text-[12px] text-text focus:outline-none">
          {cidades.map(c => <option key={c}>{c}</option>)}
        </select>
        <span className="text-[11px] text-muted ml-auto">{fmt(filtered.length)} revisitas</span>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="border-b border-white/[0.05] bg-surface/10">
                {['N° OS','Cliente','Cidade','Tipo','Serviço','Equipe','Cadastro','Situação'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map(r => {
                const tc = TIPO_COLOR[classificaTipo(r.servico, r.tiposervico)]
                return (
                  <tr key={r.numos} className="border-b border-white/[0.03] hover:bg-surface/15 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-primary">{r.numos}</td>
                    <td className="px-3 py-2.5 max-w-[140px]"><p className="truncate text-text">{r.nomecliente}</p></td>
                    <td className="px-3 py-2.5 text-muted whitespace-nowrap">{r.nomedacidade}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-[10px] font-bold" style={{ color: tc }}>
                        {TIPO_LABEL[classificaTipo(r.servico, r.tiposervico)]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[140px]"><p className="truncate text-muted">{r.servico}</p></td>
                    <td className="px-3 py-2.5 max-w-[120px]"><p className="truncate text-muted">{r.nomedaequipe || '—'}</p></td>
                    <td className="px-3 py-2.5 text-muted whitespace-nowrap">{r.datacadastro}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] text-muted">{r.descsituacao}</span>
                    </td>
                  </tr>
                )
              })}
              {slice.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted text-[12px]">
                    Nenhuma revisita encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.05] bg-surface/10">
            <span className="text-[11px] text-muted">Página {page} de {totalPages}</span>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                      className="px-3 py-1 rounded text-[11px] border border-white/[0.08] text-muted
                                 disabled:opacity-30 hover:bg-surface/30 transition-colors">‹</button>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                      className="px-3 py-1 rounded text-[11px] border border-white/[0.08] text-muted
                                 disabled:opacity-30 hover:bg-surface/30 transition-colors">›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

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
    const amanhã = isoDate(new Date(new Date(f).getTime() + 86_400_000))
    return [customIni, amanhã]
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
          <p className="text-[12px] text-muted">
            Clientes que abriram nova OS após atendimento recente · instalação · manutenção · serviço
          </p>
        </div>

        {/* Controles de período */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-white/[0.08] bg-surface/40 overflow-hidden text-[12px]">
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
                                text-[12px] text-text focus:outline-none" />
              <span className="text-[11px] text-muted">até</span>
              <input type="date" value={customFim} onChange={e => setCustomFim(e.target.value)}
                     className="px-2 py-1.5 rounded-lg border border-white/[0.08] bg-surface/40
                                text-[12px] text-text focus:outline-none" />
            </div>
          )}
          <button onClick={() => refetch()} disabled={isFetching}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08]
                             bg-surface/40 text-[12px] text-muted hover:text-text transition-colors disabled:opacity-50">
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
          <p className="text-[13px] text-red-400">Erro ao carregar dados.</p>
          <button onClick={() => refetch()} className="mt-3 text-[11px] text-muted underline">Tentar novamente</button>
        </div>
      )}

      {data && (
        <div className={`space-y-4 transition-opacity duration-200 ${isFetching ? 'opacity-60' : ''}`}>

          {/* Período + status */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted">Período:</span>
            <span className="text-[11px] font-semibold text-text">{fmtPeriodo(data.periodo)}</span>
            {isFetching && (
              <span className="flex items-center gap-1 text-[10px] text-primary">
                <RefreshCw size={10} className="animate-spin" /> Atualizando…
              </span>
            )}
          </div>

          {/* ── Gráfico diário ───────────────────────────────────────────── */}
          {diario.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-[3px] h-4 rounded-full bg-violet-400 flex-shrink-0" />
                <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-violet-400">
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
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[12px]
                                    transition-all ${ativo
                                      ? 'font-bold border-current'
                                      : 'border-white/[0.08] text-muted hover:text-text bg-surface/30'}`}
                        style={ativo ? { color, borderColor: `${color}50`, background: `${color}10` } : {}}>
                  {Icon && <Icon size={12} />}
                  <span>{TIPO_LABEL[t]}</span>
                  <span className={`font-mono font-black text-[14px] tabular-nums ml-1`}
                        style={{ color: ativo ? color : undefined }}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label={`Revisitas${tipoAtivo !== 'todos' ? ` · ${TIPO_LABEL[tipoAtivo]}` : ' · Total'}`}
                     value={revisitasFiltradas.length}
                     sub={`${taxaGeral}% do total de ${fmt(totalOS)} OS no período`}
                     color={cor} delay={0} />
            <KpiCard label="Inst → Manut (BI)"
                     value={data?.kpis.rev_inst ?? 0}
                     sub="instalações que geraram VT no mesmo mês"
                     color="#3b82f6" delay={60} />
            <KpiCard label="Manut Repetida (BI)"
                     value={data?.kpis.rev_manut ?? 0}
                     sub="2ª+ manutenção do mesmo cliente no mês"
                     color="#f97316" delay={120} />
            <KpiCard label="Serviço → Manut (BI)"
                     value={data?.kpis.rev_serv ?? 0}
                     sub="serviço técnico que gerou VT no mesmo mês"
                     color="#22d3ee" delay={180} />
          </div>

          {/* ── Ocorrências que causam revisitas ────────────────────────── */}
          {ocorrencias.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: cor }} />
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: cor }}>
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
                  <p className="text-[10px] text-muted mt-2 text-center">Clique numa barra para ver as OS</p>
                </div>

                {/* Painel de OS da ocorrência selecionada */}
                <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
                  {ocSelecionada ? (
                    <>
                      <div className="px-4 py-3 border-b border-white/[0.05] flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-bold text-text leading-tight">{ocSelecionada.servico}</p>
                          <p className="text-[10px] text-muted mt-0.5">{ocSelecionada.count} revisitas</p>
                        </div>
                        <button onClick={() => setOcSelecionada(null)}
                                className="text-[11px] text-muted hover:text-text transition-colors flex-shrink-0">✕</button>
                      </div>
                      <div className="overflow-y-auto max-h-[340px] divide-y divide-white/[0.04]">
                        {ocSelecionada.os.map(r => (
                          <div key={r.numos} className="px-4 py-2.5 hover:bg-surface/20 transition-colors">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[12px] text-primary flex-shrink-0">{r.numos}</span>
                              <span className="text-[10px] text-muted flex-shrink-0">{r.datacadastro}</span>
                            </div>
                            <p className="text-[11.5px] text-text truncate mt-0.5">{r.nomecliente}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted">{r.nomedacidade}</span>
                              <span className="text-[10px] text-muted/50">·</span>
                              <span className="text-[10px] text-muted truncate">{r.nomedaequipe || '—'}</span>
                              <span className="text-[10px] text-muted/50 ml-auto flex-shrink-0">·</span>
                              <span className="text-[10px] text-muted flex-shrink-0">{r.descsituacao}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted">
                      <Search size={24} className="opacity-30" />
                      <p className="text-[12px]">Selecione uma ocorrência no gráfico</p>
                      <p className="text-[10px] opacity-60">para ver as OS associadas</p>
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
                  <span className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: cor }}>
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
                                                    text-[10px] font-bold uppercase tracking-[0.05em] text-muted">
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
                    <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-cyan-400">
                      Por Cidade
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden divide-y divide-white/[0.04]">
                    {porCidade.map(c => {
                      const color = taxaColor(c.taxa)
                      const maxC  = porCidade[0]?.rev ?? 1
                      return (
                        <div key={c.cidade} className="flex items-center gap-3 px-4 py-3 hover:bg-surface/20 transition-colors">
                          <span className="text-[12px] font-semibold text-text w-32 flex-shrink-0 truncate">{c.cidade}</span>
                          <div className="flex-1 h-1.5 bg-surface/40 rounded-full overflow-hidden">
                            <div className="h-full rounded-full"
                                 style={{ width: `${Math.round((c.rev/maxC)*100)}%`, background: color }} />
                          </div>
                          <span className="font-mono font-bold text-[13px] w-8 text-right" style={{ color }}>{c.rev}</span>
                          <span className="text-[10px] text-muted w-9 text-right">{c.taxa}%</span>
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
                    <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-red-400">
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
                            <span className="font-mono font-bold text-[13px]" style={{ color }}>{c.count}×</span>
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
                    className="text-[12px] text-muted hover:text-text transition-colors py-1 flex items-center gap-1">
              {showDrill ? '▲ Ocultar' : '▼ Ver'} lista completa de revisitas ({fmt(revisitasFiltradas.length)})
            </button>
          </div>
          {showDrill && <DrillTable rows={revisitasFiltradas} />}

        </div>
      )}
    </div>
  )
}
