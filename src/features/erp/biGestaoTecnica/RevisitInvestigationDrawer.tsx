import { ArrowRight, CheckCircle, Clock, WarningCircle, Wrench } from '@phosphor-icons/react'
import { Drawer } from '../../../components/ui/Drawer'
import { useOSDetails } from '../../../hooks/useOSDetails'
import { useMotivoEncerramento } from '../../../hooks/useMotivoEncerramento'
import type { RevisitJourney } from '../../../hooks/useRevisitJourneys'
import { inferRevisitCause } from '../../../lib/builders/revisitCause'

function EvidencePanel({ title, numos, details, loading }: { title: string; numos: string; details: ReturnType<typeof useOSDetails>['details']; loading: boolean }) {
  if (loading) return <div className="p-4 text-sm text-muted">Carregando evidências da OS {numos}…</div>
  if (!details) return <div className="p-4 text-sm text-muted">Detalhes da OS {numos} indisponíveis.</div>
  return (
    <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-text">{title}</h3>
        <span className="font-mono text-xs text-primary">#{numos}</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-muted">Técnico</dt><dd className="text-text mt-0.5">{details.nomeTecnico || '—'}</dd></div>
        <div><dt className="text-muted">Equipe</dt><dd className="text-text mt-0.5">{details.equipeExecutou || details.equipeAgendada || '—'}</dd></div>
        <div><dt className="text-muted">Reagendada</dt><dd className="text-text mt-0.5">{details.reagendada ? 'Sim' : 'Não'}</dd></div>
        <div><dt className="text-muted">Motivo inconclusivo</dt><dd className="text-text mt-0.5">{details.motivoInconclusivo || '—'}</dd></div>
      </dl>
      {details.obsTecnico && <div><p className="text-[10px] uppercase tracking-wider text-muted">Observação técnica</p><p className="mt-1 text-xs leading-relaxed text-text">{details.obsTecnico}</p></div>}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted">Ocorrências ({details.historico.length})</p>
        <div className="mt-2 max-h-44 overflow-y-auto space-y-2">
          {details.historico.length === 0 && <p className="text-xs text-muted">Nenhuma ocorrência registrada.</p>}
          {details.historico.slice(0, 12).map((item, index) => (
            <div key={`${item.data}-${index}`} className="border-l-2 border-white/[0.1] pl-2 text-xs">
              <p className="text-text leading-relaxed">{item.texto}</p>
              <p className="mt-0.5 text-muted">{[item.autor, item.data, item.hora].filter(Boolean).join(' · ')}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-muted">
        <span>{details.materiais.length} materiais usados</span>
        <span>·</span><span>{details.materiaisRetirados.length} retirados</span>
        <span>·</span><span>{details.checklist.filter(c => c.checked).length}/{details.checklist.length} checklist</span>
        <span>·</span><span>{details.fotos.length} fotos</span>
      </div>
    </section>
  )
}

export function RevisitInvestigationDrawer({ journey, onClose }: { journey: RevisitJourney | null; onClose: () => void }) {
  const origin = useOSDetails(journey?.origin_os)
  const revisit = useOSDetails(journey?.revisit_os)
  const originReason = useMotivoEncerramento(journey?.origin_os ?? undefined)
  const revisitReason = useMotivoEncerramento(journey?.revisit_os)
  const texts = [
    origin.details?.obsTecnico, origin.details?.observacoes, origin.details?.observacaoCritica,
    revisit.details?.obsTecnico, revisit.details?.observacoes, revisit.details?.observacaoCritica,
    ...(origin.details?.historico.map(h => h.texto) ?? []),
    ...(revisit.details?.historico.map(h => h.texto) ?? []),
  ].filter((v): v is string => Boolean(v))
  const manualReason = revisitReason.data?.motivo || originReason.data?.motivo
  const cause = inferRevisitCause({ manualReason, texts })

  return (
    <Drawer open={Boolean(journey)} onClose={onClose} width="960px" title="Investigação da revisita"
      subtitle={journey ? `OS ${journey.origin_os || 'sem origem'} → OS ${journey.revisit_os}` : ''}>
      {journey && <div className="p-4 md:p-5 space-y-4">
        <section className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="flex items-start gap-3">
            {cause.level === 'undetermined' ? <WarningCircle size={20} className="text-amber-400 shrink-0" /> : <CheckCircle size={20} className="text-violet-300 shrink-0" />}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-violet-300">{cause.level === 'confirmed' ? 'Causa confirmada' : cause.level === 'probable' ? 'Hipótese baseada nas evidências' : 'Diagnóstico indeterminado'}</p>
              <p className="mt-1 text-base font-bold text-text">{cause.category}</p>
              {cause.level === 'probable' && <p className="mt-1 text-xs text-muted">Confiança heurística: {cause.confidence}%. Necessita validação operacional.</p>}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-lg border border-white/[0.08] p-3"><Clock size={15} className="text-cyan-400"/><p className="mt-2 text-lg font-mono font-bold text-text">{journey.days_between ?? '—'}</p><p className="text-[11px] text-muted">dias entre visitas</p></div>
          <div className="rounded-lg border border-white/[0.08] p-3"><ArrowRight size={15} className="text-cyan-400"/><p className="mt-2 text-sm font-bold text-text">{journey.same_team === null ? '—' : journey.same_team ? 'Mesma' : 'Alterada'}</p><p className="text-[11px] text-muted">equipe na revisita</p></div>
          <div className="rounded-lg border border-white/[0.08] p-3"><Wrench size={15} className="text-cyan-400"/><p className="mt-2 text-sm font-bold text-text">{journey.recurrence}ª visita</p><p className="text-[11px] text-muted">recorrência oficial</p></div>
          <div className="rounded-lg border border-white/[0.08] p-3"><CheckCircle size={15} className="text-cyan-400"/><p className="mt-2 text-sm font-bold text-text">{journey.link_confidence}</p><p className="text-[11px] text-muted">confiança do vínculo</p></div>
        </div>

        {journey.origin_os ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <EvidencePanel title="Visita anterior" numos={journey.origin_os} details={origin.details} loading={origin.isLoading} />
          <EvidencePanel title="Revisita" numos={journey.revisit_os} details={revisit.details} loading={revisit.isLoading} />
        </div> : <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">A fonte marcou esta OS como revisita, mas a visita anterior não está disponível no histórico consultado.</div>}
      </div>}
    </Drawer>
  )
}
