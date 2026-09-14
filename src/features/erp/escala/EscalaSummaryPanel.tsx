import { useMemo } from 'react'
import { ChartBar } from '@phosphor-icons/react'
import { SectionLabel, type WeekDay } from '../planner/PlannerComponents'
import {
  ESCALA_EQUIPES, EMPRESA_LABEL, EMPRESA_COLOR, STATUS_OPTIONS, STATUS_INDISPONIVEL,
  buildStatusMap, contarEquipesComStatus, type Empresa,
} from './escalaConstants'
import type { EscalaItem } from '../../../lib/api'

export function EscalaSummaryPanel({ days, items }: { days: WeekDay[]; items: EscalaItem[] }) {
  const statusMap = useMemo(() => buildStatusMap(items), [items])

  const porEmpresa = useMemo(() => {
    const counts: Record<Empresa, number> = { INSTACABLE: 0, THM: 0, WES: 0, PROPRIA: 0 }
    for (const e of ESCALA_EQUIPES) counts[e.empresa] += 1
    return counts
  }, [])

  // linha × dia: quantas equipes estão em cada local/atividade, naquele dia
  const linhas = useMemo(() =>
    STATUS_OPTIONS.map(status => ({
      status,
      porDia: days.map(d =>
        ESCALA_EQUIPES.reduce((n, e) => {
          const v = statusMap.get(`${e.codigo}|${d.key}`)
          if (!v) return n
          return n + (v.local1 === status || v.local2 === status ? 1 : 0)
        }, 0)
      ),
    }))
  , [days, statusMap])

  const preenchidasPorDia = useMemo(() =>
    days.map(d => ESCALA_EQUIPES.reduce((n, e) => n + (statusMap.get(`${e.codigo}|${d.key}`)?.local1 ? 1 : 0), 0))
  , [days, statusMap])

  const semPreenchimentoPorDia = preenchidasPorDia.map(n => ESCALA_EQUIPES.length - n)
  const coberturaPorDia = preenchidasPorDia.map(n => ESCALA_EQUIPES.length > 0 ? Math.round((n / ESCALA_EQUIPES.length) * 100) : 0)

  const duasCidadesPorDia = useMemo(() =>
    days.map(d => ESCALA_EQUIPES.reduce((n, e) => n + (statusMap.get(`${e.codigo}|${d.key}`)?.local2 ? 1 : 0), 0))
  , [days, statusMap])

  // Própria (equipe própria) vs terceira (Instacable/WES/THM) — cada equipe cai
  // num grupo só, então a soma dos dois sempre bate com o total.
  const equipesPorGrupo = useMemo(() => ({
    propria:  ESCALA_EQUIPES.filter(e => e.empresa === 'PROPRIA').length,
    terceira: ESCALA_EQUIPES.filter(e => e.empresa !== 'PROPRIA').length,
  }), [])

  const folgasPorGrupo   = useMemo(() => contarEquipesComStatus('Folga',   statusMap, days), [days, statusMap])
  const feriasPorGrupo   = useMemo(() => contarEquipesComStatus('Férias',  statusMap, days), [days, statusMap])
  const ausentesPorGrupo = useMemo(() => contarEquipesComStatus('Ausente', statusMap, days), [days, statusMap])

  const codigosNaoCadastrados = useMemo(() => {
    const validos = new Set(ESCALA_EQUIPES.map(e => e.codigo))
    return new Set(items.filter(it => !validos.has(it.team_code)).map(it => it.team_code)).size
  }, [items])

  return (
    <section className="space-y-2">
      <SectionLabel icon={ChartBar} color="#c4b5fd">Cobertura e disponibilidade</SectionLabel>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl border border-subtle bg-card p-4">
          <p className="text-caption text-muted mb-1.5">Total equipes ativas</p>
          <p className="font-mono font-black tabular-nums text-readout leading-none text-text">{ESCALA_EQUIPES.length}</p>
        </div>
        {(Object.entries(EMPRESA_LABEL) as [Empresa, string][]).map(([key, label]) => (
          <div key={key} className="relative overflow-hidden rounded-xl border bg-card p-4" style={{ borderColor: `${EMPRESA_COLOR[key]}22` }}>
            <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: EMPRESA_COLOR[key] }} />
            <p className="text-caption text-muted mb-1.5">{label}</p>
            <p className="font-mono font-black tabular-nums text-readout leading-none" style={{ color: EMPRESA_COLOR[key] }}>{porEmpresa[key]}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1 rounded-2xl border border-subtle bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-subtle bg-surface/30">
                  <th className="px-4 py-2.5 text-left text-caption font-bold uppercase tracking-label text-muted w-56">Local / Atividade</th>
                  {days.map(d => (
                    <th key={d.key} className={`px-2 py-2.5 text-center text-caption font-bold border-r border-hairline last:border-r-0
                                                 ${d.isToday ? 'text-primary' : 'text-muted'}`}>
                      {d.dow}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.status} className="border-b border-subtle">
                    <td className={`px-4 py-1.5 text-label ${STATUS_INDISPONIVEL.has(l.status) ? 'text-secondary' : 'text-text font-medium'}`}>
                      {l.status}
                    </td>
                    {l.porDia.map((n, i) => (
                      <td key={days[i].key} className="px-2 py-1.5 text-center font-mono text-label text-muted tabular-nums">
                        {n || ''}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-b border-subtle bg-surface/20">
                  <td className="px-4 py-1.5 text-label text-muted">Sem preenchimento</td>
                  {semPreenchimentoPorDia.map((n, i) => (
                    <td key={days[i].key} className="px-2 py-1.5 text-center font-mono text-label text-muted tabular-nums">{n}</td>
                  ))}
                </tr>
                <tr className="border-b border-subtle">
                  <td className="px-4 py-1.5 text-label font-semibold text-text">Células preenchidas</td>
                  {preenchidasPorDia.map((n, i) => (
                    <td key={days[i].key} className="px-2 py-1.5 text-center font-mono text-label font-semibold text-text tabular-nums">{n}</td>
                  ))}
                </tr>
                <tr className="border-b border-subtle">
                  <td className="px-4 py-1.5 text-label font-semibold text-text">Cobertura da semana</td>
                  {coberturaPorDia.map((n, i) => (
                    <td key={days[i].key} className={`px-2 py-1.5 text-center font-mono text-label font-semibold tabular-nums ${n === 100 ? 'text-green' : n >= 60 ? 'text-yellow' : 'text-red'}`}>
                      {n}%
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-1.5 text-label text-muted">Equipes com 2 locais no mesmo dia</td>
                  {duasCidadesPorDia.map((n, i) => (
                    <td key={days[i].key} className="px-2 py-1.5 text-center font-mono text-label text-muted tabular-nums">{n || ''}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:w-72 flex-shrink-0 rounded-2xl border border-subtle bg-card p-4">
          <p className="text-caption font-bold uppercase tracking-label text-muted mb-2">Controle rápido</p>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-caption text-muted font-normal pb-1.5"> </th>
                <th className="text-center text-caption text-muted font-semibold pb-1.5 w-16">Próprias</th>
                <th className="text-center text-caption text-muted font-semibold pb-1.5 w-16">Terceiras</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Equipes',    equipesPorGrupo.propria,  equipesPorGrupo.terceira],
                ['Folgas',     folgasPorGrupo.propria,   folgasPorGrupo.terceira],
                ['Férias',     feriasPorGrupo.propria,   feriasPorGrupo.terceira],
                ['Ausências',  ausentesPorGrupo.propria, ausentesPorGrupo.terceira],
              ].map(([label, propria, terceira]) => (
                <tr key={label as string} className="border-t border-hairline">
                  <td className="py-1.5 text-label text-secondary">{label}</td>
                  <td className="py-1.5 text-center font-mono text-label font-semibold text-text tabular-nums">{propria}</td>
                  <td className="py-1.5 text-center font-mono text-label font-semibold text-text tabular-nums">{terceira}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between text-label border-t border-hairline pt-1.5 mt-1.5">
            <span className="text-secondary">Códigos não cadastrados</span>
            <span className={`font-mono font-semibold tabular-nums ${codigosNaoCadastrados > 0 ? 'text-red' : 'text-text'}`}>{codigosNaoCadastrados}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
