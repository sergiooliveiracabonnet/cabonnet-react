import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import type { BacklogRow } from '../../../hooks/useBacklog'

// ─── Classificação por tipo ───────────────────────────────────────────────────

export type Tipo = 'todos' | 'instalacao' | 'manutencao' | 'servico'

const SERVICO_KEYWORDS = [
  'TRANSF', 'MUDANCA PONTO', 'MUDANÇA PONTO',
  'MUDANCA DE ENDER', 'MUDANÇA DE ENDER',
  'CABEAMENTO', 'ROTEADOR',
  'TROCA DE ONU', 'TROCA DE ONT',
  ' ONU ', '-ONU', 'ONU-',
  'TROCA DE EQUIPAMENTO', 'EQUIPAMENTO - TROCA', 'EQUIP - TROCA',
  'TROCA DE CABO', 'CONFIGURACAO', 'CONFIGURAÇÃO',
  'PONTO EXTRA', 'MUDANCA PONTO DE CONEXAO',
]

const VT_KEYWORDS = [
  ' VT ', '-VT', 'VT-', 'VT 24', 'VT24',
  'VISITA TEC', 'VISITA TÉC', 'ASSISTENCIA', 'ASSISTÊNCIA',
]

export function classificaTipo(servico: string, tiposervico: string): Exclude<Tipo, 'todos'> {
  const s = (servico     ?? '').toUpperCase().trim()
  const t = (tiposervico ?? '').toUpperCase().trim()

  if (s.includes('INSTALAC') || s.includes('INSTALAÇÃO') ||
      s.includes('PRIMEIRA CONEXAO') || s.includes('PRIMEIRA CONEXÃO') ||
      t.includes('INSTALAC'))
    return 'instalacao'

  if (SERVICO_KEYWORDS.some(k => s.includes(k)))
    return 'servico'

  if (VT_KEYWORDS.some(k => s.includes(k)) ||
      s.includes('MANUTENC') || s.includes('MANUTEN') ||
      t.includes('MANUTENC'))
    return 'manutencao'

  if (t.includes('INSTALAC')) return 'instalacao'
  if (t.includes('SERVIC'))   return 'servico'

  return 'manutencao'
}

export const TIPO_LABEL: Record<Tipo, string> = {
  todos:      'Todos',
  instalacao: 'Instalação',
  manutencao: 'Manutenção',
  servico:    'Serviço / Interno',
}

export const TIPO_COLOR: Record<Tipo, string> = {
  todos:      '#c4b5fd',
  instalacao: '#3b82f6',
  manutencao: '#f97316',
  servico:    '#22d3ee',
}

// ─── Helpers visuais ─────────────────────────────────────────────────────────

function fmt(n: number): string { return n.toLocaleString('pt-BR') }

export function taxaColor(taxa: number): string {
  if (taxa >= 25) return '#f87171'
  if (taxa >= 15) return '#f97316'
  if (taxa >= 8)  return '#facc15'
  return '#4ade80'
}

export function taxaLabel(taxa: number): string {
  if (taxa >= 25) return 'Crítico'
  if (taxa >= 15) return 'Alto'
  if (taxa >= 8)  return 'Médio'
  return 'OK'
}

// ─── EquipeRow ────────────────────────────────────────────────────────────────

export interface EquipeStats { equipe: string; total: number; rev: number; taxa: number }

export function EquipeRow({ rank, eq, max }: { rank: number; eq: EquipeStats; max: number }) {
  const color = taxaColor(eq.taxa)
  const barW  = max > 0 ? Math.round((eq.rev / max) * 100) : 0
  return (
    <tr className="border-b border-white/[0.04] hover:bg-surface/20 transition-colors">
      <td className="px-4 py-3 w-10">
        {rank <= 3
          ? <span className="font-mono font-black text-body"
                  style={{ color: ['#f87171','#f97316','#facc15'][rank - 1] }}>#{rank}</span>
          : <span className="font-mono text-label text-muted">{rank}</span>}
      </td>
      <td className="px-3 py-3 max-w-[180px]">
        <p className="text-label font-semibold text-text truncate">{eq.equipe}</p>
      </td>
      <td className="px-3 py-3 text-right font-mono text-body text-muted">{fmt(eq.total)}</td>
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
        <span className="text-caption font-bold px-2 py-0.5 rounded-full border"
              style={{ background: `${color}12`, borderColor: `${color}30`, color }}>
          {taxaLabel(eq.taxa)}
        </span>
      </td>
    </tr>
  )
}

// ─── DrillTable ───────────────────────────────────────────────────────────────

export function DrillTable({ rows }: { rows: BacklogRow[] }) {
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
                            text-label text-text placeholder-muted focus:outline-none focus:border-primary/40" />
        </div>
        <select value={cidade} onChange={e => { setCidade(e.target.value); setPage(1) }}
                className="px-3 py-2 rounded-lg border border-white/[0.08] bg-surface/40 text-label text-text focus:outline-none">
          {cidades.map(c => <option key={c}>{c}</option>)}
        </select>
        <span className="text-caption text-muted ml-auto">{fmt(filtered.length)} revisitas</span>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="border-b border-white/[0.05] bg-surface/10">
                {['N° OS','Cliente','Cidade','Tipo','Serviço','Equipe','Cadastro','Situação'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-caption font-bold uppercase tracking-[0.05em] text-muted whitespace-nowrap">
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
                      <span className="text-caption font-bold" style={{ color: tc }}>
                        {TIPO_LABEL[classificaTipo(r.servico, r.tiposervico)]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[140px]"><p className="truncate text-muted">{r.servico}</p></td>
                    <td className="px-3 py-2.5 max-w-[120px]"><p className="truncate text-muted">{r.nomedaequipe || '—'}</p></td>
                    <td className="px-3 py-2.5 text-muted whitespace-nowrap">{r.datacadastro}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-caption text-muted">{r.descsituacao}</span>
                    </td>
                  </tr>
                )
              })}
              {slice.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted text-label">
                    Nenhuma revisita encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.05] bg-surface/10">
            <span className="text-caption text-muted">Página {page} de {totalPages}</span>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                      className="px-3 py-1 rounded text-caption border border-white/[0.08] text-muted
                                 disabled:opacity-30 hover:bg-surface/30 transition-colors">‹</button>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                      className="px-3 py-1 rounded text-caption border border-white/[0.08] text-muted
                                 disabled:opacity-30 hover:bg-surface/30 transition-colors">›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
