// Converte o SVG do mapa mental em PNG no client — sem libs externas, o SVG já
// nasce serializável (diferente de um recorte de DOM, que precisaria do
// html-to-image usado em captureTableImage.ts).
export async function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const width  = svg.width.baseVal.value
  const height = svg.height.baseVal.value

  // O SVG na tela tem style="width:100%;height:auto" pra caber na prévia
  // responsiva — clonado e serializado do jeito que está, esse style vem
  // junto e faz o navegador renderizar a imagem standalone em outro tamanho
  // (sem containing block, width:100% não tem base pra calcular). O clone de
  // exportação usa só os atributos width/height fixos, sem esse style.
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.removeAttribute('style')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  const svgStr = new XMLSerializer().serializeToString(clone)
  const svgUrl = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }))

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload  = () => resolve(image)
      image.onerror = () => reject(new Error('svgToPngBlob: falha ao carregar o SVG como imagem'))
      image.src = svgUrl
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
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
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
