import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Flame, CheckCircle2, Send, Check, Gauge, Truck, MapPin, Wrench, Activity, Megaphone, Copy, ClipboardList, UserX, Image as ImageIcon } from 'lucide-react'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { useAuditStore } from '../../../store/auditStore'
import { useFilaGeralStore } from '../../../store/filaGeralStore'
import { filaUrgenciaTier, filaUrgenciaScore } from '../../../lib/builders/fila'
import { KPICard } from '../../../components/ui/KPICard'
import { FilterSelect } from '../../../components/ui/FilterSelect'
import { SearchBox } from '../../../components/ui/SearchBox'
import { DataTable } from '../../../components/ui/DataTable'
import { Badge } from '../../../components/ui/Badge'
import { shortEquipe, fmtHorasMin, buildOSWhatsApp } from '../../../lib/osFormat'
import { toBlob } from 'html-to-image'
import { parseOSDetails, osDetailsQuery } from '../../../hooks/useOSDetails'
import { tgVTUrgente, chatKeyForFornecedor } from '../../../lib/tgTemplates'
import { telegram } from '../../../lib/api'
import OSDrawer from '../../ordens/OSDrawer'
import type { OSRow } from '../../../lib/types'

// Fila de prioridade única — antes eram duas páginas (VT com prazo em horas,
// "Fila Geral" com SLA em dias que excluía tudo marcado como VT_MANUTENCAO).
// Nessa exclusão, OS de manutenção comum (não-VT) não apareciam em NENHUMA das
// duas — ficavam num buraco entre as duas filas. Unificado: toda OS ativa entra
// aqui, urgência calculada pelo critério certo pra cada uma (buildFila).

type ColRender = (value: unknown, row: OSRow) => React.ReactNode

const tipoOptions = [
  { value: 'VT 8h',       label: 'VT 8h'       },
  { value: 'VT 24h',      label: 'VT 24h'      },
  { value: 'VT 48h',      label: 'VT 48h'      },
  { value: 'Instalação',  label: 'Instalação'  },
  { value: 'Manutenção',  label: 'Manutenção'  },
  { value: 'Serviços',    label: 'Serviços'    },
]

const fornecedorOptions = [
  { value: 'WES',        label: 'WES' },
  { value: 'Instacable', label: 'Instacable' },
  { value: 'THM',        label: 'THM' },
  { value: 'REDE',       label: 'Rede' },
  { value: 'MANUTENCAO', label: 'Manutenção' },
]

function urgenciaVariant(r: OSRow): 'red' | 'orange' | 'green' {
  const tier = filaUrgenciaTier(r)
  if (tier === 'violado') return 'red'
  if (tier === 'atencao') return 'orange'
  return 'green'
}

function urgenciaLabel(r: OSRow): string {
  if (r._vtPrazoHoras != null) {
    const restante = r._vtHorasRestantes ?? 0
    return restante <= 0 ? `Violado há ${fmtHorasMin(restante)}` : `Faltam ${fmtHorasMin(restante)}`
  }
  const aging  = r._agingAbertura ?? 0
  const limite = r._slaLimite ?? 0
  const tier = filaUrgenciaTier(r)
  const prefixo = tier === 'violado' ? 'Crítico' : tier === 'atencao' ? 'Excedido' : 'No prazo'
  return `${prefixo} — ${aging}d / lim. ${limite}d`
}

function situacaoVariant(situacao: string): 'yellow' | 'cyan' | 'purple' | 'green' | 'red' | 'teal' {
  switch (situacao) {
    case 'Pendente':       return 'yellow'
    case 'Atendimento':    return 'cyan'
    case 'Reagendamento':  return 'purple'
    case 'Concluída':      return 'green'
    case 'Cancelada':      return 'red'
    default:               return 'teal'
  }
}

interface TendenciaItem { dia: string; label: string; total: number; violadas: number }

