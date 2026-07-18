import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown,
  Users, RotateCcw, Copy, Check, ClipboardList, MapPin,
} from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { shortEquipe, situacaoVariant, buildOSWhatsApp, CATEGORIA_LABEL, CATEGORIA_COLOR } from '../../lib/osFormat'
import { useOSDetails, parseOSDetails, osDetailsQuery } from '../../hooks/useOSDetails'
import type { OSRow } from '../../lib/types'

type SortKey = 'numos' | 'cliente' | 'tipo' | 'equipe' | 'situacao' | 'aging' | 'data'

// Larguras compartilhadas entre o cabeçalho e as linhas — mesma constante nos dois
// lugares evita desalinhamento quando o texto de uma coluna (ex: "Reagendamento") varia.
const COL_W = {
  chevron:  'w-4',
  numos:    'w-[72px]',
  tipo:     'w-[92px]',
  equipe:   'w-[150px]',
  situacao: 'w-[124px]',
  aging:    'w-[52px]',
  data:     'w-[80px]',
  action:   'w-4',
}

function compareRows(a: OSRow, b: OSRow, key: SortKey): number {
  switch (key) {
    case 'numos':    return a.numos.localeCompare(b.numos)
    case 'cliente':  return (a.nomecliente || '').localeCompare(b.nomecliente || '', 'pt-BR')
    case 'tipo':     return (CATEGORIA_LABEL[a._categoria] ?? '').localeCompare(CATEGORIA_LABEL[b._categoria] ?? '', 'pt-BR')
    case 'equipe':   return shortEquipe(a.nomedaequipe).localeCompare(shortEquipe(b.nomedaequipe), 'pt-BR')
    case 'situacao': return (a._situacaoEfetiva ?? a.descsituacao ?? '').localeCompare(b._situacaoEfetiva ?? b.descsituacao ?? '', 'pt-BR')
    case 'aging':    return (a._aging ?? -1) - (b._aging ?? -1)
    case 'data':     return (a.dataagendamento || '').localeCompare(b.dataagendamento || '')
  }
}

