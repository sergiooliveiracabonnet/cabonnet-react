# Onda 4 — Ordens & Fila (PageHeader + Dedup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `OrdensPage.tsx` e `FilaPage.tsx` adotam o componente canônico `PageHeader` (criado na Onda 1, ainda não usado por nenhuma tela real) para título/ações, e param de duplicar ~180 linhas de código de captura de imagem PNG entre si.

**Architecture:** Extrai a lógica de composição de imagem (clone off-screen da tabela + canvas com cabeçalho) para uma função pura `captureTableAsImage()` em `src/lib/captureTableImage.ts`, parametrizada por título/subtítulo/cor de destaque/contagem — consumida pelas duas telas. Cada tela reorganiza seu cabeçalho JSX para usar `PageHeader` (título + ações), movendo controles de visualização (toggles) ou filtros para fora do cabeçalho, conforme já definido na spec.

**Tech Stack:** React 18 + TypeScript, `html-to-image` (já instalado, reaproveitado), Vitest.

## Global Constraints

- Design sóbrio: tokens reais do `index.css`, Inter, cor só para status — exceção já documentada e preservada: cores de tipo (Instalação=cyan, Manutenção=orange, Serviço=purple) em Ordens, convenção reusada em outras telas, não é violação e não muda nesta onda.
- Sem novas dependências de stack.
- Antes de cada commit: `npx tsc --noEmit`, `npm run lint`, `npm run audit:ds`, `npm test`, `npm run build` devem passar limpos.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — só reorganização de UI + dedup de código, comportamento idêntico ao atual.
- Mudanças de UI exigem verificação manual no navegador antes de reportar como concluído — este plano segue o mesmo padrão da Onda 3c: o controller faz essa verificação depois que as tasks e reviews de código terminam, não os implementadores.

---

### Task 1: Extrair `captureTableAsImage` e ligar nas duas telas

**Files:**
- Create: `src/lib/captureTableImage.ts`
- Modify: `src/features/ordens/OrdensPage.tsx` (só imports + `handleCopyImage`)
- Modify: `src/features/erp/fila/FilaPage.tsx` (só imports + `handleCopyImage`)

**Interfaces:**
- Produces: `export interface CaptureTableImageOptions { tableEl: HTMLElement; title: string; subtitle: string; accentColor: string; itemCount: number }`, `export async function captureTableAsImage(opts: CaptureTableImageOptions): Promise<Blob>` — usado pelas Tasks 2 e 3 indiretamente (já vem ligado nesta task; as próximas tasks não tocam `handleCopyImage` de novo).
- Consumes: `toBlob` de `html-to-image` (já instalado).

Sem teste dedicado nesta task (ver Global Constraints e a spec §5: `jsdom` não suporta `CanvasRenderingContext2D`, `captureOSTable.test.ts` já documenta essa limitação testando só lógica pura equivalente, que não existe aqui). Verificação é via type-check, regressão da suíte completa e, mais tarde, verificação manual no navegador.

- [ ] **Step 1: Criar `src/lib/captureTableImage.ts`**

```ts
import { toBlob } from 'html-to-image'

export interface CaptureTableImageOptions {
  tableEl:     HTMLElement
  title:       string
  subtitle:    string
  accentColor: string
  itemCount:   number
}

function getTrueWidth(el: HTMLElement): number {
  let w = el.scrollWidth
  for (const c of el.children) w = Math.max(w, getTrueWidth(c as HTMLElement))
  return w
}

function stripOverflow(el: HTMLElement): void {
  el.style.overflow  = 'visible'
  el.style.overflowX = 'visible'
  el.style.overflowY = 'visible'
  el.style.maxHeight = 'none'
  el.style.maxWidth  = 'none'
  for (const c of el.children) stripOverflow(c as HTMLElement)
}

// Clona a tabela fora da tela (sem overflow/maxHeight), captura via html-to-image
// e compõe um cabeçalho (barra de cor + título + subtítulo + timestamp + contagem)
// num canvas por cima — mesmo mecanismo usado por Ordens e Fila para "Copiar Imagem".
export async function captureTableAsImage(opts: CaptureTableImageOptions): Promise<Blob> {
  const { tableEl, title, subtitle, accentColor, itemCount } = opts

  const isDark     = !document.documentElement.classList.contains('light')
  const bg         = isDark ? '#0d1117' : '#ffffff'
  const bgHdr      = isDark ? '#111827' : '#f0f4ff'
  const colorText  = isDark ? '#e2e8f0' : '#0f172a'
  const colorMuted = isDark ? '#94a3b8' : '#64748b'
  const borderClr  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'
  const now        = new Date()
  const ts         = now.toLocaleDateString('pt-BR') + ' · ' +
                     now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const capW = getTrueWidth(tableEl)

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
  if (!contentBlob) throw new Error('captureTableAsImage: toBlob failed')

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
  ctx.fillStyle = accentColor
  ctx.fillRect(0, 0, 4 * SCALE, HDR_H * SCALE)
  ctx.strokeStyle = borderClr
  ctx.lineWidth   = 1 * SCALE
  ctx.beginPath(); ctx.moveTo(0, HDR_H * SCALE); ctx.lineTo(canvas.width, HDR_H * SCALE); ctx.stroke()

  ctx.textBaseline = 'middle'
  ctx.fillStyle    = colorText
  ctx.font         = `bold ${14 * SCALE}px system-ui,-apple-system,sans-serif`
  ctx.fillText(title, 18 * SCALE, 20 * SCALE)
  ctx.fillStyle = accentColor
  ctx.font      = `600 ${11 * SCALE}px system-ui,-apple-system,sans-serif`
  ctx.fillText(subtitle, 18 * SCALE, 43 * SCALE)
  ctx.textAlign = 'right'
  ctx.fillStyle = colorMuted
  ctx.font      = `${10 * SCALE}px system-ui,-apple-system,sans-serif`
  ctx.fillText(ts, canvas.width - 16 * SCALE, 20 * SCALE)
  ctx.fillText(`${itemCount} OS`, canvas.width - 16 * SCALE, 43 * SCALE)
  ctx.textAlign = 'left'
  ctx.drawImage(contentImg, 0, HDR_H * SCALE)

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('captureTableAsImage: canvas.toBlob failed')), 'image/png')
  )
}
```

