import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import { Fire } from '@phosphor-icons/react'
import { FlyTo, HeatLayer, MapResizer } from '../mapa/MapaComponents'
import {
  agruparPorCelula, bairroDominante, limitesDosPontos, paraCamadaDeCalor, pontosDasRevisitas,
  type PontoQuente,
} from './reincidenciasPontos'
import type { BairroResumo } from './reincidenciasReport'
import type { ClienteReincidente } from '../../lib/builders/churn'

const TOPO_QUENTES = 5
const ALTURA_MAPA = 420

/** Enquadra os pontos quando eles mudam (filtro, aba, chegada das observações). */
function Enquadrar({ pontos }: { pontos: Array<{ lat: number; lng: number }> }) {
  const map = useMap()
  useEffect(() => {
    if (!pontos.length) return
    map.fitBounds(limitesDosPontos(pontos), { padding: [36, 36], maxZoom: 15 })
  }, [map, pontos])
  return null
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Mapa de calor das revisitas no nível do endereço, a partir do GPS que o técnico grava
 *  no início da visita. Os pontos mais quentes abrem o modal do bairro. */
export function ReincidenciasMapa({ tipo, clientes, bairros, carregando, erro, onAbrirBairro }: {
  tipo: string
  clientes: ClienteReincidente[]
  bairros: BairroResumo[]
  carregando: boolean
  erro: boolean
  onAbrirBairro: (key: string) => void
}) {
  const [foco, setFoco] = useState<{ lat: number; lng: number } | null>(null)
  const { pontos, cobertura } = useMemo(() => pontosDasRevisitas(clientes), [clientes])
  const quentes = useMemo(() => agruparPorCelula(pontos), [pontos])
  const bairroDoCliente = useMemo(() => new Map(bairros.flatMap(b => b.clientes.map(c => [c.chave, b.key] as const))), [bairros])
  const rotuloDoBairro = useMemo(() => new Map(bairros.map(b => [b.key, b.label] as const)), [bairros])

  const topo = quentes.slice(0, TOPO_QUENTES).map(q => {
    const key = bairroDominante(q.clientes, bairroDoCliente)
    return { ...q, bairroKey: key, bairro: key ? rotuloDoBairro.get(key) ?? '—' : '—' }
  })
  const cobertura100 = cobertura.total ? Math.round(cobertura.comLocalizacao / cobertura.total * 100) : 0
  const calor = useMemo(() => paraCamadaDeCalor(quentes), [quentes])

  const abrir = (q: { bairroKey: string | null }) => { if (q.bairroKey) onAbrirBairro(q.bairroKey) }

  return (
    <section aria-label={`${tipo}: mapa de calor`}>
      <article className="min-w-0 rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-2">
          <Fire size={17} className="mt-0.5 flex-shrink-0 text-primary" />
          <div>
            <h2 className="text-body font-bold text-text">{tipo}: mapa de calor</h2>
            <p className="mt-0.5 text-caption text-secondary">Onde as OS envolvidas aconteceram, pelo GPS do técnico no início da visita · quanto mais quente, mais OS no mesmo quarteirão</p>
          </div>
        </div>

        {carregando && <p role="status" className="mt-3 rounded-lg border border-dashed border-border bg-elevated/30 p-4 text-label text-secondary">Buscando a localização das OS…</p>}
        {erro && !carregando && <p role="alert" className="mt-3 rounded-lg border border-red/30 bg-red/10 p-3 text-label text-red">Não foi possível ler a localização das OS agora. Tente recarregar o relatório.</p>}

        {!carregando && !erro && !pontos.length && (
          <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-elevated/30 p-6 text-center text-label text-secondary">
            Nenhuma OS deste relatório tem localização registrada.
          </div>
        )}

        {!carregando && pontos.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <div className="relative overflow-hidden rounded-lg border border-border" style={{ height: ALTURA_MAPA }}>
                <MapContainer center={[-23.07, -45.72]} zoom={11} style={{ position: 'absolute', inset: 0, background: 'rgb(13, 17, 23)' }} zoomControl={false}>
                  <MapResizer />
                  <FlyTo point={foco} />
                  <Enquadrar pontos={pontos} />
                  <ZoomControl position="bottomleft" />
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                    attribution="&copy; <a href='https://www.esri.com'>Esri</a>, DeLorme, NAVTEQ"
                    maxZoom={16}
                  />
                  <HeatLayer points={calor} />
                  {topo.map((q, i) => (
                    <CircleMarker key={`${q.lat}:${q.lng}`} center={[q.lat, q.lng]} radius={10}
                      pathOptions={{ color: 'rgb(255, 255, 255)', weight: 2, fillColor: 'rgb(17, 24, 39)', fillOpacity: 0.85 }}
                      eventHandlers={{ click: () => abrir(q) }}>
                      <Tooltip direction="top" offset={[0, -8]}>#{i + 1} · {q.n} OS · {q.bairro}</Tooltip>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-caption text-muted">
                <span>{cobertura.comLocalizacao} de {cobertura.total} OS com localização ({cobertura100}%){cobertura.comLocalizacao < cobertura.total ? ': as demais não trazem GPS no registro' : ''}</span>
                <span className="flex items-center gap-1.5" aria-hidden="true">
                  menos
                  <span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, rgb(59, 130, 246), rgb(168, 85, 247), rgb(249, 115, 22), rgb(248, 113, 113))' }} />
                  mais
                </span>
              </div>
            </div>

            <div className="min-w-0">
              <p className="text-caption text-secondary">{plural(quentes.length, 'ponto', 'pontos')} no mapa · os {Math.min(TOPO_QUENTES, quentes.length)} mais quentes:</p>
              <ol className="mt-2 divide-y divide-border/60 border-t border-border">
                {topo.map((q: PontoQuente & { bairroKey: string | null; bairro: string }, i) => (
                  <li key={`${q.lat}:${q.lng}`} className="flex items-center gap-2 py-1.5">
                    <button type="button" onClick={() => setFoco({ lat: q.lat, lng: q.lng })} aria-label={`Ver no mapa o ponto ${i + 1}`}
                      className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-elevated text-caption font-bold text-text transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">{i + 1}</button>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-label text-text">{q.bairro}</b>
                      <span className="block text-caption text-muted">{q.n} OS · {plural(q.clientes.length, 'cliente', 'clientes')}</span>
                    </span>
                    <button type="button" disabled={!q.bairroKey} onClick={() => abrir(q)}
                      className="min-h-11 cursor-pointer rounded-lg px-2 text-caption font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                      Ver ordens
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </article>
    </section>
  )
}
