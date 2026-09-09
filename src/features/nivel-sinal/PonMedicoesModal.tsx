import { useMemo, useState } from 'react'
import { Check, MagnifyingGlass, WarningCircle, WaveSine } from '@phosphor-icons/react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { severityVariant } from './NivelSinalComponents'
import { draftsToMedicoes, formatRx, medicoesResumo, parseRxInput, rxInputInvalido, type MedicaoDraft, type PonMedicao } from './ponMedicoes'
import { severityFromRx } from './nivelSinal'

interface PonMedicoesModalProps {
  titulo: string
  subtitulo: string
  /** 'tratar' fecha a PON junto com as potências; 'editar' só mexe no cadastro. */
  modo: 'tratar' | 'editar'
  drafts: MedicaoDraft[]
  /** Sem CSV carregado ninguém está "fora do CSV" — não há com o que comparar. */
  hasCsv: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: (medicoes: PonMedicao[]) => void
}

const deltaLabel = (antes: number | null, depois: number | null) => {
  if (antes == null || depois == null) return null
  const delta = depois - antes
  return { texto: `${delta > 0 ? '+' : ''}${delta.toFixed(1).replace('.', ',')} dB`, melhorou: delta > 0 }
}

export function PonMedicoesModal({ titulo, subtitulo, modo, drafts, hasCsv, busy, onCancel, onConfirm }: PonMedicoesModalProps) {
  const [linhas, setLinhas] = useState<MedicaoDraft[]>(drafts)
  const [query, setQuery] = useState('')
  const [soAlerta, setSoAlerta] = useState(false)
  const [soInvalidas, setSoInvalidas] = useState(false)

  const resumo = useMemo(() => medicoesResumo(linhas), [linhas])
  const invalidas = useMemo(() => linhas.filter(linha => rxInputInvalido(linha.valor)).length, [linhas])
  const visiveis = useMemo(() => {
    const busca = query.trim().toLocaleLowerCase('pt-BR')
    return linhas.filter(linha => {
      if (soInvalidas && !rxInputInvalido(linha.valor)) return false
      if (soAlerta && linha.nivelAntes !== 'Crítico' && linha.nivelAntes !== 'Atenção') return false
      if (!busca) return true
      return [linha.cliente, linha.onu, linha.serial].join(' ').toLocaleLowerCase('pt-BR').includes(busca)
    })
  }, [linhas, query, soAlerta, soInvalidas])

  const editar = (onuKey: string, campo: 'valor' | 'observacao', valor: string) =>
    setLinhas(atual => atual.map(linha => linha.onu_key === onuKey ? { ...linha, [campo]: valor } : linha))

  return <Modal open onClose={busy ? undefined : onCancel} title={titulo} subtitle={subtitulo} maxWidth="1080px"
    headerAction={<Badge variant={resumo.pendentes ? 'orange' : 'green'}>{resumo.preenchidas} de {resumo.total} medidas</Badge>}>

    <div className="grid grid-cols-2 gap-2 border-b border-border p-4 sm:grid-cols-4">
      {[['Clientes na PON', resumo.total], ['Potências informadas', resumo.preenchidas], ['Pendentes', resumo.pendentes], ['Já normalizadas', resumo.normalizadas]].map(([label, value]) =>
        <div key={label} className="rounded-lg bg-surface/40 px-3 py-2"><p className="text-caption text-muted">{label}</p><p className="mt-1 text-body font-bold tabular-nums text-text">{value}</p></div>)}
    </div>

    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <label className="relative min-w-56 flex-1"><span className="sr-only">Buscar cliente da PON</span>
        <MagnifyingGlass size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cliente, ONU ou serial…"
          className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-label text-text outline-none placeholder:text-muted focus:border-primary/50" />
      </label>
      <button aria-pressed={soAlerta} onClick={() => setSoAlerta(value => !value)}
        className={`rounded-full border px-3 py-1.5 text-caption font-semibold transition-colors ${soAlerta ? 'border-red/40 bg-red/15 text-red' : 'border-border text-muted hover:text-text'}`}>Só quem estava fora do padrão</button>
      {invalidas > 0 && <button aria-pressed={soInvalidas} onClick={() => setSoInvalidas(value => !value)}
        className={`rounded-full border px-3 py-1.5 text-caption font-semibold transition-colors ${soInvalidas ? 'border-red/40 bg-red/15 text-red' : 'border-red/30 text-red hover:bg-red/10'}`}>Só valores inválidos ({invalidas})</button>}
      <span className="ml-auto text-caption text-muted">{visiveis.length} de {linhas.length} clientes</span>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full text-label">
        <thead className="sticky top-0 z-10 border-b border-border bg-elevated"><tr>
          {['Cliente', 'ONU / serial', 'Potência antes', 'Nova potência (dBm)', 'Resultado', 'Observação'].map(label =>
            <th key={label} className="whitespace-nowrap px-4 py-2.5 text-left text-caption font-semibold uppercase tracking-wide text-muted">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-border">{visiveis.map(linha => {
          const novo = parseRxInput(linha.valor)
          const invalido = rxInputInvalido(linha.valor)
          const nivelDepois = severityFromRx(invalido || novo == null || Number.isNaN(novo) ? null : novo)
          const delta = invalido ? null : deltaLabel(linha.rx_antes, novo != null && Number.isFinite(novo) ? novo : null)
          return <tr key={linha.onu_key} className="align-middle hover:bg-surface/20">
            <td className="max-w-56 truncate px-4 py-2 font-semibold text-text" title={linha.cliente}>{linha.cliente}
              {linha.noCsv && hasCsv && <span className="ml-2 text-caption font-normal text-muted">fora do CSV atual</span>}</td>
            <td className="whitespace-nowrap px-4 py-2 font-mono text-caption text-secondary">{linha.onu || '—'}<span className="block text-muted">{linha.serial || '—'}</span></td>
            <td className="whitespace-nowrap px-4 py-2"><span className="flex items-center gap-2"><b className="font-mono tabular-nums text-text">{formatRx(linha.rx_antes) || '—'}</b>
              {linha.nivelAntes !== '—' && <Badge variant={severityVariant(linha.nivelAntes)} dot={false}>{linha.nivelAntes}</Badge>}</span></td>
            <td className="px-4 py-2">
              <input inputMode="decimal" value={linha.valor} onChange={event => editar(linha.onu_key, 'valor', event.target.value)}
                aria-label={`Nova potência de ${linha.cliente}`} aria-invalid={invalido} placeholder="—"
                className={`h-9 w-28 rounded-md border bg-surface px-3 text-label font-mono tabular-nums text-text outline-none placeholder:text-muted ${invalido ? 'border-red/60 text-red' : 'border-border focus:border-primary/50'}`} />
            </td>
            {/* Sem RX de antes não há delta, mas a medição existe: quem tem valor
                digitado é classificado, senão a linha contradiz o contador do topo. */}
            <td className="whitespace-nowrap px-4 py-2">{invalido ? <span className="text-caption font-semibold text-red">valor inválido</span>
              : nivelDepois !== '—' ? <span className="flex items-center gap-2"><Badge variant={severityVariant(nivelDepois)} dot={false}>{nivelDepois}</Badge>
                {delta && <span className={`text-caption font-semibold tabular-nums ${delta.melhorou ? 'text-green' : 'text-orange'}`}>{delta.texto}</span>}</span>
              : <span className="text-caption text-muted">a medir</span>}</td>
            <td className="px-4 py-2"><input value={linha.observacao} onChange={event => editar(linha.onu_key, 'observacao', event.target.value)}
              aria-label={`Observação de ${linha.cliente}`} placeholder="opcional"
              className="h-9 w-full min-w-40 rounded-md border border-border bg-surface px-3 text-label text-text outline-none placeholder:text-muted focus:border-primary/50" /></td>
          </tr>
        })}
        {!visiveis.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-muted">
          {linhas.length ? 'Nenhum cliente corresponde à busca.'
            : hasCsv ? 'O CSV carregado não traz clientes para esta PON.'
              : 'Carregue o CSV de sinais na aba Análise para listar os clientes desta PON.'}</td></tr>}
        </tbody>
      </table>
    </div>

    <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-border bg-elevated px-4 py-3">
      <p className="flex items-center gap-2 text-caption text-muted">
        {invalidas ? <><WarningCircle size={14} className="text-red" /><span className="text-red">{invalidas} potência(s) com valor inválido — corrija antes de salvar.</span></>
          : <><WaveSine size={14} /><span>Pode deixar em branco quem ainda não foi medido: dá para completar depois na aba PONs tratadas.</span></>}
      </p>
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
        <Button onClick={() => onConfirm(draftsToMedicoes(linhas))} disabled={busy || invalidas > 0}>
          <Check size={15} /> {modo === 'tratar' ? 'Marcar PON como tratada' : 'Salvar potências'}
        </Button>
      </div>
    </div>
  </Modal>
}