Nota: o código original de cada tela fazia `if (!contentBlob) return` silenciosamente (sem log, sem exceção) dentro de uma função `void`. Como `captureTableAsImage` retorna `Promise<Blob>`, esse caso vira `throw` em vez de retorno silencioso — os dois call points (Steps 2 e 3 abaixo) já têm `try/catch` com `console.error('Clipboard error:', e)`, então o comportamento observável pro usuário é idêntico (nenhuma cópia acontece), só que agora fica logado no console em vez de falhar em silêncio total. Essa é uma mudança pequena e intencional, não um desvio a esconder.

- [ ] **Step 2: Atualizar `src/features/ordens/OrdensPage.tsx` — imports e `handleCopyImage`**

Substituir a linha de import:
```tsx
import { toBlob } from 'html-to-image'
```
por:
```tsx
import { captureTableAsImage } from '../../lib/captureTableImage'
```
(mantém a posição relativa entre `import { exportOrdensPDF } from '../../lib/exportOrdensPDF'` e `import { captureOSPorPeriodo, type CaptureOSRow } from '../../lib/captureOSTable'`.)

Substituir a função inteira `handleCopyImage` (do `async function handleCopyImage() {` até o `}` que a fecha, logo antes de `function handleExport() {`) por:

```tsx
  async function handleCopyImage() {
    try {
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

      // ── Tabela flat/cliente ────────────────────────────────────────────
      if (!tableRef.current) return
      const blob = await captureTableAsImage({
        tableEl:     tableRef.current,
        title:       'CABONNET · Ordens de Serviço',
        subtitle:    'Todas as Equipes',
        accentColor: '#3b82f6',
        itemCount:   os.filtered.length,
      })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (e) {
      console.error('Clipboard error:', e)
    }
  }
```

Não alterar mais nada neste arquivo nesta task — cabeçalho/JSX ficam para a Task 2.

- [ ] **Step 3: Atualizar `src/features/erp/fila/FilaPage.tsx` — imports e `handleCopyImage`**

Substituir a linha de import:
```tsx
import { toBlob } from 'html-to-image'
```
por:
```tsx
import { captureTableAsImage } from '../../../lib/captureTableImage'
```
(mantém a posição relativa entre `import { shortEquipe, fmtHorasMin, buildOSWhatsApp } from '../../../lib/osFormat'` e `import { parseOSDetails, osDetailsQuery } from '../../../hooks/useOSDetails'`.)

Substituir a função inteira `handleCopyImage` (do `async function handleCopyImage() {` até o `}` que a fecha, logo antes de `async function handleNotificar(row: OSRow, e: React.MouseEvent) {`) por:

```tsx
  async function handleCopyImage() {
    if (!tableRef.current) return
    try {
      const blob = await captureTableAsImage({
        tableEl:     tableRef.current,
        title:       'CABONNET · Fila de Prioridade',
        subtitle:    fornecedor ? `Fornecedor: ${fornecedor}` : 'Todos os Fornecedores',
        accentColor: '#ef4444',
        itemCount:   fila.length,
      })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      logAudit('Imagem copiada (fila de prioridade)', `${fila.length} OS`, 'export')
      setCopiedImage(true)
      setTimeout(() => setCopiedImage(false), 2500)
    } catch (e) {
      console.error('Clipboard error:', e)
    }
  }
```

