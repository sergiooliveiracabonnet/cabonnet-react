import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
// Import type-only: apagado na compilacao, nao puxa o three para o bundle.
import type * as ThreeNS from 'three'
import { CubeTransparent, ArrowClockwise, Play, Pause, WarningCircle } from '@phosphor-icons/react'
import { useUIStore } from '../../../store/uiStore'
import { Button } from '../../../components/ui/Button'
import { buildTopology, type TopologyClient, type TopologyNode } from './topologyGraph'
import { layoutTopology, nodeRadius } from './topologyLayout'

/**
 * Topologia PPPoE em 3D: cluster -> interface -> cliente.
 *
 * Three.js e carregado sob demanda (`import()` dinamico) — nenhuma outra rota
 * do dashboard paga o custo do bundle. A cena so monta quando o usuario abre
 * esta visualizacao.
 *
 * Convencao de cor: sessao ATIVA e vermelha porque neste monitor uma sessao
 * ativa e a anomalia, nao o estado saudavel.
 */

/** Acima disso a cena vira ruido visual e o custo de raycast cresce sem retorno. */
const MAX_CLIENT_NODES = 400

interface Props {
  clientes: readonly TopologyClient[]
  cluster:  string
}

interface HoverInfo {
  label:  string
  detail: Record<string, string>
  x:      number
  y:      number
}

/** Le `--c-*` (formato "59 130 246") e devolve o inteiro 0xRRGGBB que o Three.js espera. */
function readToken(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw   = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const parts = raw.split(/[\s,]+/).map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) return fallback
  return (parts[0] << 16) | (parts[1] << 8) | parts[2]
}

