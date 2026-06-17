import { useState, useMemo, useRef } from 'react'
import { Briefcase, MapPin, Clock, ChevronRight, Package, Wrench, Users, Camera, Check } from 'lucide-react'
import { toBlob } from 'html-to-image'
import { useOSDerived } from '../../contexts/OSDataContext'
import { useUIStore, PRESETS } from '../../store/uiStore'
import { isReagend, isExecucaoReal } from '../../lib/transform'
import {
  isInst, isVTManut, isServico, isAtend, isAtivo, skip,
  _parseBR, _isExecNoPeriodo, byCidade, byEquipe,
  type DrillRow,
} from './gerencialUtils'
import {
  OSListModal, HeroCount, CidadeTable, EmRotaCard, ClienteSearch, EquipeTable,
  SectionLabel,
} from './GerencialComponents'
import { Button } from '../../components/ui/Button'

export default function GerencialPage() {
  const { rows, allRows, isLoading } = useOSDerived()
  const { dateFilter }               = useUIStore()
  const [drillDown, setDrillDown]    = useState<DrillRow | null>(null)
  const [copied,    setCopied]       = useState(false)
  const produtividadeRef             = useRef<HTMLDivElement>(null)

  const { from, to } = dateFilter ?? {}

  const openDrill = (d: DrillRow) => setDrillDown(d)

  // ─── Bases de OS sem COPE/Reagend ───────────────────────────────────────
  // allBase  = snapshot ao vivo (ignora o filtro de data) → usado só na seção "Em Rota agora"
  // baseRows = respeita o filtro global → usado nas contagens "em aberto", KPIs e equipes
  const allBase  = useMemo(() => allRows.filter(r => !skip(r)), [allRows])
  const baseRows = useMemo(() => rows.filter(r => !skip(r)),    [rows])

  // ─── Concluídas no período: filtradas por data de EXECUÇÃO ──────────────
  // Usa allRows (não allBase) para incluir instalações concluídas pela COPE.
  // Reagendamento excluído para evitar dupla contagem; COPE incluído intencionalmente.
  const concluidas = useMemo(
    () => allRows.filter(r => !isReagend(r) && isExecucaoReal(r.descsituacao) && _isExecNoPeriodo(r, from, to)),
    [allRows, from, to]
  )

  // ─── Ativas: em aberto dentro do filtro global de data ───────────────────
  const ativas = useMemo(() => baseRows.filter(isAtivo), [baseRows])

  // ─── Instalação ──────────────────────────────────────────────────────────
  const instConclRows = useMemo(() => concluidas.filter(isInst), [concluidas])
  const instAtivos    = useMemo(() => ativas.filter(isInst),     [ativas])
  const instRows      = useMemo(() => [...instConclRows, ...instAtivos], [instConclRows, instAtivos])
  const instCidades        = useMemo(() => byCidade(instConclRows), [instConclRows])
  const instAtivosCidades  = useMemo(() => byCidade(instAtivos),    [instAtivos])

  // ─── VT / Manutenção (VT é sinônimo de Manutenção) ───────────────────────
  const vtManutConclRows    = useMemo(() => concluidas.filter(isVTManut), [concluidas])
  const vtManutAtivos       = useMemo(() => ativas.filter(isVTManut),     [ativas])
  const vtManutRows         = useMemo(() => [...vtManutConclRows, ...vtManutAtivos], [vtManutConclRows, vtManutAtivos])
  const vtManutCidades      = useMemo(() => byCidade(vtManutConclRows),   [vtManutConclRows])
  const vtManutAtivosCidades = useMemo(() => byCidade(vtManutAtivos),     [vtManutAtivos])

  // ─── Serviço ─────────────────────────────────────────────────────────────
  const servConclRows      = useMemo(() => concluidas.filter(isServico), [concluidas])
  const servAtivos         = useMemo(() => ativas.filter(isServico),     [ativas])
  const servRows           = useMemo(() => [...servConclRows, ...servAtivos], [servConclRows, servAtivos])
  const servCidades        = useMemo(() => byCidade(servConclRows),      [servConclRows])
  const servAtivosCidades  = useMemo(() => byCidade(servAtivos),         [servAtivos])

  // ─── Em Rota — snapshot atual pelas 3 categorias de negócio ──────────────
  const rotaInst   = useMemo(
    () => allBase.filter(r => isInst(r) && isAtend(r))
              .sort((a, b) => (b._agingAbertura ?? 0) - (a._agingAbertura ?? 0)),
    [allBase]
  )
  const rotaVTManut = useMemo(
    () => allBase.filter(r => isVTManut(r) && isAtend(r))
              .sort((a, b) => (b._agingAbertura ?? 0) - (a._agingAbertura ?? 0)),
    [allBase]
  )
  const rotaServ   = useMemo(
    () => allBase.filter(r => isServico(r) && isAtend(r))
              .sort((a, b) => (b._agingAbertura ?? 0) - (a._agingAbertura ?? 0)),
    [allBase]
  )
  const rotaInstCidades    = useMemo(() => byCidade(rotaInst),    [rotaInst])
  const rotaVTManutCidades = useMemo(() => byCidade(rotaVTManut), [rotaVTManut])
  const rotaServCidades    = useMemo(() => byCidade(rotaServ),    [rotaServ])

  // ─── Volume por Equipe e KPIs — baseados no filtro global ─────────────────
  const equipes       = useMemo(() => byEquipe(baseRows), [baseRows])
  const kpiPendentes  = useMemo(() => baseRows.filter(r => r.descsituacao === 'Pendente'), [baseRows])
  const kpiAtendendo  = useMemo(() => baseRows.filter(isAtend), [baseRows])
  const kpiConcluidas = useMemo(() => concluidas, [concluidas])

  // ─── Copiar produtividade (Instalação / VT-Manutenção / Serviço) como imagem ─
  async function handleCopyProdutividade() {
    const el = produtividadeRef.current
    if (!el) return
    try {
      const isDark     = !document.documentElement.classList.contains('light')
      const bg         = isDark ? '#0d1117' : '#ffffff'
      const bgHdr      = isDark ? '#111827' : '#f0f4ff'
      const colorText  = isDark ? '#e2e8f0' : '#0f172a'
      const colorMuted = isDark ? '#94a3b8' : '#64748b'
      const borderClr  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'
      const now         = new Date()
      const ts          = now.toLocaleDateString('pt-BR') + ' · ' +
                          now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      const presetLabel  = PRESETS.find(p => p.id === dateFilter?.preset)?.label ?? dateFilter?.preset ?? '—'
      const fmt           = (d: Date | null | undefined) => d ? d.toLocaleDateString('pt-BR') : '—'
      const periodoLabel  = `${presetLabel} · ${fmt(from)} – ${fmt(to)}`

      // Largura real: percorre a subárvore para achar o maior scrollWidth real
      const getTrueWidth = (node: HTMLElement): number => {
        let w = node.scrollWidth
        for (const c of node.children) w = Math.max(w, getTrueWidth(c as HTMLElement))
        return w
      }
      const capW = getTrueWidth(el)

      // Clonar reinicia animações de entrada (animate-card-enter etc.) do zero;
      // sem isso a captura pega os cards no frame inicial (opacity:0) e some texto.
      const stripOverflow = (node: HTMLElement) => {
        node.style.overflow    = 'visible'
        node.style.overflowX   = 'visible'
        node.style.overflowY   = 'visible'
        node.style.maxHeight   = 'none'
        node.style.maxWidth    = 'none'
        node.style.animation   = 'none'
        node.style.transition  = 'none'
        node.style.opacity     = '1'
        for (const c of node.children) stripOverflow(c as HTMLElement)
      }

      const wrapper = document.createElement('div')
      wrapper.style.cssText = `position:fixed;top:-99999px;left:0;width:${capW}px;pointer-events:none;`

      const clone = el.cloneNode(true) as HTMLDivElement
      clone.style.width = `${capW}px`
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
      ctx.fillText('CABONNET · Produtividade', 18 * SCALE, 20 * SCALE)
      ctx.fillStyle = '#3b82f6'
      ctx.font      = `600 ${11 * SCALE}px system-ui,-apple-system,sans-serif`
      ctx.fillText(periodoLabel, 18 * SCALE, 43 * SCALE)
      ctx.textAlign = 'right'
      ctx.fillStyle = colorMuted
      ctx.font      = `${10 * SCALE}px system-ui,-apple-system,sans-serif`
      ctx.fillText(ts, canvas.width - 16 * SCALE, 30 * SCALE)
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-secondary text-sm">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Carregando…
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-[1600px]">

      {/* Modal de drill-down */}
      <OSListModal
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        title={drillDown?.title ?? ''}
        rows={drillDown?.rows ?? []}
        color={drillDown?.color ?? '#3b82f6'}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[20px] font-headline font-bold text-text">Visão Gerencial</h1>
            <span className="flex items-center gap-1.5 text-[10px] text-muted">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green" />
              </span>
              Ao vivo
            </span>
          </div>
          <p className="text-[12px] text-muted">
            Concluídas filtradas por <strong className="text-secondary">data de execução</strong> · Em Rota = snapshot ao vivo
          </p>
        </div>

        <Button
          variant="outline" size="sm"
          className={`gap-1.5 flex-shrink-0 transition-all duration-300
            ${copied
              ? 'border-green-500/50 text-green bg-green-500/10'
              : 'border-green/30 text-green hover:bg-green/10'}`}
          onClick={handleCopyProdutividade}
        >
          {copied
            ? <><Check size={11} /> Copiado!</>
            : <><Camera size={11} /> Copiar produtividade</>}
        </Button>
      </div>

      <div ref={produtividadeRef} className="space-y-6">

      {/* ── 1. Instalação ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionLabel icon={Package} color="#3b82f6">
          Instalações — executadas no período
        </SectionLabel>

        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-3">
          <div className="space-y-3">
            <HeroCount
              value={instRows.length}
              label="Total de Instalações"
              sub={`${instAtivos.length} em aberto · ${instConclRows.length} concluídas`}
              color="#3b82f6"
              onClick={() => openDrill({ title: `Instalações — ${instRows.length} ordens`, rows: instRows, color: '#3b82f6' })}
            />
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Em aberto',  drillRows: instAtivos,    color: '#facc15' },
                { label: 'Concluídas', drillRows: instConclRows, color: '#4ade80' },
              ].map(s => (
                <div key={s.label}
                     className="rounded-xl border border-white/[0.08] bg-card px-3 py-3
                                cursor-pointer hover:bg-surface/30 transition-colors"
                     onClick={() => openDrill({ title: `Instalações ${s.label} — ${s.drillRows.length} ordens`, rows: s.drillRows, color: s.color })}>
                  <p className="font-mono font-bold text-[24px] leading-none"
                     style={{ color: s.color }}>{s.drillRows.length}</p>
                  <p className="text-[10px] text-muted mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 flex items-center gap-1.5">
                <MapPin size={10} /> Em aberto por cidade
              </p>
              <CidadeTable
                rows={instAtivosCidades} color="#facc15" emptyMsg="Nenhuma instalação em aberto"
                sourceRows={instAtivos}
                onDrillDown={openDrill}
              />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 flex items-center gap-1.5">
                <MapPin size={10} /> Concluídas por cidade
              </p>
              <CidadeTable
                rows={instCidades} color="#3b82f6" emptyMsg="Nenhuma instalação no período"
                sourceRows={instConclRows}
                onDrillDown={openDrill}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. VT / Manutenção ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionLabel icon={Wrench} color="#f97316">
          VT / Manutenção — executadas no período
        </SectionLabel>
        <p className="text-[11px] text-muted -mt-2">
          Inclui Visitas Técnicas (VT 24h, VT 48h, VT 8h) e Manutenções corretivas
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-3">
          <div className="space-y-3">
            <HeroCount
              value={vtManutRows.length}
              label="Total VT / Manutenção"
              sub={`${vtManutAtivos.length} em aberto · ${vtManutConclRows.length} concluídas`}
              color="#f97316"
              onClick={() => openDrill({ title: `VT / Manutenção — ${vtManutRows.length} ordens`, rows: vtManutRows, color: '#f97316' })}
            />
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Em aberto',  drillRows: vtManutAtivos,    color: '#facc15' },
                { label: 'Concluídas', drillRows: vtManutConclRows, color: '#4ade80' },
              ].map(s => (
                <div key={s.label}
                     className="rounded-xl border border-white/[0.08] bg-card px-3 py-3
                                cursor-pointer hover:bg-surface/30 transition-colors"
                     onClick={() => openDrill({ title: `VT/Manutenção ${s.label} — ${s.drillRows.length} ordens`, rows: s.drillRows, color: s.color })}>
                  <p className="font-mono font-bold text-[24px] leading-none"
                     style={{ color: s.color }}>{s.drillRows.length}</p>
                  <p className="text-[10px] text-muted mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 flex items-center gap-1.5">
                <MapPin size={10} /> Em aberto por cidade
              </p>
              <CidadeTable
                rows={vtManutAtivosCidades} color="#facc15" emptyMsg="Nenhuma VT/Manutenção em aberto"
                sourceRows={vtManutAtivos}
                onDrillDown={openDrill}
              />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 flex items-center gap-1.5">
                <MapPin size={10} /> Concluídas por cidade
              </p>
              <CidadeTable
                rows={vtManutCidades} color="#f97316" emptyMsg="Nenhuma VT/Manutenção no período"
                sourceRows={vtManutConclRows}
                onDrillDown={openDrill}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Serviço ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionLabel icon={Briefcase} color="#c4b5fd">
          Serviço — executados no período
        </SectionLabel>
        <p className="text-[11px] text-muted -mt-2">
          OS que não são Instalação nem VT/Manutenção (ex: mudança de plano, remanejamento, etc.)
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-3">
          <div className="space-y-3">
            <HeroCount
              value={servRows.length}
              label="Total de Serviços"
              sub={`${servAtivos.length} em aberto · ${servConclRows.length} concluídos`}
              color="#c4b5fd"
              onClick={() => openDrill({ title: `Serviços — ${servRows.length} ordens`, rows: servRows, color: '#c4b5fd' })}
            />
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Em aberto',  drillRows: servAtivos,    color: '#facc15' },
                { label: 'Concluídos', drillRows: servConclRows, color: '#4ade80' },
              ].map(s => (
                <div key={s.label}
                     className="rounded-xl border border-white/[0.08] bg-card px-3 py-3
                                cursor-pointer hover:bg-surface/30 transition-colors"
                     onClick={() => openDrill({ title: `Serviços ${s.label} — ${s.drillRows.length} ordens`, rows: s.drillRows, color: s.color })}>
                  <p className="font-mono font-bold text-[24px] leading-none"
                     style={{ color: s.color }}>{s.drillRows.length}</p>
                  <p className="text-[10px] text-muted mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 flex items-center gap-1.5">
                <MapPin size={10} /> Em aberto por cidade
              </p>
              <CidadeTable
                rows={servAtivosCidades} color="#facc15" emptyMsg="Nenhum serviço em aberto"
                sourceRows={servAtivos}
                onDrillDown={openDrill}
              />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 flex items-center gap-1.5">
                <MapPin size={10} /> Concluídos por cidade
              </p>
              <CidadeTable
                rows={servCidades} color="#c4b5fd" emptyMsg="Nenhum serviço no período"
                sourceRows={servConclRows}
                onDrillDown={openDrill}
              />
            </div>
          </div>
        </div>
      </section>

      </div>

      {/* ── Em Rota — snapshot atual ────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionLabel icon={Clock} color="#4ade80">
          Em Rota agora — snapshot operacional (sem filtro de data)
        </SectionLabel>

        {/* Instalação em rota */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-3.5 rounded-full" style={{ background: '#3b82f6' }} />
              <Package size={11} style={{ color: '#3b82f6' }} />
              <span className="text-[11px] font-bold uppercase tracking-[0.06em]"
                    style={{ color: '#3b82f6' }}>
                Instalação em rota
              </span>
            </div>
            <button
              className="flex items-center gap-1.5 font-mono font-black text-[22px] leading-none
                         hover:opacity-80 transition-opacity"
              style={{ color: '#3b82f6' }}
              onClick={() => openDrill({ title: `Instalação em Rota — ${rotaInst.length} ordens`, rows: rotaInst, color: '#3b82f6' })}
              title="Ver todas as OS">
              {rotaInst.length}
              <ChevronRight size={14} className="mt-0.5 opacity-60" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div>
              <p className="text-[10px] text-muted mb-1.5 flex items-center gap-1">
                <MapPin size={9} /> Por cidade
              </p>
              <CidadeTable rows={rotaInstCidades} color="#3b82f6"
                           emptyMsg="Nenhuma instalação em rota"
                           sourceRows={rotaInst}
                           onDrillDown={openDrill} />
              <ClienteSearch rows={rotaInst} color="#3b82f6" onDrillDown={openDrill} />
            </div>
            <div className="lg:col-span-3">
              <p className="text-[10px] text-muted mb-1.5 flex items-center gap-1">
                <Clock size={9} /> Detalhe · aging
              </p>
              <EmRotaCard rows={rotaInst} color="#3b82f6" />
            </div>
          </div>
        </div>

        {/* VT / Manutenção em rota */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-3.5 rounded-full" style={{ background: '#f97316' }} />
              <Wrench size={11} style={{ color: '#f97316' }} />
              <span className="text-[11px] font-bold uppercase tracking-[0.06em]"
                    style={{ color: '#f97316' }}>
                VT / Manutenção em rota
              </span>
            </div>
            <button
              className="flex items-center gap-1.5 font-mono font-black text-[22px] leading-none
                         hover:opacity-80 transition-opacity"
              style={{ color: '#f97316' }}
              onClick={() => openDrill({ title: `VT/Manutenção em Rota — ${rotaVTManut.length} ordens`, rows: rotaVTManut, color: '#f97316' })}
              title="Ver todas as OS">
              {rotaVTManut.length}
              <ChevronRight size={14} className="mt-0.5 opacity-60" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div>
              <p className="text-[10px] text-muted mb-1.5 flex items-center gap-1">
                <MapPin size={9} /> Por cidade
              </p>
              <CidadeTable rows={rotaVTManutCidades} color="#f97316"
                           emptyMsg="Nenhuma VT/Manutenção em rota"
                           sourceRows={rotaVTManut}
                           onDrillDown={openDrill} />
              <ClienteSearch rows={rotaVTManut} color="#f97316" onDrillDown={openDrill} />
            </div>
            <div className="lg:col-span-3">
              <p className="text-[10px] text-muted mb-1.5 flex items-center gap-1">
                <Clock size={9} /> Detalhe · aging
              </p>
              <EmRotaCard rows={rotaVTManut} color="#f97316" />
            </div>
          </div>
        </div>

        {/* Serviço em rota */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-3.5 rounded-full" style={{ background: '#c4b5fd' }} />

              <Briefcase size={11} style={{ color: '#c4b5fd' }} />
              <span className="text-[11px] font-bold uppercase tracking-[0.06em]"
                    style={{ color: '#c4b5fd' }}>
                Serviço em rota
              </span>
            </div>
            <button
              className="flex items-center gap-1.5 font-mono font-black text-[22px] leading-none
                         hover:opacity-80 transition-opacity"
              style={{ color: '#c4b5fd' }}
              onClick={() => openDrill({ title: `Serviço em Rota — ${rotaServ.length} ordens`, rows: rotaServ, color: '#c4b5fd' })}
              title="Ver todas as OS">
              {rotaServ.length}
              <ChevronRight size={14} className="mt-0.5 opacity-60" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div>
              <p className="text-[10px] text-muted mb-1.5 flex items-center gap-1">
                <MapPin size={9} /> Por cidade
              </p>
              <CidadeTable rows={rotaServCidades} color="#c4b5fd"
                           emptyMsg="Nenhum serviço em rota"
                           sourceRows={rotaServ}
                           onDrillDown={openDrill} />
              <ClienteSearch rows={rotaServ} color="#c4b5fd" onDrillDown={openDrill} />
            </div>
            <div className="lg:col-span-3">
              <p className="text-[10px] text-muted mb-1.5 flex items-center gap-1">
                <Clock size={9} /> Detalhe · aging
              </p>
              <EmRotaCard rows={rotaServ} color="#c4b5fd" />
            </div>
          </div>
        </div>

      </section>

      {/* ── 5. Volume Total por Equipe ─────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel icon={Users} color="#4ade80">
            Volume Total por Equipe
          </SectionLabel>
          <span className="text-[11px] text-muted">{equipes.length} equipes · concluídas por data de execução</span>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Concluídas no período', drillRows: kpiConcluidas, color: '#4ade80' },
            { label: 'Pendentes no período',   drillRows: kpiPendentes,  color: '#facc15' },
            { label: 'Em Atendimento',         drillRows: kpiAtendendo,  color: '#22d3ee' },
            { label: 'Total OS período',       drillRows: baseRows,      color: '#3b82f6' },
          ].map(s => (
            <div key={s.label}
                 className="relative overflow-hidden rounded-xl border bg-card px-4 py-3 animate-card-enter
                            cursor-pointer hover:bg-surface/20 transition-colors"
                 style={{ borderColor: `${s.color}20` }}
                 onClick={() => openDrill({ title: `${s.label} — ${s.drillRows.length} ordens`, rows: s.drillRows, color: s.color })}>
              <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: s.color }} />
              <p className="font-mono font-black tabular-nums text-[28px] leading-none"
                 style={{ color: s.color }}>{s.drillRows.length}</p>
              <p className="text-[11px] text-muted mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <EquipeTable
          equipes={equipes}
          sourceRows={baseRows}
          onDrillDown={openDrill}
        />
      </section>

    </div>
  )
}