Não alterar mais nada neste arquivo nesta task — cabeçalho/grid/barra de filtros ficam para a Task 3.

- [ ] **Step 4: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — nenhum teste quebrado (nem `OrdensPage.tsx` nem `FilaPage.tsx` têm testes próprios hoje).

- [ ] **Step 5: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros — confirma que `toBlob` não ficou como import morto em nenhum dos dois arquivos e que `captureTableImage.ts` compila.

- [ ] **Step 6: Commit**

```bash
git add src/lib/captureTableImage.ts src/features/ordens/OrdensPage.tsx src/features/erp/fila/FilaPage.tsx
git commit -m "refactor(ordens,fila): extrai captureTableAsImage e elimina duplicacao de captura de imagem"
```

---

### Task 2: `OrdensPage.tsx` — adotar `PageHeader`

**Files:**
- Modify: `src/features/ordens/OrdensPage.tsx`

**Interfaces:**
- Consumes: `PageHeader` de `../../components/ui/PageHeader` (`{ title, actions }`, já existe desde a Onda 1, sem mudanças).

- [ ] **Step 1: Adicionar o import do `PageHeader`**

Adicionar, junto aos outros imports de `components/ui/*` (após `import { StatCard } from '../../components/ui/StatCard'`):

```tsx
import { PageHeader } from '../../components/ui/PageHeader'
```

- [ ] **Step 2: Substituir o bloco de cabeçalho**

Substituir (o bloco começa em `{/* ── Header: título + controles + ações ── */}` e vai até o `</div>` que fecha a `div` de "Ações", logo antes de `{/* ── KPI cards ── */}`):