function TendenciaPanel({ items }: { items: TendenciaItem[] }) {
  const max = Math.max(1, ...items.map(d => d.violadas))
  const totalViol = items.reduce((s, d) => s + d.violadas, 0)
  return (
    <div className="rounded-xl bg-card border border-white/[0.08] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-muted" />
          <h3 className="text-label font-semibold text-text">Violações da Fila · 7 dias</h3>
        </div>
        <span className="text-caption text-muted tabular-nums">{totalViol} no total</span>
      </div>
      <div className="flex items-end gap-1.5">
        {items.map(d => (
          <div key={d.dia} className="flex-1 flex flex-col items-center gap-1"
               title={`${d.label}: ${d.violadas} violações de ${d.total} executadas`}>
            <div className="w-full h-14 flex items-end">
              <div className="w-full rounded-t bg-red/60"
                   style={{ height: `${(d.violadas / max) * 100}%`, minHeight: d.violadas > 0 ? 3 : 0 }} />
            </div>
            <span className="text-caption text-muted tabular-nums">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface CargaItem { nome: string; total: number; violadas: number; criticas: number }

function CargaPanel({ title, icon: Icon, items }: { title: string; icon: typeof Truck; items: CargaItem[] }) {
  return (
    <div className="rounded-xl bg-card border border-white/[0.08] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-muted" />
        <h3 className="text-label font-semibold text-text">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-label text-muted py-2">Sem OS em aberto</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 6).map(c => (
            <div key={c.nome} className="flex items-center justify-between gap-3 text-label">
              <span className="text-secondary truncate">{c.nome}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0 tabular-nums">
                {c.violadas > 0 && <Badge variant="red" dot={false}>{c.violadas} viol.</Badge>}
                {c.criticas > 0 && <Badge variant="orange" dot={false}>{c.criticas} atenç.</Badge>}
                <span className="text-muted w-8 text-right">{c.total}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FilaPage() {
  const { rows, isLoading, derived } = useOSDerived()
  const { cumprimento, cargaFornecedor, cargaCidade, tendencia } = derived.fila
  const logAudit = useAuditStore(s => s.log)
  const emTratativa     = useFilaGeralStore(s => s.emTratativa)
  const toggleTratativa = useFilaGeralStore(s => s.toggleTratativa)

  const [tipo, setTipo]             = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [search, setSearch]         = useState('')
  const [drawerOS, setDrawerOS]     = useState<OSRow | null>(null)
  const [notified, setNotified]     = useState<Record<string, 'ok' | 'error' | undefined>>({})
  const [enviandoLote, setEnviandoLote] = useState(false)
  const [copied, setCopied]         = useState<string | null>(null)
  const [copiedImage, setCopiedImage] = useState(false)
  const queryClient = useQueryClient()
  const tableRef = useRef<HTMLDivElement>(null)

  function flashCopied(key: string) { setCopied(key); setTimeout(() => setCopied(null), 1800) }

  function copyResumo(row: OSRow, e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(buildOSWhatsApp(row)).catch(() => {}); flashCopied(`${row.numos}:os`)
  }

  async function copyCompleto(row: OSRow, e: React.MouseEvent) {
    e.stopPropagation()
    flashCopied(`${row.numos}:full`)
    let historico
    try {
      const data = await queryClient.fetchQuery(osDetailsQuery(row.numos))
      historico = parseOSDetails(data)?.historico
    } catch { /* sem detalhes: copia só o resumo */ }
    navigator.clipboard.writeText(buildOSWhatsApp(row, historico)).catch(() => {})
  }

  const fila = useMemo(() => {
    let f = rows.filter(r => r.descsituacao === 'Pendente' || r.descsituacao === 'Atendimento')
    if (tipo)        f = f.filter(r => r._slaTipoLabel === tipo)
    if (fornecedor)  f = f.filter(r => r._fornecedor === fornecedor)
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      f = f.filter(r =>
        r.numos?.toLowerCase().includes(term) ||
        r.nomecliente?.toLowerCase().includes(term)
      )
    }
    // Ordena por tier de urgência (violado > atenção > ok); em tratativa vai pro fim;
    // dentro do mesmo tier, desempata pelo score nativo de cada tipo (VT ou geral)
    const tierOrder = { violado: 0, atencao: 1, ok: 2 }
    return [...f].sort((a, b) => {
      const ta = emTratativa[a.numos] ? 1 : 0
      const tb = emTratativa[b.numos] ? 1 : 0
      if (ta !== tb) return ta - tb
      const tierDiff = tierOrder[filaUrgenciaTier(a)] - tierOrder[filaUrgenciaTier(b)]
      if (tierDiff !== 0) return tierDiff
      return filaUrgenciaScore(b) - filaUrgenciaScore(a)
    })
  }, [rows, tipo, fornecedor, search, emTratativa])

  // Violadas ainda não em tratativa — alvo da notificação em lote
  const criticas = useMemo(
    () => fila.filter(r => !emTratativa[r.numos] && filaUrgenciaTier(r) === 'violado'),
    [fila, emTratativa],
  )

  const kpis = useMemo(() => {
    const violadas  = fila.filter(r => filaUrgenciaTier(r) === 'violado').length
    const atencao   = fila.filter(r => filaUrgenciaTier(r) === 'atencao').length
    const semEquipe = fila.filter(r => !r.nomedaequipe?.trim()).length
    const noPrazo   = fila.filter(r => filaUrgenciaTier(r) === 'ok').length
    return { violadas, atencao, semEquipe, noPrazo }
  }, [fila])

  async function handleCopyImage() {
    if (!tableRef.current) return
    try {
      const isDark     = !document.documentElement.classList.contains('light')
      const bg         = isDark ? '#0d1117' : '#ffffff'
      const bgHdr      = isDark ? '#111827' : '#f0f4ff'
      const colorText  = isDark ? '#e2e8f0' : '#0f172a'
      const colorMuted = isDark ? '#94a3b8' : '#64748b'
      const borderClr  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'
      const now        = new Date()
      const ts         = now.toLocaleDateString('pt-BR') + ' · ' +
                         now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

      const tableEl = tableRef.current

      // Largura real: o overflow-hidden pai esconde o scrollWidth dos filhos;
      // percorre a subárvore para encontrar o maior scrollWidth real.
      const getTrueWidth = (el: HTMLElement): number => {
        let w = el.scrollWidth
        for (const c of el.children) w = Math.max(w, getTrueWidth(c as HTMLElement))
        return w
      }
      const capW = getTrueWidth(tableEl)

      // Clone off-screen sem constraints de overflow/maxHeight.
      const stripOverflow = (el: HTMLElement) => {
        el.style.overflow  = 'visible'
        el.style.overflowX = 'visible'
        el.style.overflowY = 'visible'
        el.style.maxHeight = 'none'
        el.style.maxWidth  = 'none'
        for (const c of el.children) stripOverflow(c as HTMLElement)
      }
      const wrapper = document.createElement('div')
      wrapper.style.cssText = `position:fixed;top:-99999px;left:0;width:${capW}px;pointer-events:none;`

      const clone = tableEl.cloneNode(true) as HTMLDivElement
      clone.style.width        = `${capW}px`
      clone.style.borderRadius = '0'
      stripOverflow(clone)

      wrapper.appendChild(clone)
      document.body.appendChild(wrapper)

      // Dois frames para o browser recalcular o layout no clone
      await new Promise<void>(r => requestAnimationFrame(() => { requestAnimationFrame(() => r()) }))
      const capH = clone.scrollHeight

      const contentBlob = await toBlob(clone, {
        pixelRatio: 2,
        width:  capW,
        height: capH,
        backgroundColor: bg,
        style:  { borderRadius: '0' },
      })
      document.body.removeChild(wrapper)
      if (!contentBlob) return

      // Composita cabeçalho Canvas + conteúdo capturado
      const SCALE      = 2
      const HDR_H      = 60
      const contentImg = await createImageBitmap(contentBlob)
      const canvas     = document.createElement('canvas')
      canvas.width     = contentImg.width
      canvas.height    = contentImg.height + HDR_H * SCALE
      const ctx        = canvas.getContext('2d')!

      ctx.fillStyle = bg
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = bgHdr
      ctx.fillRect(0, 0, canvas.width, HDR_H * SCALE)
      ctx.fillStyle = '#ef4444'
      ctx.fillRect(0, 0, 4 * SCALE, HDR_H * SCALE)
      ctx.strokeStyle = borderClr
      ctx.lineWidth   = 1 * SCALE
      ctx.beginPath(); ctx.moveTo(0, HDR_H * SCALE); ctx.lineTo(canvas.width, HDR_H * SCALE); ctx.stroke()

      ctx.textBaseline = 'middle'
      ctx.fillStyle    = colorText
      ctx.font         = `bold ${14 * SCALE}px system-ui,-apple-system,sans-serif`
      ctx.fillText('CABONNET · Fila de Prioridade', 18 * SCALE, 20 * SCALE)
      ctx.fillStyle = '#ef4444'
      ctx.font      = `600 ${11 * SCALE}px system-ui,-apple-system,sans-serif`
      ctx.fillText(fornecedor ? `Fornecedor: ${fornecedor}` : 'Todos os Fornecedores', 18 * SCALE, 43 * SCALE)
      ctx.textAlign = 'right'
      ctx.fillStyle = colorMuted
      ctx.font      = `${10 * SCALE}px system-ui,-apple-system,sans-serif`
      ctx.fillText(ts, canvas.width - 16 * SCALE, 20 * SCALE)
      ctx.fillText(`${fila.length} OS`, canvas.width - 16 * SCALE, 43 * SCALE)
      ctx.textAlign = 'left'
      ctx.drawImage(contentImg, 0, HDR_H * SCALE)

      const finalBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
      )
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': finalBlob })])
      logAudit('Imagem copiada (fila de prioridade)', `${fila.length} OS`, 'export')
      setCopiedImage(true)
      setTimeout(() => setCopiedImage(false), 2500)
    } catch (e) {
      console.error('Clipboard error:', e)
    }
  }

  async function handleNotificar(row: OSRow, e: React.MouseEvent) {
    e.stopPropagation()
    const chat = chatKeyForFornecedor(row)
    try {
      await telegram.send(tgVTUrgente(row), chat)
      logAudit('Telegram enviado (fila urgente)', `OS ${row.numos} · ${chat}`, 'telegram')
      setNotified(prev => ({ ...prev, [row.numos]: 'ok' }))
    } catch {
      setNotified(prev => ({ ...prev, [row.numos]: 'error' }))
    } finally {
      setTimeout(() => setNotified(prev => ({ ...prev, [row.numos]: undefined })), 2000)
    }
  }

  async function handleNotificarCriticas() {
    if (criticas.length === 0 || enviandoLote) return
    if (!window.confirm(`Enviar alerta de Telegram para ${criticas.length} OS violadas?`)) return
    setEnviandoLote(true)
    const results = await Promise.allSettled(
      criticas.map(row => telegram.send(tgVTUrgente(row), chatKeyForFornecedor(row))),
    )
    const ok = results.filter(r => r.status === 'fulfilled').length
    const falhas = results.length - ok
    logAudit('Telegram em lote (fila violadas)', `${ok} enviadas, ${falhas} falhas`, 'telegram')
    setNotified(prev => {
      const next = { ...prev }
      criticas.forEach((row, i) => { next[row.numos] = results[i].status === 'fulfilled' ? 'ok' : 'error' })
      return next
    })
    setEnviandoLote(false)
    setTimeout(() => setNotified({}), 2500)
  }

  const columns: { key?: string; label: string; render?: ColRender }[] = [
    { key: 'numos', label: 'Nº OS' },
    { key: 'nomecliente', label: 'Cliente' },
    { key: 'nomedacidade', label: 'Cidade' },
    { key: 'bairro', label: 'Bairro' },
    { key: 'nomedaequipe', label: 'Equipe', render: (v) => shortEquipe(v as string) || <Badge variant="orange">Sem equipe</Badge> },
    {
      key: '_situacaoEfetiva', label: 'Situação',
      render: (v) => {
        const s = (v as string) ?? '—'
        return <Badge variant={situacaoVariant(s)}>{s}</Badge>
      },
    },
    { key: '_slaTipoLabel', label: 'Tipo', render: (v) => <Badge variant="cyan">{v as string}</Badge> },
    {
      label: 'Urgência',
      render: (_v, row) => <Badge variant={urgenciaVariant(row)}>{urgenciaLabel(row)}</Badge>,
    },
    {
      label: 'Ações',
      render: (_v, row) => {
        const st = notified[row.numos]
        const tratando = !!emTratativa[row.numos]
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => handleNotificar(row, e)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-caption font-medium
                         text-muted hover:text-primary hover:bg-primary/10 transition-colors"
            >
              {st === 'ok' ? <Check size={12} className="text-green" /> : <Send size={12} />}
              {st === 'ok' ? 'Enviado' : 'Notificar'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); toggleTratativa(row.numos) }}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-caption font-medium transition-colors
                         ${tratando ? 'text-teal bg-teal/10' : 'text-muted hover:text-teal hover:bg-teal/10'}`}
            >
              <Wrench size={12} />
              {tratando ? 'Tratando' : 'Tratar'}
            </button>
            <button
              onClick={(e) => copyResumo(row, e)}
              title="Copiar só a OS (resumo)"
              className="p-1 rounded-md text-muted hover:text-primary hover:bg-primary/10 transition-colors"
            >
              {copied === `${row.numos}:os` ? <Check size={12} className="text-green" /> : <Copy size={12} />}
            </button>
            <button
              onClick={(e) => copyCompleto(row, e)}
              title="Copiar OS + histórico"
              className="p-1 rounded-md text-muted hover:text-primary hover:bg-primary/10 transition-colors"
            >
              {copied === `${row.numos}:full` ? <Check size={12} className="text-green" /> : <ClipboardList size={12} />}
            </button>
          </div>
        )
      },
    },
  ]

  if (isLoading) {
    return <div className="p-6 text-muted text-label">Carregando fila…</div>
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-[20px] font-bold text-text">Fila de Prioridade</h1>
        <p className="text-label text-muted mt-0.5">Toda OS ativa numa fila só — VT (prazo em horas) e as demais (SLA em dias), ordenadas pela mesma gravidade real</p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <KPICard title="Violadas" value={kpis.violadas} accent="red" icon={AlertTriangle} />
        <KPICard title="Atenção" value={kpis.atencao} accent="orange" icon={Flame} />
        <KPICard title="Sem Equipe" value={kpis.semEquipe} accent="yellow" icon={UserX} />
        <KPICard title="No prazo" value={kpis.noPrazo} accent="green" icon={CheckCircle2} />
        <KPICard
          title="Cumprimento SLA"
          value={cumprimento.pct != null ? `${cumprimento.pct}%` : '—'}
          sub={cumprimento.total > 0 ? `${cumprimento.noPrazo}/${cumprimento.total} no prazo` : 'Sem execuções no período'}
          accent="teal"
          icon={Gauge}
          trend={cumprimento.deltaPp != null ? { delta: cumprimento.deltaPp, higherIsBetter: true } : undefined}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CargaPanel title="Carga por Fornecedor" icon={Truck} items={cargaFornecedor} />
        <CargaPanel title="Carga por Cidade" icon={MapPin} items={cargaCidade} />
        <TendenciaPanel items={tendencia} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect value={tipo} onChange={setTipo} options={tipoOptions} placeholder="Todos os tipos" className="w-40" />
        <FilterSelect value={fornecedor} onChange={setFornecedor} options={fornecedorOptions} placeholder="Todos os fornecedores" className="w-48" />
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por cliente ou nº OS…" className="w-64" />
        <button
          onClick={handleCopyImage}
          className={`ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-label font-semibold
                     border transition-all duration-300
                     ${copiedImage
                       ? 'border-green-500/50 text-green bg-green-500/10'
                       : 'border-green/30 text-green hover:bg-green/10'}`}
        >
          {copiedImage
            ? <><CheckCircle2 size={14} /> Copiado!</>
            : <><ImageIcon size={14} /> Copiar Imagem</>}
        </button>
        <button
          onClick={handleNotificarCriticas}
          disabled={criticas.length === 0 || enviandoLote}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-label font-semibold
                     text-red bg-red/10 hover:bg-red/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Megaphone size={14} />
          {enviandoLote ? 'Enviando…' : `Notificar violadas (${criticas.length})`}
        </button>
      </div>

      {fila.length === 0 ? (
        <div className="rounded-xl bg-card border border-white/[0.08] p-12 text-center">
          <p className="text-body text-secondary">Nenhuma OS em aberto 🎉</p>
        </div>
      ) : (
        <div ref={tableRef} className="bg-card border border-white/[0.08] rounded-xl overflow-hidden">
          <DataTable columns={columns} rows={fila} onRowClick={setDrawerOS} />
        </div>
      )}

      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />
    </div>
  )
}
