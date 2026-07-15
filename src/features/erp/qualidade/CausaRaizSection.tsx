import { useState, useMemo, useCallback } from 'react'
import { Sparkles, Download, ChevronDown, ChevronUp } from 'lucide-react'
import { useRevisitasDetalhe, type ParRevisita } from '../../../hooks/useRevisitasDetalhe'
import { ai } from '../../../lib/api'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CausaDistribuicao { causa: string; count: number; pct: number }
interface AnaliseIA {
  analises:            Array<{par: number; numos_orig: string; numos_rev: string; causa: string; feito_primeira: string; o_que_faltou: string}>
  causas_distribuicao: CausaDistribuicao[]
  narrativa:           string
  cached?:             boolean
}

const CAUSA_COLOR: Record<string, string> = {
  'Conectorização/Sinal':   '#f87171',
  'Equipamento':            '#f97316',
  'Configuração':           '#facc15',
  'Rede/Infraestrutura':    '#c084fc',
  'Execução Incompleta':    '#fb923c',
  'Cliente/Uso':            '#22d3ee',
  'Sem Informação':         '#6b7280',
}

function causaColor(c: string): string {
  return CAUSA_COLOR[c] ?? '#94a3b8'
}

function exportParesCsv(pares: ParRevisita[], analises: AnaliseIA['analises']): void {
  const mapaAnalise = new Map(analises.map(a => [a.numos_orig + '|' + a.numos_rev, a]))
  const headers = ['Tipo','Cliente','Cidade','OS Origem','Serviço Origem','Equipe Orig.','Data Origem','Obs. Origem',
                   'OS Revisita','Serviço Revisita','Equipe Rev.','Data Revisita','Obs. Revisita','Dias Entre',
                   'Causa (IA)','O que foi feito (1ª OS)','O que faltou']
  function cell(v: string): string {
    return v?.includes(';') || v?.includes('"') || v?.includes('\n') ? `"${v.replace(/"/g, '""')}"` : (v ?? '')
  }
  const lines = [
    headers.join(';'),
    ...pares.map(p => {
      const ia = mapaAnalise.get(p.numos_orig + '|' + p.numos_rev)
      return [
        p.tipo === 'inst' ? 'Instalação→Manut.' : 'Manut. Repetida',
        p.nomecliente, p.nomedacidade,
        p.numos_orig, p.servico_orig, p.equipe_orig, p.data_orig, p.obs_orig,
        p.numos_rev,  p.servico_rev,  p.equipe_rev,  p.data_rev,  p.obs_rev,
        String(p.dias_entre),
        ia?.causa ?? '',
        ia?.feito_primeira ?? '',
        ia?.o_que_faltou ?? '',
      ].map(cell).join(';')
    }),
  ]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'revisitas-causa-raiz.csv'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── CausaRaizSection ─────────────────────────────────────────────────────────

export function CausaRaizSection({ inicio, fim }: { inicio: string; fim: string }) {
  const { data, isLoading: loadingPares } = useRevisitasDetalhe(inicio, fim)
  const [analisando, setAnalisando]  = useState(false)
  const [analise,    setAnalise]     = useState<AnaliseIA | null>(null)
  const [errMsg,     setErrMsg]      = useState('')
  const [showTabela, setShowTabela]  = useState(false)
  const [pagina,     setPagina]      = useState(1)
  const PAGE = 30

  const pares = useMemo(() => data?.pares ?? [], [data])
  const totalPares = data?.n ?? 0

  const analisar = useCallback(async () => {
    if (!pares.length) return
    setAnalisando(true)
    setErrMsg('')
    try {
      const res = await ai.revisitasCausa({ pares: pares.slice(0, 25) }) as { ok: boolean } & AnaliseIA
      setAnalise(res)
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Erro ao chamar IA')
    } finally {
      setAnalisando(false)
    }
  }, [pares])

  const paginadas     = pares.slice((pagina - 1) * PAGE, pagina * PAGE)
  const totalPages    = Math.ceil(pares.length / PAGE)
  const mapaAnalise   = new Map((analise?.analises ?? []).map(a => [a.numos_orig + '|' + a.numos_rev, a]))

  if (loadingPares) {
    return (
      <div className="flex items-center gap-2 py-4 text-label text-muted">
        <div className="w-3.5 h-3.5 border border-primary border-t-transparent rounded-full animate-spin" />
        Carregando pares de revisita…
      </div>
    )
  }

  if (!pares.length) {
    return (
      <p className="text-label text-muted py-4">
        Nenhum par de revisita encontrado no período.
      </p>
    )
  }

  return (
    <div className="space-y-4">

      {/* Header + botão */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-label text-text">
            <span className="font-mono font-bold text-primary">{totalPares}</span>
            {' '}par{totalPares !== 1 ? 'es' : ''} de revisita detectado{totalPares !== 1 ? 's' : ''} no período.
          </p>
          <p className="text-caption text-muted mt-0.5">
            Cada par relaciona a OS de origem (instalação/1ª manutenção) com a OS de revisita, incluindo as observações técnicas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {analise && (
            <button
              onClick={() => exportParesCsv(pares, analise.analises)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08]
                         bg-surface/40 text-label text-muted hover:text-text transition-colors">
              <Download size={11} />
              Exportar CSV
            </button>
          )}
          <button
            onClick={analisar}
            disabled={analisando}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-label
                       transition-all disabled:opacity-50
                       border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20">
            <Sparkles size={13} className={analisando ? 'animate-pulse' : ''} />
            {analisando ? 'Analisando com IA…' : analise ? 'Reanalisar com IA' : 'Analisar Causa Raiz (IA)'}
          </button>
        </div>
      </div>

      {errMsg && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-label text-red-400">
          {errMsg}
        </div>
      )}

      {/* Resultado da IA */}
      {analise && (
        <div className="space-y-3">

          {/* Narrativa */}
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
            <div className="flex items-start gap-2">
              <Sparkles size={13} className="text-violet-400 flex-shrink-0 mt-0.5" />
              <p className="text-label text-text leading-relaxed">{analise.narrativa}</p>
            </div>
            {analise.cached && (
              <p className="text-caption text-muted mt-1 ml-5">Resultado em cache</p>
            )}
          </div>

          {/* Distribuição de causas */}
          {analise.causas_distribuicao.length > 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-2">
              <p className="text-caption font-bold uppercase tracking-[0.07em] text-muted mb-3">
                Distribuição Real de Causas
              </p>
              {analise.causas_distribuicao
                .sort((a, b) => b.count - a.count)
                .map(c => (
                  <div key={c.causa} className="flex items-center gap-3">
                    <span className="text-caption text-text w-48 flex-shrink-0 truncate">{c.causa}</span>
                    <div className="flex-1 h-1.5 bg-surface/40 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${c.pct}%`, background: causaColor(c.causa) }}
                      />
                    </div>
                    <span className="font-mono font-bold text-body w-6 text-right"
                          style={{ color: causaColor(c.causa) }}>{c.count}</span>
                    <span className="text-caption text-muted w-9 text-right">{c.pct}%</span>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}

      {/* Tabela de pares */}
      <div>
        <button
          onClick={() => setShowTabela(v => !v)}
          className="flex items-center gap-1.5 text-label text-muted hover:text-text transition-colors py-1">
          {showTabela ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showTabela ? 'Ocultar' : 'Ver'} tabela de pares ({pares.length})
        </button>
      </div>

      {showTabela && (
        <div className="space-y-2">
          <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-caption">
                <thead>
                  <tr className="border-b border-white/[0.05] bg-surface/10">
                    {['Tipo','Cliente','Cidade','OS Origem','Serviço 1ª OS','Data Orig.',
                      'OS Revisita','Serviço Revisita','Dias','Causa (IA)','O que foi feito','O que faltou'].map(h => (
                      <th key={h} className="px-2.5 py-2.5 text-left text-caption font-bold uppercase tracking-[0.05em] text-muted whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginadas.map((p, i) => {
                    const ia  = mapaAnalise.get(p.numos_orig + '|' + p.numos_rev)
                    const cor = p.tipo === 'inst' ? '#3b82f6' : '#f97316'
                    return (
                      <tr key={i} className="border-b border-white/[0.03] hover:bg-surface/10 transition-colors">
                        <td className="px-2.5 py-2">
                          <span className="text-caption font-bold" style={{ color: cor }}>
                            {p.tipo === 'inst' ? 'Inst→M' : 'M→M'}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 max-w-[120px]"><p className="truncate text-text">{p.nomecliente}</p></td>
                        <td className="px-2.5 py-2 text-muted whitespace-nowrap">{p.nomedacidade}</td>
                        <td className="px-2.5 py-2 font-mono text-primary">{p.numos_orig}</td>
                        <td className="px-2.5 py-2 max-w-[120px]">
                          <p className="truncate text-muted" title={p.servico_orig}>{p.servico_orig || '—'}</p>
                          {p.obs_orig && (
                            <p className="truncate text-caption text-muted/60 mt-0.5" title={p.obs_orig}>{p.obs_orig}</p>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-muted whitespace-nowrap">{p.data_orig.slice(0, 10)}</td>
                        <td className="px-2.5 py-2 font-mono text-amber-400">{p.numos_rev}</td>
                        <td className="px-2.5 py-2 max-w-[120px]">
                          <p className="truncate text-muted" title={p.servico_rev}>{p.servico_rev || '—'}</p>
                          {p.obs_rev && (
                            <p className="truncate text-caption text-muted/60 mt-0.5" title={p.obs_rev}>{p.obs_rev}</p>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-center font-mono font-bold"
                            style={{ color: p.dias_entre <= 7 ? '#f87171' : p.dias_entre <= 14 ? '#f97316' : '#94a3b8' }}>
                          {p.dias_entre}d
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          {ia ? (
                            <span className="text-caption font-semibold px-1.5 py-0.5 rounded"
                                  style={{ color: causaColor(ia.causa), background: causaColor(ia.causa) + '18' }}>
                              {ia.causa}
                            </span>
                          ) : (
                            <span className="text-caption text-muted/40">—</span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 max-w-[180px]">
                          <p className="truncate text-muted text-caption" title={ia?.feito_primeira}>{ia?.feito_primeira || '—'}</p>
                        </td>
                        <td className="px-2.5 py-2 max-w-[180px]">
                          <p className="truncate text-red-400 text-caption" title={ia?.o_que_faltou}>{ia?.o_que_faltou || '—'}</p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.05] bg-surface/10">
                <span className="text-caption text-muted">Página {pagina} de {totalPages}</span>
                <div className="flex gap-1">
                  <button disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}
                          className="px-3 py-1 rounded text-caption border border-white/[0.08] text-muted disabled:opacity-30 hover:bg-surface/30">‹</button>
                  <button disabled={pagina === totalPages} onClick={() => setPagina(p => p + 1)}
                          className="px-3 py-1 rounded text-caption border border-white/[0.08] text-muted disabled:opacity-30 hover:bg-surface/30">›</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