function SortHeader({ label, active, dir, onClick, className = '' }: {
  label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void; className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-0.5 text-caption font-semibold uppercase tracking-wide transition-colors flex-shrink-0
                  ${active ? 'text-primary' : 'text-muted hover:text-secondary'} ${className}`}
    >
      {label}
      {active
        ? (dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
        : <ChevronsUpDown size={11} className="opacity-40" />}
    </button>
  )
}

// Timeline de reagendamentos/ocorrências de uma OS — busca /detalhes sob demanda.
function OcorrenciasExpand({ numos }: { numos: string }) {
  const { details, isLoading } = useOSDetails(numos)
  if (isLoading) return <p className="px-10 py-3 text-caption text-muted">⏳ Carregando histórico…</p>
  const hist = details?.historico ?? []
  const equipeReagend = details?.equipeReagend
  if (!hist.length) return <p className="px-10 py-3 text-caption text-muted/60 italic">Sem ocorrências registradas.</p>
  return (
    <div className="px-10 py-3 space-y-2 bg-surface/20">
      {equipeReagend && (
        <p className="text-caption text-muted flex items-center gap-1.5">
          <Users size={10} className="opacity-50" /> Equipe do reagendamento:
          <span className="text-secondary font-medium">{shortEquipe(equipeReagend)}</span>
        </p>
      )}
      {hist.map((e, i) => (
        <div key={i}
             className={`rounded-xl px-3 py-2 border ${e.isReagend ? 'bg-orange/[0.08] border-orange/25' : 'bg-surface/30 border-white/[0.06]'}`}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {e.isReagend && (
              <span className="flex items-center gap-1 text-caption font-bold uppercase tracking-wide text-orange/80">
                <RotateCcw size={9} /> Reagendamento
              </span>
            )}
            {e.autor && <span className="text-caption font-semibold text-muted">{e.autor}</span>}
            {e.data && <span className="font-mono text-caption text-muted/60">{e.data}{e.hora ? ` ${e.hora}` : ''}</span>}
          </div>
          <p className={`text-caption leading-relaxed whitespace-pre-wrap ${e.isReagend ? 'text-orange/90' : 'text-secondary'}`}>
            {e.texto}
          </p>
        </div>
      ))}
    </div>
  )
}

export function KpiModalTable({ rows, onOS }: { rows: OSRow[]; onOS: (os: OSRow) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copied,   setCopied]   = useState<string | null>(null)
  const [sortKey,  setSortKey]  = useState<SortKey>('aging')
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>('desc')
  const queryClient = useQueryClient()

  function toggleSort(key: SortKey) {
    if (key === sortKey) { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); return }
    setSortKey(key)
    setSortDir(key === 'aging' ? 'desc' : 'asc')
  }

  function flashCopied(key: string) { setCopied(key); setTimeout(() => setCopied(null), 1800) }

  // Copia só o resumo da OS (instantâneo).
  function copyResumo(os: OSRow) {
    navigator.clipboard.writeText(buildOSWhatsApp(os)).catch(() => {}); flashCopied(`${os.numos}:os`)
  }

  // Busca o histórico (/detalhes) e copia a OS com a linha do tempo anexada.
  async function copyCompleto(os: OSRow) {
    flashCopied(`${os.numos}:full`)
    let historico
    try {
      const data = await queryClient.fetchQuery(osDetailsQuery(os.numos))
      historico = parseOSDetails(data)?.historico
    } catch { /* sem detalhes: copia só o resumo */ }
    navigator.clipboard.writeText(buildOSWhatsApp(os, historico)).catch(() => {})
  }

  function copyCity(cidade: string, list: OSRow[]) {
    const text = `*${cidade}* — ${list.length} OS\n\n${list.map(os => buildOSWhatsApp(os)).join('\n\n')}`
    navigator.clipboard.writeText(text).catch(() => {}); flashCopied(`city:${cidade}`)
  }

  // Agrupa por cidade (volume desc); dentro de cada cidade, ordena pela coluna selecionada
  const grupos = useMemo(() => {
    const map = new Map<string, OSRow[]>()
    for (const os of rows) {
      const c = (os.nomedacidade || '').trim() || '—'
      if (!map.has(c)) map.set(c, [])
      map.get(c)!.push(os)
    }
    const dir = sortDir === 'asc' ? 1 : -1
    for (const list of map.values()) list.sort((a, b) => dir * compareRows(a, b, sortKey))
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [rows, sortKey, sortDir])

  if (!rows.length) return <p className="text-center text-muted text-label py-10">Nenhuma OS encontrada.</p>

  return (
    <div className="overflow-auto max-h-[72vh]">
      {/* Cabeçalho de colunas — clique para ordenar */}
      <div className="sticky top-0 z-20 h-9 flex items-center gap-3 bg-card px-5 border-b border-white/[0.12]">
        <span className={`${COL_W.chevron} flex-shrink-0`} />
        <SortHeader label="Nº OS"    active={sortKey === 'numos'}    dir={sortDir} onClick={() => toggleSort('numos')}    className={COL_W.numos} />
        <SortHeader label="Cliente"  active={sortKey === 'cliente'}  dir={sortDir} onClick={() => toggleSort('cliente')}  className="flex-1 min-w-[160px]" />
        <SortHeader label="Tipo"     active={sortKey === 'tipo'}     dir={sortDir} onClick={() => toggleSort('tipo')}     className={`hidden sm:flex ${COL_W.tipo}`} />
        <SortHeader label="Equipe"   active={sortKey === 'equipe'}   dir={sortDir} onClick={() => toggleSort('equipe')}   className={`hidden md:flex ${COL_W.equipe}`} />
        <SortHeader label="Situação" active={sortKey === 'situacao'} dir={sortDir} onClick={() => toggleSort('situacao')} className={COL_W.situacao} />
        <SortHeader label="Aging"    active={sortKey === 'aging'}    dir={sortDir} onClick={() => toggleSort('aging')}    className={COL_W.aging} />
        <SortHeader label="Agend."   active={sortKey === 'data'}     dir={sortDir} onClick={() => toggleSort('data')}     className={`${COL_W.data} justify-end`} />
        <span className="w-[1px] h-4 bg-white/[0.08] flex-shrink-0" />
        <span className={`${COL_W.action} flex-shrink-0`} />
        <span className={`${COL_W.action} flex-shrink-0`} />
      </div>

      {grupos.map(([cidade, list], gi) => (
        <div key={cidade} className={gi > 0 ? 'border-t-2 border-white/[0.12]' : ''}>
          {/* Cabeçalho da cidade */}
          <div className="sticky top-9 z-10 flex items-center justify-between gap-2 bg-surface px-5 py-2.5 border-b border-white/[0.08]">
            <span className="flex items-center gap-1.5 text-caption font-bold text-text uppercase tracking-[0.03em]">
              <MapPin size={11} className="text-primary/70" /> {cidade}
              <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-caption font-bold tabular-nums">
                {list.length} OS
              </span>
            </span>
            <button onClick={() => copyCity(cidade, list)} title="Copiar todas as OS desta cidade"
                    className="flex items-center gap-1 text-caption font-semibold text-muted hover:text-primary transition-colors">
              {copied === `city:${cidade}` ? <Check size={11} className="text-green" /> : <Copy size={11} />} Copiar cidade
            </button>
          </div>

          {/* Linhas da cidade */}
          <div className="divide-y divide-white/[0.04]">
            {list.map(os => {
              const aging  = os._aging ?? 0
              const agVar  = aging >= 6 ? 'red' : aging >= 3 ? 'yellow' : 'cyan'
              const isOpen = expanded === os.numos
              const catColor = CATEGORIA_COLOR[os._categoria]
              const catLabel = CATEGORIA_LABEL[os._categoria] ?? os._categoria
              return (
                <div key={os.numos}>
                  <div className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface/30 transition-colors text-label">
                    <button onClick={() => setExpanded(v => v === os.numos ? null : os.numos)}
                            title="Ver histórico de reagendamentos"
                            className={`${COL_W.chevron} flex-shrink-0 text-muted/50 hover:text-primary transition-colors`}>
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    <button onClick={() => onOS(os)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <span className={`font-mono text-primary ${COL_W.numos} flex-shrink-0`}>{os.numos}</span>
                      <span className="text-text truncate flex-1 min-w-[160px]">{os.nomecliente ?? '—'}</span>
                      <span className={`hidden sm:flex ${COL_W.tipo} flex-shrink-0`}>
                        <span
                          title={`${catLabel} · ${os.tiposervico || os.servico || ''}`}
                          className="text-caption font-bold uppercase tracking-wide px-2 py-1 rounded-full leading-none"
                          style={{ color: catColor, background: `${catColor}1a`, border: `1px solid ${catColor}40` }}
                        >
                          {catLabel}
                        </span>
                      </span>
                      <span className={`text-secondary truncate hidden md:block ${COL_W.equipe} flex-shrink-0`}>{shortEquipe(os.nomedaequipe) || '—'}</span>
                      <span className={`${COL_W.situacao} flex-shrink-0`}>
                        <Badge variant={situacaoVariant(os._situacaoEfetiva ?? os.descsituacao)}>{os._situacaoEfetiva ?? os.descsituacao ?? '—'}</Badge>
                      </span>
                      <span className={`${COL_W.aging} flex-shrink-0`}>
                        {os._aging != null ? <Badge variant={agVar}>{aging}d</Badge> : <span className="text-muted">—</span>}
                      </span>
                      <span className={`font-mono text-muted ${COL_W.data} flex-shrink-0 text-right`}>{os.dataagendamento ? os.dataagendamento.slice(0, 10) : '—'}</span>
                    </button>
                    <span className="w-[1px] h-4 bg-white/[0.06] flex-shrink-0" />
                    <button onClick={() => copyResumo(os)} title="Copiar só a OS (resumo)"
                            className={`${COL_W.action} flex-shrink-0 text-muted/50 hover:text-primary transition-colors`}>
                      {copied === `${os.numos}:os` ? <Check size={13} className="text-green" /> : <Copy size={13} />}
                    </button>
                    <button onClick={() => copyCompleto(os)} title="Copiar OS + histórico"
                            className={`${COL_W.action} flex-shrink-0 text-muted/50 hover:text-primary transition-colors`}>
                      {copied === `${os.numos}:full` ? <Check size={13} className="text-green" /> : <ClipboardList size={13} />}
                    </button>
                  </div>
                  {isOpen && <OcorrenciasExpand numos={os.numos} />}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
