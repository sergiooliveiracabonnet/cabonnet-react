import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Users, RotateCcw, Copy, Check, ClipboardList, MapPin } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { shortEquipe, situacaoVariant, buildOSWhatsApp } from '../../lib/osFormat'
import { useOSDetails, parseOSDetails, osDetailsQuery } from '../../hooks/useOSDetails'
import type { OSRow } from '../../lib/types'

// Timeline de reagendamentos/ocorrências de uma OS — busca /detalhes sob demanda.
function OcorrenciasExpand({ numos }: { numos: string }) {
  const { details, isLoading } = useOSDetails(numos)
  if (isLoading) return <p className="px-10 py-3 text-[11px] text-muted">⏳ Carregando histórico…</p>
  const hist = details?.historico ?? []
  const equipeReagend = details?.equipeReagend
  if (!hist.length) return <p className="px-10 py-3 text-[11px] text-muted/60 italic">Sem ocorrências registradas.</p>
  return (
    <div className="px-10 py-3 space-y-2 bg-surface/20">
      {equipeReagend && (
        <p className="text-[10px] text-muted flex items-center gap-1.5">
          <Users size={10} className="opacity-50" /> Equipe do reagendamento:
          <span className="text-secondary font-medium">{shortEquipe(equipeReagend)}</span>
        </p>
      )}
      {hist.map((e, i) => (
        <div key={i}
             className={`rounded-xl px-3 py-2 border ${e.isReagend ? 'bg-orange/[0.08] border-orange/25' : 'bg-surface/30 border-white/[0.06]'}`}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {e.isReagend && (
              <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-orange/80">
                <RotateCcw size={9} /> Reagendamento
              </span>
            )}
            {e.autor && <span className="text-[10px] font-semibold text-muted">{e.autor}</span>}
            {e.data && <span className="font-mono text-[10px] text-muted/60">{e.data}{e.hora ? ` ${e.hora}` : ''}</span>}
          </div>
          <p className={`text-[11px] leading-relaxed whitespace-pre-wrap ${e.isReagend ? 'text-orange/90' : 'text-secondary'}`}>
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
  const queryClient = useQueryClient()

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

  // Agrupa por cidade; cidades por volume (desc), OS por aging (desc, mais crítico primeiro)
  const grupos = useMemo(() => {
    const map = new Map<string, OSRow[]>()
    for (const os of rows) {
      const c = (os.nomedacidade || '').trim() || '—'
      if (!map.has(c)) map.set(c, [])
      map.get(c)!.push(os)
    }
    for (const list of map.values()) list.sort((a, b) => (b._aging ?? -1) - (a._aging ?? -1))
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [rows])

  if (!rows.length) return <p className="text-center text-muted text-[12px] py-10">Nenhuma OS encontrada.</p>

  return (
    <div className="overflow-auto max-h-[72vh]">
      {grupos.map(([cidade, list], gi) => (
        <div key={cidade} className={gi > 0 ? 'border-t-2 border-white/[0.12]' : ''}>
          {/* Cabeçalho da cidade */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-surface px-4 py-2 border-b border-white/[0.08]">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-text uppercase tracking-[0.03em]">
              <MapPin size={11} className="text-primary/70" /> {cidade}
              <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-bold tabular-nums">
                {list.length} OS
              </span>
            </span>
            <button onClick={() => copyCity(cidade, list)} title="Copiar todas as OS desta cidade"
                    className="flex items-center gap-1 text-[10px] font-semibold text-muted hover:text-primary transition-colors">
              {copied === `city:${cidade}` ? <Check size={11} className="text-green" /> : <Copy size={11} />} Copiar cidade
            </button>
          </div>

          {/* Linhas da cidade */}
          <div className="divide-y divide-white/[0.04]">
            {list.map(os => {
              const aging  = os._aging ?? 0
              const agVar  = aging >= 6 ? 'red' : aging >= 3 ? 'yellow' : 'cyan'
              const isOpen = expanded === os.numos
              return (
                <div key={os.numos}>
                  <div className="flex items-center gap-2 px-4 py-2 hover:bg-surface/30 transition-colors text-[11px]">
                    <button onClick={() => setExpanded(v => v === os.numos ? null : os.numos)}
                            title="Ver histórico de reagendamentos"
                            className="text-muted/50 hover:text-primary transition-colors flex-shrink-0">
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    <button onClick={() => onOS(os)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      <span className="font-mono text-primary w-[60px] flex-shrink-0">{os.numos}</span>
                      <span className="text-text truncate flex-1">{os.nomecliente ?? '—'}</span>
                      <span className="text-secondary truncate max-w-[120px] hidden sm:block">{shortEquipe(os.nomedaequipe) || '—'}</span>
                      <Badge variant={situacaoVariant(os._situacaoEfetiva ?? os.descsituacao)}>{os._situacaoEfetiva ?? os.descsituacao ?? '—'}</Badge>
                      {os._aging != null ? <Badge variant={agVar}>{aging}d</Badge> : <span className="text-muted">—</span>}
                      <span className="font-mono text-muted w-[68px] flex-shrink-0 text-right">{os.dataagendamento ? os.dataagendamento.slice(0, 10) : '—'}</span>
                    </button>
                    <button onClick={() => copyResumo(os)} title="Copiar só a OS (resumo)"
                            className="text-muted/50 hover:text-primary transition-colors flex-shrink-0">
                      {copied === `${os.numos}:os` ? <Check size={13} className="text-green" /> : <Copy size={13} />}
                    </button>
                    <button onClick={() => copyCompleto(os)} title="Copiar OS + histórico"
                            className="text-muted/50 hover:text-primary transition-colors flex-shrink-0">
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
