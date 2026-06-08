import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BarChart2, ChevronUp, AlertTriangle, Download, Send, CheckCircle, CalendarClock, FileText, Router, Wrench, HardHat, Copy, Users } from 'lucide-react'
import type { OSRow } from '../../lib/types'
type ColRender = (value: unknown, row: OSRow) => React.ReactNode
import { useOrdens } from '../../hooks/useOrdens'
import { KPICard } from '../../components/ui/KPICard'
import { SearchBox } from '../../components/ui/SearchBox'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { DataTable } from '../../components/ui/DataTable'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
import { exportCSV } from '../../lib/export'
import { exportOrdensPDF } from '../../lib/exportOrdensPDF'
import { toBlob } from 'html-to-image'
import { captureOSPorPeriodo, type CaptureOSRow } from '../../lib/captureOSTable'
import { useAuditStore } from '../../store/auditStore'
import OSDrawer from './OSDrawer'
import { OSHoverCard } from './OSHoverCard'
import { TelegramOrdensModal } from './TelegramOrdensModal'
import { PeriodoGroupedTable } from './PeriodoGroupedTable'
import { ClienteGroupedTable } from './ClienteGroupedTable'


const statusOptions = [
  { value: 'Pendente',                label: 'Pendente'             },
  { value: 'Atendimento',             label: 'Atendimento'          },
  { value: 'Reagendamento',           label: 'Reagendamento'        },
  { value: 'Atendimento/Finalizadas', label: 'Atend. Finalizada'    },
  { value: 'Concluída',               label: 'Concluída'            },
  { value: 'Concluída/Sem Execução',  label: 'Concluída/Sem Exec.'  },
]

const agingOptions = [
  { value: '1',  label: 'Hoje (0-1 dia)' },
  { value: '2',  label: 'Até 2 dias' },
  { value: '3',  label: '3-5 dias ⚠' },
  { value: '6',  label: '≥6 dias 🔴' },
  { value: '11', label: '11+ dias' },
]

const fornecedorOptions = [
  { value: 'WES',        label: 'WES' },
  { value: 'Instacable', label: 'Instacable' },
  { value: 'THM',        label: 'THM' },
  { value: 'REDE',       label: 'Rede' },
  { value: 'MANUTENCAO', label: 'Manutenção' },
  { value: 'INSTALACAO', label: 'Instalação' },
  { value: 'INTERNO',    label: 'COPE Interno' },
]

const densityOptions = [
  { value: 'normal',  label: 'Normal' },
  { value: 'compact', label: 'Compacto' },
  { value: 'mini',    label: 'Mini' },
]

const columns: { key?: string; label: string; render?: ColRender }[] = [
  { key: 'numos',           label: 'Nº OS' },
  { key: '_aging',          label: 'Aging',
    render: (v) => {
      const n = v as number
      const c = n >= 6 ? 'red' : n >= 3 ? 'yellow' : 'cyan'
      return <Badge variant={c}>{n ?? 0}d</Badge>
    }
  },
  { key: '_riskScore',      label: 'Risco',
    render: (v, row) => {
      const score = (v as number) ?? 0
      const [variant, label] =
        score >= 70 ? ['red',    'Crítico'] :
        score >= 40 ? ['orange', 'Alto']    :
        score >= 20 ? ['yellow', 'Médio']   :
                      ['green',  'Baixo']
      const dias = row?._diasAteViolacao
      const pulse = score >= 70
      const diasLabel = dias != null && dias <= 5 ? ` · ${dias}d` : ''
      return (
        <div className="relative inline-flex">
          {pulse && <span className="absolute inset-0 rounded-[10px] bg-red/20 animate-ping pointer-events-none" />}
          <Badge variant={variant as 'red' | 'orange' | 'yellow' | 'green'}>
            {label} {score}{diasLabel}
          </Badge>
        </div>
      )
    }
  },
  { key: 'nomecliente',     label: 'Cliente',
    render: (v, row) => v
      ? (v as string)
      : <span className="text-muted italic text-[11px]">
          {row?.codigocliente ? `Cód. ${row.codigocliente}` : '(Sem nome)'}
        </span>
  },
  { key: 'nomedacidade',    label: 'Cidade' },
  { key: 'bairro',          label: 'Bairro' },
  { key: 'logradouro',      label: 'Endereço' },
  { key: 'tiposervico',     label: 'Tipo' },
  { key: 'nomedaequipe',    label: 'Equipe', render: (v) => shortEquipe(v as string) },
  { key: '_situacaoEfetiva', label: 'Situação',
    render: (v) => <Badge variant={situacaoVariant(v as string)}>{v as string}</Badge>
  },
  { key: 'dataagendamento', label: 'Agend.',
    render: (v) => v ? (v as string).slice(0, 10) : '—'
  },
]


