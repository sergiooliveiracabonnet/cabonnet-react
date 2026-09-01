/**
 * Carregamento de texturas da topologia 3D do Juniper.
 *
 * O repositório não versiona assets binários (.glb/.png/.hdr), então as
 * texturas são desenhadas em canvas, exportadas como data URI e carregadas
 * pelo `TextureLoader` — o mesmo caminho de um arquivo remoto, incluindo
 * LoadingManager, progresso, cache e tratamento de erro. Trocar a origem por
 * uma URL real depois não muda nada além da string passada ao loader.
 */
import * as THREE from 'three'

// Reaproveita texturas entre montagens do componente (voltar à aba não recarrega).
THREE.Cache.enabled = true

export interface JuniperTextures {
  /** Halo radial usado como sprite atrás de cada nó. */
  glow: THREE.Texture
  /** Textura do rótulo por nó, indexada pelo texto. */
  labels: Map<string, THREE.Texture>
}

export interface LoadAssetsOptions {
  /** Rótulos a rasterizar (um por nó visível). */
  labels: readonly string[]
  /** Cor do texto do rótulo, em qualquer notação CSS. */
  labelColor: string
  /** Usado só para descobrir a anisotropia máxima suportada. */
  renderer: THREE.WebGLRenderer
  /** 0 → 1. Chamado a cada asset concluído. */
  onProgress?: (ratio: number) => void
}

const LABEL_FONT = '600 44px "Inter Variable", Inter, system-ui, sans-serif'
const GLOW_SIZE  = 128
const LABEL_PAD  = 24

/** Disco com gradiente radial — vira o halo do nó. */
function glowDataURI(): string {
  const c = document.createElement('canvas')
  c.width = c.height = GLOW_SIZE
  const ctx = c.getContext('2d')
  if (!ctx) return ''
  const r = GLOW_SIZE / 2
  const g = ctx.createRadialGradient(r, r, 0, r, r, r)
  g.addColorStop(0,    'rgba(255,255,255,1)')
  g.addColorStop(0.28, 'rgba(255,255,255,0.55)')
  g.addColorStop(1,    'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE)
  return c.toDataURL('image/png')
}

/** Rasteriza um rótulo. Devolve a data URI e a proporção, para dimensionar o sprite. */
function labelDataURI(text: string, color: string): { uri: string; aspect: number } {
  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) return { uri: '', aspect: 4 }
  measure.font = LABEL_FONT
  const w = Math.ceil(measure.measureText(text).width) + LABEL_PAD * 2
  const h = 72

  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return { uri: '', aspect: w / h }

  ctx.font         = LABEL_FONT
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  // Contorno escuro para o texto sobreviver sobre nós claros e escuros.
  ctx.lineWidth   = 6
  ctx.strokeStyle = 'rgba(0,0,0,0.75)'
  ctx.strokeText(text, w / 2, h / 2)
  ctx.fillStyle = color
  ctx.fillText(text, w / 2, h / 2)

  return { uri: c.toDataURL('image/png'), aspect: w / h }
}

/** Proporção largura/altura de cada rótulo, para o sprite não distorcer. */
export const labelAspects = new Map<string, number>()

/** Promisifica o TextureLoader mantendo o callback de erro do loader. */
function loadTexture(loader: THREE.TextureLoader, uri: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    if (!uri) {
      reject(new Error('data URI vazia — canvas 2d indisponível'))
      return
    }
    loader.load(uri, resolve, undefined, reject)
  })
}

/** Textura 1x1 branca — usada se o canvas falhar, para a cena não ficar sem render. */
function fallbackTexture(): THREE.Texture {
  const data = new Uint8Array([255, 255, 255, 255])
  const tex  = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat)
  tex.needsUpdate = true
  return tex
}

export async function loadJuniperTextures(
  { labels, labelColor, renderer, onProgress }: LoadAssetsOptions,
): Promise<JuniperTextures> {
  const unique    = [...new Set(labels)]
  const maxAniso  = renderer.capabilities.getMaxAnisotropy()

  const manager = new THREE.LoadingManager()
  // `itemsTotal` do manager conta cada data URI; o ratio alimenta a barra de progresso.
  manager.onProgress = (_url, loaded, total) => onProgress?.(total ? loaded / total : 1)
  manager.onError    = (url) => console.warn('[JuniperTopology] falha ao carregar textura', url.slice(0, 48))

  const loader = new THREE.TextureLoader(manager)

  /** Configuração comum: sprites são sempre RGBA em sRGB, sem repetição. */
  const configure = (tex: THREE.Texture): THREE.Texture => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.anisotropy = maxAniso
    tex.needsUpdate = true
    return tex
  }

  const labelJobs = unique.map(async (text) => {
    const { uri, aspect } = labelDataURI(text, labelColor)
    labelAspects.set(text, aspect)
    const tex = await loadTexture(loader, uri).catch(() => fallbackTexture())
    return [text, configure(tex)] as const
  })

  // Halo e rótulos carregam em paralelo; o manager consolida o progresso.
  const [glow, labelEntries] = await Promise.all([
    loadTexture(loader, glowDataURI()).then(configure).catch(() => fallbackTexture()),
    Promise.all(labelJobs),
  ])

  onProgress?.(1)
  return { glow, labels: new Map(labelEntries) }
}

/** Libera GPU memory ao desmontar. O `THREE.Cache` guarda a imagem, não a textura. */
export function disposeJuniperTextures(assets: JuniperTextures | null): void {
  if (!assets) return
  assets.glow.dispose()
  assets.labels.forEach(t => t.dispose())
  assets.labels.clear()
}
