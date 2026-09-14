import { useMemo, useRef, useState } from 'react'
import { X, DownloadSimple, CopySimple, CalendarBlank, Check, WarningCircle } from '@phosphor-icons/react'
import { useEscalaSemana } from '../../../hooks/useEscala'
import { buildMindMapGroups } from './escalaMindMap'
import { EscalaMindMapSvg } from './EscalaMindMapSvg'
import { svgToPngBlob, downloadBlob, copyImageBlob } from './escalaMindMapExport'

const DOW_NAMES = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

/** 'YYYY-MM-DD' (formato do <input type="date">) → 'DD/MM/YYYY' (formato da escala) */
function isoParaDia(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function hojeIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function EscalaMindMapModal({ onClose }: { onClose: () => void }) {
  const [dataIso, setDataIso] = useState(hojeIso())
  const [exporting, setExporting] = useState<'baixar' | 'copiar' | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)

  const dia = isoParaDia(dataIso)
  const { data: items = [], isLoading } = useEscalaSemana([dia])
  const groups = useMemo(() => buildMindMapGroups(items, dia), [items, dia])

  const dateTitle = useMemo(() => {
    const [y, m, d] = dataIso.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return `${DOW_NAMES[dt.getDay()]} · ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
  }, [dataIso])

  const generatedAt = useMemo(() => {
    const now = new Date()
    return `Gerado em ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }, [])

  async function handleBaixar() {
    if (!svgRef.current) return
    setErro('')
    setExporting('baixar')
    try {
      const blob = await svgToPngBlob(svgRef.current)
      downloadBlob(blob, `escala_${dia.replace(/\//g, '-')}.png`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar a imagem.')
    } finally {
      setExporting(null)
    }
  }

  async function handleCopiar() {
    if (!svgRef.current) return
    setErro('')
    setExporting('copiar')
    try {
      const blob = await svgToPngBlob(svgRef.current)
      await copyImageBlob(blob)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível copiar a imagem. Verifique a permissão da área de transferência.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-elevated border border-subtle rounded-2xl shadow-2xl
                      w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-subtle flex-shrink-0">
          <div>
            <p className="text-title font-bold text-text leading-tight">Exportar escala — mapa mental</p>
            <p className="text-caption text-muted mt-0.5">Organizado por cidade — escolha o dia e baixe ou copie a imagem</p>
          </div>
          <button onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center
                             text-muted hover:text-text hover:bg-surface transition-colors flex-shrink-0">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-subtle flex items-center gap-3 flex-shrink-0">
          <CalendarBlank size={14} className="text-muted" />
          <label className="text-label text-secondary" htmlFor="escala-mindmap-data">Dia</label>
          <input
            id="escala-mindmap-data"
            type="date"
            value={dataIso}
            onChange={e => setDataIso(e.target.value)}
            className="bg-surface border border-subtle rounded-lg px-2.5 py-1.5 text-label text-text
                       outline-none focus:border-primary/40 transition-colors"
          />
          {!isLoading && (
            <span className="text-caption text-muted ml-auto">
              {groups.reduce((s, g) => s + g.equipes.length, 0)} equipe(s) escaladas neste dia
            </span>
          )}
        </div>

        <div className="flex-1 overflow-auto bg-surface/30 p-4 flex items-start justify-center">
          {isLoading ? (
            <div className="flex items-center justify-center py-24 gap-3 text-secondary text-sm">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Carregando…
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-lg" style={{ width: '100%', maxWidth: 700 }}>
              <EscalaMindMapSvg
                ref={svgRef}
                groups={groups}
                dateTitle={dateTitle}
                generatedAt={generatedAt}
              />
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-subtle flex items-center justify-end gap-2 flex-shrink-0">
          {erro && (
            <span className="flex items-center gap-1.5 text-caption text-red mr-auto">
              <WarningCircle size={12} /> {erro}
            </span>
          )}
          <button onClick={onClose}
                  className="text-caption font-semibold text-secondary hover:text-text px-3 py-1.5 transition-colors">
            Fechar
          </button>
          <button
            onClick={handleCopiar}
            disabled={isLoading || exporting !== null}
            className="flex items-center gap-1.5 text-caption font-semibold text-secondary hover:text-text
                       border border-subtle rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copiado ? <Check size={12} className="text-green" /> : <CopySimple size={12} />}
            {exporting === 'copiar' ? 'Copiando…' : copiado ? 'Copiado!' : 'Copiar imagem'}
          </button>
          <button
            onClick={handleBaixar}
            disabled={isLoading || exporting !== null}
            className="flex items-center gap-1.5 text-caption font-semibold text-white bg-primary hover:bg-primary/90
                       rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <DownloadSimple size={12} /> {exporting === 'baixar' ? 'Gerando…' : 'Baixar PNG'}
          </button>
        </div>
      </div>
    </div>
  )
}