export default function OrdensPage() {
  const os       = useOrdens()
  const logAudit = useAuditStore(s => s.log)
  const location = useLocation()
  const navigate = useNavigate()
  const [drawerOS,        setDrawerOS]        = useState<OSRow | null>(null)
  const [kpiVisible,      setKpiVisible]      = useState(true)
  const [groupBy,         setGroupBy]         = useState<'none' | 'cliente'>('none')
  const [hoverOS,         setHoverOS]         = useState<OSRow | null>(null)
  const [hoverRect,       setHoverRect]       = useState<DOMRect | null>(null)
  const [tgModal,         setTgModal]         = useState(false)
  const [copied,          setCopied]          = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tableRef   = useRef<HTMLDivElement>(null)

  // Recebe equipe pré-selecionada via React Router state (OSDrawer → "Ver Equipe")
  useEffect(() => {
    const eq = location.state?.filterEquipe
    if (eq) {
      os.setEquipe(eq)
      navigate(location.pathname, { replace: true, state: null })
      setTimeout(scrollToTable, 150)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  function scrollToTable() {
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleRowHover(row: OSRow, rect: DOMRect) {
    clearTimeout(hoverTimer.current ?? undefined)
    hoverTimer.current = setTimeout(() => {
      setHoverOS(row)
      setHoverRect(rect)
    }, 180)
  }

  function handleRowLeave() {
    clearTimeout(hoverTimer.current ?? undefined)
    setHoverOS(null)
    setHoverRect(null)
  }

  function handleRowClick(row: OSRow) {
    clearTimeout(hoverTimer.current ?? undefined)
    setHoverOS(null)
    setHoverRect(null)
    setDrawerOS(row)
  }

  async function handleCopyImage() {
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

      // ── Equipe selecionada: canvas puro (sem captura de DOM) ──────────────
      if (os.equipe) {
        const canvas = captureOSPorPeriodo(os.filtered as CaptureOSRow[], shortEquipe(os.equipe))
        const blob   = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
        )
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
        return
      }

      // ── Tabela flat/cliente: clone off-screen sem overflow ────────────────
      if (!tableRef.current) return
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
      // O wrapper é o fixed off-screen; o clone em si fica estático para que
      // getComputedStyle não copie position:fixed para o render do html-to-image.
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
      ctx.fillStyle = '#3b82f6'
      ctx.fillRect(0, 0, 4 * SCALE, HDR_H * SCALE)
      ctx.strokeStyle = borderClr
      ctx.lineWidth   = 1 * SCALE
      ctx.beginPath(); ctx.moveTo(0, HDR_H * SCALE); ctx.lineTo(canvas.width, HDR_H * SCALE); ctx.stroke()

      ctx.textBaseline = 'middle'
      ctx.fillStyle    = colorText
      ctx.font         = `bold ${14 * SCALE}px system-ui,-apple-system,sans-serif`
      ctx.fillText('CABONNET · Ordens de Serviço', 18 * SCALE, 20 * SCALE)
      ctx.fillStyle = '#3b82f6'
      ctx.font      = `600 ${11 * SCALE}px system-ui,-apple-system,sans-serif`
      ctx.fillText('Todas as Equipes', 18 * SCALE, 43 * SCALE)
      ctx.textAlign = 'right'
      ctx.fillStyle = colorMuted
      ctx.font      = `${10 * SCALE}px system-ui,-apple-system,sans-serif`
      ctx.fillText(ts, canvas.width - 16 * SCALE, 20 * SCALE)
      ctx.fillText(`${os.filtered.length} OS`, canvas.width - 16 * SCALE, 43 * SCALE)
      ctx.textAlign = 'left'
      ctx.drawImage(contentImg, 0, HDR_H * SCALE)

      const finalBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
      )
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': finalBlob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (e) {
      console.error('Clipboard error:', e)
    }
  }

  function handleExport() {
    const date = new Date().toISOString().slice(0, 10)
    logAudit('CSV exportado', `${os.filtered.length} OS · ordens_${date}.csv`, 'export')
    exportCSV(os.filtered, `ordens_${date}.csv`)
  }

  function handleExportPDF() {
    const date = new Date().toISOString().slice(0, 10)
    logAudit('PDF exportado', `${os.filtered.length} OS · ordens_${date}.pdf`, 'export')
    exportOrdensPDF(os.filtered, `ordens_${date}.pdf`)
  }


  const opts = os.options
  const tipoOpts    = (opts.tipos    ?? []).map(t => ({ value: t, label: t }))
  const cidadeOpts  = (opts.cidades  ?? []).map(c => ({ value: c, label: c }))
  const bairroOpts  = (opts.bairros  ?? []).map(b => ({ value: b, label: b }))
  const equipeOpts  = (opts.equipes  ?? []).map(e => ({ value: e, label: shortEquipe(e) }))
  const periodoOpts = (opts.periodos ?? []).map(p => ({ value: p, label: p }))

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Header: título + controles + ações ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-headline text-xl font-semibold text-text flex-1 min-w-0">
          Ordens de Serviço
        </h2>

        {/* KPI toggle */}
        <button
          onClick={() => setKpiVisible(v => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary hover:text-text
                     border border-white/[0.08] rounded-xl px-3 py-1.5 transition-all duration-fast"
        >
          <BarChart2 size={12} /> KPIs
          <ChevronUp size={11} className={`transition-transform ${kpiVisible ? '' : 'rotate-180'}`} />
        </button>

        {/* GroupBy toggle */}
        <button
          onClick={() => setGroupBy(g => g === 'cliente' ? 'none' : 'cliente')}
          className={`flex items-center gap-1.5 text-[11px] font-semibold
                     border rounded-xl px-3 py-1.5 transition-all duration-fast
                     ${groupBy === 'cliente'
                       ? 'bg-primary/15 border-primary/40 text-primary'
                       : 'border-white/[0.08] text-secondary hover:text-text'}`}
        >
          <Users size={12} /> Por Cliente
        </button>

        {/* Density toggle */}
        <div className="flex items-center gap-0.5 bg-card border border-white/[0.08] rounded-xl p-1">
          {densityOptions.map((d) => (
            <button
              key={d.value}
              onClick={() => os.setDensity(d.value)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all duration-fast
                          ${os.density === d.value
                            ? 'bg-primary/15 text-primary'
                            : 'text-muted hover:text-secondary'}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Ações */}
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            className={`gap-1.5 transition-all duration-300
              ${copied
                ? 'border-green-500/50 text-green bg-green-500/10'
                : 'border-green/30 text-green hover:bg-green/10'}`}
            onClick={handleCopyImage}
          >
            {copied
              ? <><CheckCircle size={11} /> Copiado!</>
              : <><Copy size={11} /> Copiar Imagem</>}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download size={11} /> CSV ({os.filtered.length})
          </Button>
          <Button
            variant="outline" size="sm"
            className="gap-1.5 border-cyan/30 text-cyan hover:bg-cyan/10"
            onClick={handleExportPDF}
          >
            <FileText size={11} /> PDF
          </Button>
          <Button
            variant="outline" size="sm"
            className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => setTgModal(true)}
          >
            <Send size={11} /> Telegram
          </Button>
        </div>
      </div>

      {/* ── KPI cards ── */}
      {kpiVisible && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 stagger">
          <KPICard
            title="Total OS" value={os.kpis.total} accent="primary"
            sub="ver todas"
            onClick={() => { os.clearFilters(); scrollToTable() }}
          />
          <KPICard
            title="Críticas ≥6d" value={os.kpis.criticas} accent="red"
            sub="aging ≥ 6 dias"
            onClick={() => { os.clearFilters(); os.setAging('6'); scrollToTable() }}
          />
          <KPICard
            title="Sem equipe" value={os.kpis.semEquipe} accent="yellow" icon={AlertTriangle}
            sub="sem alocação"
            onClick={() => { os.clearFilters(); os.setSemEquipe(true); scrollToTable() }}
          />
          <KPICard
            title="Agend. hoje" value={os.kpis.agendHoje} accent="green"
            sub="para hoje"
            onClick={() => { os.clearFilters(); os.setAgendHoje(true); scrollToTable() }}
          />
          <KPICard
            title="Amanhã" value={os.kpis.agendAmanha} accent="cyan" icon={CalendarClock}
            sub="agendadas p/ amanhã"
            onClick={() => { os.clearFilters(); os.setAgendAmanha(true); scrollToTable() }}
          />
          <KPICard
            title="Agend. Futuro" value={os.kpis.agendFuturo} accent="orange" icon={CalendarClock}
            sub="amanhã em diante"
            onClick={() => { os.clearFilters(); os.setAgendFuturo(true); scrollToTable() }}
          />
        </div>
      )}

      {/* ── Resumo por Tipo ── */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button
          onClick={() => { os.clearFilters(); os.setTipoOs('INSTALACAO'); scrollToTable() }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full
                     bg-cyan/10 border border-cyan/20 text-cyan
                     text-[12px] font-semibold hover:bg-cyan/20 transition-all duration-fast"
        >
          <Router size={12} /> Instalação
          <span className="bg-cyan/20 text-cyan rounded-full px-1.5 py-0 text-[11px] font-bold tabular-nums">
            {os.kpis.instalacao}
          </span>
        </button>
        <button
          onClick={() => { os.clearFilters(); os.setTipoOs('MANUTENCAO'); scrollToTable() }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full
                     bg-orange/10 border border-orange/20 text-orange
                     text-[12px] font-semibold hover:bg-orange/20 transition-all duration-fast"
        >
          <Wrench size={12} /> Manutenção
          <span className="bg-orange/20 text-orange rounded-full px-1.5 py-0 text-[11px] font-bold tabular-nums">
            {os.kpis.manutencao}
          </span>
        </button>
        <button
          onClick={() => { os.clearFilters(); scrollToTable() }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full
                     bg-purple/10 border border-purple/20 text-purple
                     text-[12px] font-semibold hover:bg-purple/20 transition-all duration-fast"
        >
          <HardHat size={12} /> Serviço
          <span className="bg-purple/20 text-purple rounded-full px-1.5 py-0 text-[11px] font-bold tabular-nums">
            {os.kpis.servico}
          </span>
        </button>
      </div>

      {/* ── Barra de filtros ── */}
      <div className="bg-card border border-white/[0.08] rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <SearchBox
          value={os.search}
          onChange={os.setSearch}
          placeholder="Buscar cliente, nº OS, cidade…"
          className="w-64"
        />
        <FilterSelect value={os.status}     onChange={os.setStatus}     options={statusOptions}     placeholder="Status"      className="w-44" />
        <FilterSelect value={os.tipo}       onChange={os.setTipo}       options={tipoOpts}          placeholder="Tipo"        className="w-36" />
        <FilterSelect value={os.cidade}     onChange={os.setCidade}     options={cidadeOpts}        placeholder="Cidade"      className="w-36" />
        <FilterSelect value={os.bairro}     onChange={os.setBairro}     options={bairroOpts}        placeholder="Bairro"      className="w-32" />
        <FilterSelect value={os.equipe}     onChange={os.setEquipe}     options={equipeOpts}        placeholder="Equipe"      className="w-36" />
        <FilterSelect value={os.aging}      onChange={os.setAging}      options={agingOptions}      placeholder="Aging"       className="w-32" />
        <FilterSelect value={os.fornecedor} onChange={os.setFornecedor} options={fornecedorOptions} placeholder="Fornecedor"  className="w-36" />
        <FilterSelect value={os.periodo}   onChange={os.setPeriodo}   options={periodoOpts}       placeholder="Período"     className="w-32" />

        {/* Toggle Rede */}
        <button
          onClick={() => os.setHideRede(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold
                      border transition-all duration-fast flex-shrink-0
                      ${os.hideRede
                        ? 'bg-red/[0.08] border-red/20 text-red/80 hover:bg-red/[0.14]'
                        : 'bg-green/[0.08] border-green/20 text-green hover:bg-green/[0.14]'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${os.hideRede ? 'bg-red/70' : 'bg-green'}`} />
          Rede {os.hideRede ? 'OFF' : 'ON'}
        </button>

        <Button variant="ghost" size="sm" onClick={os.clearFilters}>Limpar</Button>
      </div>

      {/* Banner filtros ativos */}
      {os.filtered.length !== os.ordens.length && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl
                        bg-primary/[0.06] border border-primary/20 text-[12px] text-secondary">
          <span className="flex items-center gap-2 flex-wrap">
            Exibindo <strong className="text-text">{os.filtered.length}</strong> de{' '}
            <strong className="text-text">{os.ordens.length}</strong> OS
            {os.semEquipe    && <span className="badge-yellow  rounded-full px-2 py-0.5 text-[11px] font-bold">Sem equipe</span>}
            {os.agendHoje    && <span className="badge-green   rounded-full px-2 py-0.5 text-[11px] font-bold">Agend. hoje</span>}
            {os.agendAmanha  && <span className="badge-cyan    rounded-full px-2 py-0.5 text-[11px] font-bold">Amanhã</span>}
            {os.agendFuturo  && <span className="badge-orange  rounded-full px-2 py-0.5 text-[11px] font-bold">Agend. Futuro</span>}
            {os.hideRede     && <span className="rounded-full px-2 py-0.5 text-[11px] font-bold bg-red/10 text-red/80 border border-red/20">Rede oculta</span>}
            {os.periodo      && <span className="badge-purple  rounded-full px-2 py-0.5 text-[11px] font-bold">{os.periodo}</span>}
          </span>
          <button onClick={os.clearFilters} className="text-muted hover:text-red transition-colors text-[11px] font-semibold">
            Limpar filtros
          </button>
        </div>
      )}

      {/* Tabela */}
      <div ref={tableRef} className="bg-card border border-white/[0.08] rounded-xl overflow-hidden">
        {os.isLoading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={8} /></div>
        ) : os.equipe ? (
          /* ── Vista agrupada por período (quando equipe está selecionada) ── */
          <PeriodoGroupedTable
            rows={os.filtered}
            density={os.density as "normal" | "compact" | "mini"}
            onRowClick={handleRowClick}
            equipe={os.equipe}
          />
        ) : groupBy === 'cliente' ? (
          /* ── Vista agrupada por cliente ── */
          <ClienteGroupedTable
            rows={os.filtered}
            density={os.density as "normal" | "compact" | "mini"}
            onRowClick={handleRowClick}
          />
        ) : (
          /* ── Tabela flat padrão ── */
          <DataTable
            columns={columns}
            rows={os.paginated}
            density={os.density as "normal" | "compact" | "mini"}
            onRowClick={handleRowClick}
            onRowHover={handleRowHover}
            onRowLeave={handleRowLeave}
          />
        )}

        {/* Paginação — apenas no modo flat */}
        {!os.equipe && os.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3
                          border-t border-white/[0.05] text-[11px] text-muted">
            <span>
              Página {os.page} de {os.totalPages} — {os.filtered.length} OS
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost" size="sm"
                onClick={() => os.setPage(p => Math.max(1, p - 1))}
                disabled={os.page === 1}
              >
                ‹
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => os.setPage(p => Math.min(os.totalPages, p + 1))}
                disabled={os.page === os.totalPages}
              >
                ›
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Hover card — only when drawer is closed */}
      {!drawerOS && <OSHoverCard os={hoverOS} anchorRect={hoverRect} />}

      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />

      {/* ── Modal Telegram ─────────────────────────────────────────── */}
      <TelegramOrdensModal
        open={tgModal}
        onClose={() => setTgModal(false)}
        ordens={os.ordens}
      />
    </div>
  )
}
