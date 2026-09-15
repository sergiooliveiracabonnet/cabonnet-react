// Converte o SVG do mapa mental em PNG no client — sem libs externas, o SVG já
// nasce serializável (diferente de um recorte de DOM, que precisaria do
// html-to-image usado em captureTableImage.ts).
export async function svgToPngBlob(svg: SVGSVGElement, scale = 3): Promise<Blob> {
  const width  = svg.width.baseVal.value
  const height = svg.height.baseVal.value

  // O SVG na tela tem style="width:100%;height:auto" pra caber na prévia
  // responsiva — clonado e serializado do jeito que está, esse style vem
  // junto e faz o navegador renderizar a imagem standalone em outro tamanho
  // (sem containing block, width:100% não tem base pra calcular). O clone de
  // exportação usa só os atributos width/height fixos, sem esse style.
  //
  // width/height do clone vão pro tamanho JÁ escalado (o viewBox continua no
  // sistema de coordenadas original) — é o que faz o navegador rasterizar o
  // <img> na resolução alta direto do vetor. Escalar só depois, no
  // canvas.drawImage, reamostra um bitmap que já nasceu pequeno e sai
  // borrado — foi o que causava a "baixa resolução".
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.removeAttribute('style')
  clone.setAttribute('width', String(Math.round(width * scale)))
  clone.setAttribute('height', String(Math.round(height * scale)))

  const svgStr = new XMLSerializer().serializeToString(clone)

  // blob: URL pareceria mais natural aqui, mas a CSP do app (index.html) só
  // libera img-src para 'self'/data:/alguns hosts de mapa — sem "blob:". Um
  // data: URI já passa por essa política sem precisar afrouxá-la.
  const base64 = btoa(unescape(encodeURIComponent(svgStr)))
  const dataUri = `data:image/svg+xml;base64,${base64}`

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload  = () => resolve(image)
    image.onerror = () => reject(new Error('svgToPngBlob: falha ao carregar o SVG como imagem'))
    image.src = dataUri
  })

  const canvas = document.createElement('canvas')
  canvas.width  = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('svgToPngBlob: canvas 2d context indisponível')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('svgToPngBlob: canvas.toBlob falhou')), 'image/png')
  )
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Copia a imagem pra área de transferência — mesmo mecanismo usado em Ordens
 *  (captureTableImage.ts) pra colar direto num grupo do Telegram/WhatsApp. */
export async function copyImageBlob(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