/** Mesma leitura, em notacao CSS — o canvas 2d dos rotulos precisa de string. */
function readTokenCss(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const raw   = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const parts = raw.split(/[\s,]+/).map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) return fallback
  return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`
}

export default function JuniperTopology3D({ clientes, cluster }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const theme    = useUIStore(s => s.theme)

  const [progress, setProgress] = useState(0)
  const [ready,    setReady]    = useState(false)
  const [failed,   setFailed]   = useState<string | null>(null)
  const [hover,    setHover]    = useState<HoverInfo | null>(null)
  const [spinning, setSpinning] = useState(true)

  // Funcao de reenquadrar publicada pelo efeito da cena.
  const resetRef  = useRef<(() => void) | null>(null)
  // Lido dentro do loop de animacao sem recriar a cena a cada toggle.
  const spinRef = useRef(spinning)
  useEffect(() => { spinRef.current = spinning }, [spinning])

  const truncated = clientes.length > MAX_CLIENT_NODES
  const visible   = useMemo(
    () => (truncated ? clientes.slice(0, MAX_CLIENT_NODES) : clientes),
    [clientes, truncated],
  )
  const graph = useMemo(() => buildTopology(visible, cluster), [visible, cluster])

  const handleReset = useCallback(() => resetRef.current?.(), [])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let disposed = false
    // Descartes executados na ordem inversa da criacao.
    const teardown: Array<() => void> = []

    setReady(false)
    setFailed(null)
    setProgress(0)

    const boot = async () => {
      try {
        const [THREE, controlsMod, assets] = await Promise.all([
          import('three'),
          import('three/addons/controls/OrbitControls.js'),
          import('../../../lib/three/juniperAssets'),
        ])
        if (disposed) return

        const width  = mount.clientWidth  || 800
        const height = mount.clientHeight || 520

        const colors = {
          bg:      readToken('--c-card',    0x18181b),
          cluster: readToken('--c-primary', 0x3b82f6),
          iface:   readToken('--c-cyan',    0x22d3ee),
          active:  readToken('--c-red',     0xf87171),
          idle:    readToken('--c-muted',   0x71717a),
          link:    readToken('--c-border',  0x3f3f46),
          text:    readTokenCss('--c-text', 'rgb(244, 244, 245)'),
        }

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(width, height)
        mount.appendChild(renderer.domElement)
        teardown.push(() => {
          renderer.dispose()
          renderer.domElement.remove()
        })

        const scene  = new THREE.Scene()
        scene.fog    = new THREE.Fog(colors.bg, 26, 62)
        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200)
        camera.position.set(0, 7, 26)

        const controls = new controlsMod.OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.08
        controls.minDistance   = 6
        controls.maxDistance   = 60
        teardown.push(() => controls.dispose())

        scene.add(new THREE.AmbientLight(0xffffff, 1.1))
        const key = new THREE.DirectionalLight(0xffffff, 1.5)
        key.position.set(8, 14, 10)
        scene.add(key)

        // So cluster e interfaces recebem rotulo. Um rotulo por cliente geraria
        // centenas de texturas para um texto que o hover ja mostra melhor.
        const labelled = graph.nodes.filter(n => n.kind !== 'client')
        const textures = await assets.loadJuniperTextures({
          labels:     labelled.map(n => n.label),
          labelColor: colors.text,
          renderer,
          onProgress: (r) => { if (!disposed) setProgress(r) },
        })
        if (disposed) {
          assets.disposeJuniperTextures(textures)
          return
        }
        teardown.push(() => assets.disposeJuniperTextures(textures))

        const positions = layoutTopology(graph)

        // ---- Nos ----------------------------------------------------------
        const sphere = new THREE.SphereGeometry(1, 20, 16)
        teardown.push(() => sphere.dispose())

        // Um material por cor, nao por no — 400 clientes compartilham 2 materiais.
        const materials = new Map<number, ThreeNS.MeshStandardMaterial>()
        const materialFor = (node: TopologyNode): ThreeNS.MeshStandardMaterial => {
          const base = node.kind === 'cluster' ? colors.cluster
            : node.active           ? colors.active
              : node.kind === 'iface' ? colors.iface
                : colors.idle
          const cached = materials.get(base)
          if (cached) return cached
          const mat = new THREE.MeshStandardMaterial({
            color:    base,
            roughness: 0.42,
            metalness: 0.12,
            emissive:  base,
            emissiveIntensity: 0.28,
          })
          materials.set(base, mat)
          return mat
        }
        teardown.push(() => materials.forEach(m => m.dispose()))

        const pickable: ThreeNS.Mesh[] = []
        const group = new THREE.Group()

        for (const node of graph.nodes) {
          const p = positions.get(node.id)
          if (!p) continue

          const mesh = new THREE.Mesh(sphere, materialFor(node))
          mesh.position.set(p.x, p.y, p.z)
          mesh.scale.setScalar(nodeRadius(node))
          mesh.userData.node = node
          group.add(mesh)
          pickable.push(mesh)

          // Halo: marca o no ativo por brilho, nao so por matiz.
          if (node.active || node.kind === 'cluster') {
            const glowMat = new THREE.SpriteMaterial({
              map:         textures.glow,
              color:       node.kind === 'cluster' ? colors.cluster : colors.active,
              transparent: true,
              opacity:     node.kind === 'client' ? 0.34 : 0.46,
              depthWrite:  false,
            })
            const glow = new THREE.Sprite(glowMat)
            glow.position.copy(mesh.position)
            glow.scale.setScalar(nodeRadius(node) * 6)
            group.add(glow)
            teardown.push(() => glowMat.dispose())
          }
        }

        // ---- Rotulos ------------------------------------------------------
        for (const node of labelled) {
          const p   = positions.get(node.id)
          const tex = textures.labels.get(node.label)
          if (!p || !tex) continue

          const aspect = assets.labelAspects.get(node.label) ?? 4
          const mat    = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
          const sprite = new THREE.Sprite(mat)
          const h      = node.kind === 'cluster' ? 0.9 : 0.62
          sprite.scale.set(h * aspect, h, 1)
          sprite.position.set(p.x, p.y + nodeRadius(node) + h * 0.9, p.z)
          group.add(sprite)
          teardown.push(() => mat.dispose())
        }

        // ---- Ligacoes -----------------------------------------------------
        const idlePts:   number[] = []
        const activePts: number[] = []
        for (const link of graph.links) {
          const a = positions.get(link.source)
          const b = positions.get(link.target)
          if (!a || !b) continue
          const bucket = link.active ? activePts : idlePts
          bucket.push(a.x, a.y, a.z, b.x, b.y, b.z)
        }
        const addLines = (pts: number[], color: number, opacity: number) => {
          if (!pts.length) return
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
          const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity })
          group.add(new THREE.LineSegments(geo, mat))
          teardown.push(() => {
            geo.dispose()
            mat.dispose()
          })
        }
        addLines(idlePts,   colors.link,   0.5)
        addLines(activePts, colors.active, 0.42)

        scene.add(group)

        // ---- Interacao ----------------------------------------------------
        const raycaster = new THREE.Raycaster()
        const pointer   = new THREE.Vector2()
        let hovering    = false

        const onPointerMove = (e: PointerEvent) => {
          const rect = renderer.domElement.getBoundingClientRect()
          pointer.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
          pointer.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
          raycaster.setFromCamera(pointer, camera)

          const hit = raycaster.intersectObjects(pickable, false)[0]
          if (hit) {
            const node = hit.object.userData.node as TopologyNode
            hovering = true
            setHover({
              label:  node.label,
              detail: node.detail,
              x:      e.clientX - rect.left,
              y:      e.clientY - rect.top,
            })
            renderer.domElement.style.cursor = 'pointer'
          } else if (hovering) {
            hovering = false
            setHover(null)
            renderer.domElement.style.cursor = 'grab'
          }
        }
        const onPointerLeave = () => {
          hovering = false
          setHover(null)
        }
        renderer.domElement.addEventListener('pointermove',  onPointerMove)
        renderer.domElement.addEventListener('pointerleave', onPointerLeave)
        teardown.push(() => {
          renderer.domElement.removeEventListener('pointermove',  onPointerMove)
          renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
        })

        const home = camera.position.clone()
        resetRef.current = () => {
          camera.position.copy(home)
          controls.target.set(0, 0, 0)
          controls.update()
        }

        // ---- Loop ---------------------------------------------------------
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduceMotion) setSpinning(false)

        let frame = 0
        let last  = performance.now()
        const tick = (now: number) => {
          frame = requestAnimationFrame(tick)
          const dt = Math.min((now - last) / 1000, 0.1)
          last = now
          // Para a rotacao no hover para o operador conseguir ler o tooltip.
          if (spinRef.current && !hovering && !reduceMotion) {
            group.rotation.y += dt * 0.12
          }
          controls.update()
          renderer.render(scene, camera)
        }
        frame = requestAnimationFrame(tick)
        teardown.push(() => cancelAnimationFrame(frame))

        // ---- Resize -------------------------------------------------------
        const ro = new ResizeObserver(() => {
          const w = mount.clientWidth
          const h = mount.clientHeight
          if (!w || !h) return
          camera.aspect = w / h
          camera.updateProjectionMatrix()
          renderer.setSize(w, h)
        })
        ro.observe(mount)
        teardown.push(() => ro.disconnect())

        setReady(true)
      } catch (err) {
        if (disposed) return
        console.error('[JuniperTopology] falha ao montar a cena', err)
        setFailed(err instanceof Error ? err.message : 'Erro desconhecido ao iniciar o WebGL')
      }
    }

    void boot()

    return () => {
      disposed = true
      resetRef.current = null
      for (let i = teardown.length - 1; i >= 0; i--) teardown[i]()
    }
    // `theme` entra nas deps de proposito: trocar o tema reconstroi a cena com os novos tokens.
  }, [graph, theme])

  if (failed) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-yellow/[0.08] border border-yellow/30 rounded-xl">
        <WarningCircle size={16} className="text-yellow flex-shrink-0" />
        <div className="flex-1">
          <p className="text-label font-semibold text-yellow">Não foi possível renderizar a topologia 3D</p>
          <p className="text-caption text-muted mt-0.5">
            {failed} — os cartões de interface acima continuam válidos.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-white/[0.08] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-white/[0.06] flex-wrap">
        <p className="text-caption font-bold uppercase tracking-[0.08em] text-primary/80 flex items-center gap-1.5">
          <CubeTransparent size={13} /> Topologia PPPoE · cluster → interface → cliente
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSpinning(s => !s)}>
            {spinning ? <Pause size={11} /> : <Play size={11} />}
            {spinning ? 'Pausar' : 'Girar'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <ArrowClockwise size={11} /> Reenquadrar
          </Button>
        </div>
      </div>

      <div className="relative">
        <div ref={mountRef} className="h-[520px] w-full cursor-grab" />

        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card/80">
            <p className="text-caption text-muted">Carregando texturas da topologia…</p>
            <div className="h-1 w-48 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-primary transition-[width] duration-normal"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {hover && (
          <div
            className="pointer-events-none absolute z-10 min-w-[190px] rounded-lg border border-white/[0.12]
                       bg-elevated/95 px-3 py-2 shadow-xl backdrop-blur-sm"
            style={{ left: hover.x + 14, top: Math.max(hover.y - 12, 8) }}
          >
            <p className="text-label font-bold text-text truncate">{hover.label}</p>
            <div className="mt-1.5 space-y-0.5">
              {Object.entries(hover.detail).map(([k, v]) => (
                <p key={k} className="text-caption text-muted flex justify-between gap-3">
                  <span>{k}</span>
                  <span className="font-mono text-text/80 truncate max-w-[120px]">{v}</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 px-5 py-3 border-t border-white/[0.06] flex-wrap">
        <span className="flex items-center gap-1.5 text-caption text-muted">
          <span className="w-2 h-2 rounded-full bg-primary inline-block" /> Cluster
        </span>
        <span className="flex items-center gap-1.5 text-caption text-muted">
          <span className="w-2 h-2 rounded-full bg-cyan inline-block" /> Interface sem sessão
        </span>
        <span className="flex items-center gap-1.5 text-caption text-muted">
          <span className="w-2 h-2 rounded-full bg-red inline-block" /> Sessão ativa (anomalia)
        </span>
        <span className="text-caption text-muted ml-auto">
          {graph.stats.ifaces} interfaces · {graph.stats.clients} sessões · {graph.stats.active} ativas
          {truncated && ` · exibindo as ${MAX_CLIENT_NODES} primeiras de ${clientes.length}`}
        </span>
      </div>
    </div>
  )
}