```tsx
      {/* ── Header: título + controles + ações ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-headline text-xl font-semibold text-text flex-1 min-w-0">
          Ordens de Serviço
        </h2>

        {/* KPI toggle */}
        <button
          onClick={() => setKpiVisible(v => !v)}
          className="flex items-center gap-1.5 text-caption font-semibold text-secondary hover:text-text
                     border border-white/[0.08] rounded-xl px-3 py-1.5 transition-all duration-fast"
        >
          <BarChart2 size={12} /> KPIs
          <ChevronUp size={11} className={`transition-transform ${kpiVisible ? '' : 'rotate-180'}`} />
        </button>

        {/* GroupBy toggle */}
        <button
          onClick={() => setGroupBy(g => g === 'cliente' ? 'none' : 'cliente')}
          className={`flex items-center gap-1.5 text-caption font-semibold
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
              className={`px-2.5 py-1 rounded-lg text-caption font-semibold transition-all duration-fast
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
```

por:

```tsx
      {/* ── Header ── */}
      <PageHeader
        title="Ordens de Serviço"
        actions={
          <>
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
          </>
        }
      />

      {/* ── Opções de visualização ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* KPI toggle */}
        <button
          onClick={() => setKpiVisible(v => !v)}
          className="flex items-center gap-1.5 text-caption font-semibold text-secondary hover:text-text
                     border border-white/[0.08] rounded-xl px-3 py-1.5 transition-all duration-fast"
        >
          <BarChart2 size={12} /> KPIs
          <ChevronUp size={11} className={`transition-transform ${kpiVisible ? '' : 'rotate-180'}`} />
        </button>

        {/* GroupBy toggle */}
        <button
          onClick={() => setGroupBy(g => g === 'cliente' ? 'none' : 'cliente')}
          className={`flex items-center gap-1.5 text-caption font-semibold
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
              className={`px-2.5 py-1 rounded-lg text-caption font-semibold transition-all duration-fast
                          ${os.density === d.value
                            ? 'bg-primary/15 text-primary'
                            : 'text-muted hover:text-secondary'}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
```

Nenhum outro trecho do arquivo muda — o `<h2>` título vira `title` do `PageHeader` (mesmo texto), os 4 botões viram `actions` (mesmo JSX interno, só realocados), os 3 toggles saem da mesma `div` e viram uma segunda linha logo abaixo, idêntica visualmente ao que tinham antes (mesmas classes).

- [ ] **Step 3: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão.

- [ ] **Step 4: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/features/ordens/OrdensPage.tsx
git commit -m "refactor(ordens): adota PageHeader, move toggles de visualizacao pra linha propria"
```

---

### Task 3: `FilaPage.tsx` — adotar `PageHeader`, grid responsivo, ações no cabeçalho

**Files:**
- Modify: `src/features/erp/fila/FilaPage.tsx`

**Interfaces:**
- Consumes: `PageHeader` de `../../../components/ui/PageHeader`.

- [ ] **Step 1: Adicionar o import do `PageHeader`**

Adicionar, junto aos outros imports de `components/ui/*` (após `import { StatCard } from '../../../components/ui/StatCard'`):

```tsx
import { PageHeader } from '../../../components/ui/PageHeader'
```

- [ ] **Step 2: Substituir o bloco de cabeçalho**

Substituir:

```tsx
      <div>
        <h1 className="text-[20px] font-bold text-text">Fila de Prioridade</h1>
        <p className="text-label text-muted mt-0.5">Toda OS ativa numa fila só — VT (prazo em horas) e as demais (SLA em dias), ordenadas pela mesma gravidade real</p>
      </div>
```

por:

```tsx
      <PageHeader
        title="Fila de Prioridade"
        description="Toda OS ativa numa fila só — VT (prazo em horas) e as demais (SLA em dias), ordenadas pela mesma gravidade real"
        actions={
          <>
            <button
              onClick={handleCopyImage}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-label font-semibold
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
          </>
        }
      />
```

- [ ] **Step 3: Grid de KPIs responsivo**

Substituir:
```tsx
      <div className="grid grid-cols-5 gap-4">
```
por:
```tsx
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
```

(os 5 `StatCard` dentro dessa `div` não mudam.)

- [ ] **Step 4: Remover os botões de ação da barra de filtros**

Substituir:
```tsx
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
```
por:
```tsx
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect value={tipo} onChange={setTipo} options={tipoOptions} placeholder="Todos os tipos" className="w-40" />
        <FilterSelect value={fornecedor} onChange={setFornecedor} options={fornecedorOptions} placeholder="Todos os fornecedores" className="w-48" />
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por cliente ou nº OS…" className="w-64" />
      </div>
```

- [ ] **Step 5: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão.

- [ ] **Step 6: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros.

- [ ] **Step 7: Verificação manual no navegador**

Run: `npm run dev` (porta 3000, `strictPort: true`).

No navegador, autenticado:
1. `/ordens` — `PageHeader` mostra título "Ordens de Serviço" + os 4 botões de ação; logo abaixo, linha separada com os 3 toggles (KPIs/Por Cliente/Densidade), visualmente igual a antes.
2. `/ordens` — clicar "Copiar Imagem" (sem equipe selecionada) gera a mesma imagem de antes (cabeçalho azul `#3b82f6`, "CABONNET · Ordens de Serviço", "Todas as Equipes").
3. `/ordens` — selecionar uma equipe no filtro, clicar "Copiar Imagem" — ramo `captureOSPorPeriodo` continua funcionando (não foi tocado).
4. `/erp/fila` — `PageHeader` mostra título + descrição + os 2 botões de ação (Copiar Imagem, Notificar violadas); barra de filtros abaixo só com os 2 `FilterSelect` + busca, sem os botões.
5. `/erp/fila` — grid de KPIs (5 cards) degrada corretamente em ~375px (2 colunas), ~768px (3 colunas) e desktop (5 colunas) — usar as ferramentas de responsividade do navegador.
6. `/erp/fila` — clicar "Copiar Imagem" gera a mesma imagem de antes (cabeçalho vermelho `#ef4444`, "CABONNET · Fila de Prioridade").

Reportar o resultado de cada item antes de prosseguir.

- [ ] **Step 8: Commit**

```bash
git add src/features/erp/fila/FilaPage.tsx
git commit -m "refactor(fila): adota PageHeader, move acoes pro cabecalho, grid de KPIs responsivo"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (extração `captureTableImage.ts`) → Task 1. §3.2 (cabeçalho de Ordens) → Task 2. §3.3 (cabeçalho, grid, filtros da Fila) → Task 3. §5 (testes) → decisão de não criar teste tautológico para `captureTableImage.ts` documentada e seguida à risca na Task 1; regressão via suíte completa + type-check em todas as três tasks; verificação manual centralizada na Task 3 (última task, cobre as duas telas de uma vez, mesmo padrão da Onda 3c).

**Placeholders:** nenhum "TBD" — todo código é completo e literal em cada step; os blocos "antes" usados nos `Substituir X por Y` das Tasks 2 e 3 são cópia exata do arquivo atual (conferidos linha a linha contra o código-fonte lido antes de escrever este plano).

**Consistência de tipos:** `CaptureTableImageOptions`/`captureTableAsImage` definidos na Task 1 são consumidos com a mesma assinatura exata nos dois call sites (Task 1 Steps 2 e 3) — não há uso adicional em Tasks 2/3, que só tocam JSX de cabeçalho/grid/filtros, sem reabrir `handleCopyImage`.
