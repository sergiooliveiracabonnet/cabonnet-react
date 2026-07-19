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
