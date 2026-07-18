import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListTodo, AlertTriangle, Flame, Siren, Users, MapPin, Gauge, ChevronRight } from 'lucide-react'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { filaUrgenciaTier, filaUrgenciaScore } from '../../../lib/builders/fila'
import { shortEquipe, fmtHorasMin } from '../../../lib/osFormat'
import { Badge } from '../../../components/ui/Badge'
import { StatCard } from '../../../components/ui/StatCard'
import OSDrawer from '../../ordens/OSDrawer'
import type { OSRow } from '../../../lib/types'

// "O que eu preciso fazer agora, em ordem, e por quê" — hoje essa pergunta exige
// abrir Dashboard, Fila, Alertas e Cidades separadamente pra montar o quadro.
// Esta página só agrega o que cada builder já calcula (nenhuma lógica de negócio
// nova) numa fila única, ordenada por severidade.

const LIMITE_ITENS = 40

type Severidade = 'critico' | 'atencao'

interface AcaoItem {
  id:         string
  titulo:     string
  motivo:     string
  severidade: Severidade
  fonte:      string
  score:      number
  row?:       OSRow
  linkTo?:    string
}

const FONTE_ICON: Record<string, typeof Siren> = {
  'Fila':       Siren,
  'Equipes':    Users,
  'Cidades':    MapPin,
  'SLA':        Gauge,
}

function buildAgenda(rows: OSRow[], derived: ReturnType<typeof useOSDerived>['derived']): AcaoItem[] {
  const itens: AcaoItem[] = []

  // ── Fila: violado ou atenção — mesmo critério de urgência da Fila de
  // Prioridade unificada (VT em horas, demais tipos em SLA de dias) ───────
  for (const r of rows) {
    if (!(r.descsituacao === 'Pendente' || r.descsituacao === 'Atendimento')) continue
    const tier = filaUrgenciaTier(r)
    if (tier === 'ok') continue
    const isVT = r._vtPrazoHoras != null
    const motivo = isVT
      ? (r._vtViolado ? `Violado há ${fmtHorasMin(r._vtHorasRestantes ?? 0)}` : `Faltam ${fmtHorasMin(r._vtHorasRestantes ?? 0)} para o prazo`)
      : `${r._agingAbertura ?? 0}d aberta · limite é ${r._slaLimite ?? '?'}d`
    itens.push({
      id: `fila:${r.numos}`,
      titulo: `OS ${r.numos} — ${r._slaTipoLabel ?? '?'}`,
      motivo,
      severidade: tier === 'violado' ? 'critico' : 'atencao',
      fonte: 'Fila',
      score: filaUrgenciaScore(r),
      row: r,
    })
  }

  // ── Sem equipe há mais de 4h ─────────────────────────────────────────────
  const semEquipe = rows
    .filter(r => (r.descsituacao === 'Pendente' || r.descsituacao === 'Atendimento')
      && !r.nomedaequipe?.trim() && (r._agingHoras ?? 0) > 4)
    .sort((a, b) => (b._agingHoras ?? 0) - (a._agingHoras ?? 0))
    .slice(0, 8)
  for (const r of semEquipe) {
    itens.push({
      id: `se:${r.numos}`,
      titulo: `OS ${r.numos} — sem equipe atribuída`,
      motivo: `${Math.round(r._agingHoras ?? 0)}h sem equipe · ${r.nomedacidade ?? '?'}`,
      severidade: 'critico',
      fonte: 'Equipes',
      score: r._agingHoras ?? 0,
      row: r,
    })
  }

  // ── Equipes paradas: fila ≥3 e zero concluída hoje ──────────────────────
  const hoje = new Date()
  const hojeStr = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`
  const porEquipe = new Map<string, { fila: number; exec: number }>()
  for (const r of rows) {
    const eq = shortEquipe(r.nomedaequipe) || null
    if (!eq) continue
    if (!porEquipe.has(eq)) porEquipe.set(eq, { fila: 0, exec: 0 })
    const e = porEquipe.get(eq)!
    if (r.descsituacao === 'Pendente' || r.descsituacao === 'Atendimento') e.fila++
    if (r.descsituacao === 'Concluída' && (r.dataexecucao ?? '').startsWith(hojeStr)) e.exec++
  }
  for (const [eq, d] of porEquipe) {
    if (d.exec === 0 && d.fila >= 3) {
      itens.push({
        id: `eq:${eq}`,
        titulo: `${eq} — sem execução hoje`,
        motivo: `${d.fila} OS na fila, nenhuma concluída`,
        severidade: 'critico',
        fonte: 'Equipes',
        score: d.fila,
        linkTo: '/erp/produtividade',
      })
    }
  }

  // ── Clusters ativos por bairro ───────────────────────────────────────────
  for (const cl of derived.dashboard.pulso.clustersAtivos as { bairro: string; cidade: string; total: number }[]) {
    itens.push({
      id: `cl:${cl.bairro}|${cl.cidade}`,
      titulo: `Cluster em ${cl.bairro} — ${cl.cidade}`,
      motivo: `${cl.total} OS frescas (≤1 dia) no mesmo bairro`,
      severidade: 'atencao',
      fonte: 'Cidades',
      score: cl.total,
      linkTo: '/mapa',
    })
  }

  // ── Técnicos fora do SLA ─────────────────────────────────────────────────
  for (const e of derived.sla.semaforo as { nome: string; sla: number; total: number; criticas: number }[]) {
    if (e.sla >= 75) continue
    itens.push({
      id: `sla:${e.nome}`,
      titulo: `${shortEquipe(e.nome)} — SLA ${e.sla}%`,
      motivo: `${e.criticas} OS crítica${e.criticas !== 1 ? 's' : ''} de ${e.total} na fila`,
      severidade: e.sla < 50 ? 'critico' : 'atencao',
      fonte: 'SLA',
      score: 100 - e.sla,
      linkTo: '/erp/ranking',
    })
  }

  return itens.sort((a, b) => {
    if (a.severidade !== b.severidade) return a.severidade === 'critico' ? -1 : 1
    return b.score - a.score
  })
}

export default function CentralAcaoPage() {
  const { rows, isLoading, derived } = useOSDerived()
  const navigate = useNavigate()
  const [drawerOS, setDrawerOS] = useState<OSRow | null>(null)

  const agenda = useMemo(() => buildAgenda(rows, derived), [rows, derived])
  const visiveis = agenda.slice(0, LIMITE_ITENS)
  const truncado = agenda.length > LIMITE_ITENS

  const kpis = useMemo(() => ({
    criticos: agenda.filter(a => a.severidade === 'critico').length,
    atencao:  agenda.filter(a => a.severidade === 'atencao').length,
    fontes:   new Set(agenda.map(a => a.fonte)).size,
  }), [agenda])

  function handleClick(item: AcaoItem) {
    if (item.row) setDrawerOS(item.row)
    else if (item.linkTo) navigate(item.linkTo)
  }

  if (isLoading) {
    return <div className="p-6 text-muted text-label">Montando a agenda…</div>
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-bold text-text flex items-center gap-2">
          <ListTodo size={18} className="text-primary" /> Central de Ação
        </h1>
        <p className="text-label text-muted mt-0.5">
          O que precisa de atenção agora, em ordem — reúne Fila, Equipes, Cidades e SLA numa lista só
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard title="Críticos" value={kpis.criticos} tone="critical" icon={AlertTriangle} />
        <StatCard title="Atenção" value={kpis.atencao} tone="warning" icon={Flame} />
        <StatCard title="Fontes ativas" value={kpis.fontes} icon={ListTodo} />
      </div>

      {agenda.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-card p-12 text-center">
          <p className="text-body text-secondary">Nada precisa de atenção imediata agora 🎉</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden divide-y divide-white/[0.04]">
          {visiveis.map(item => {
            const Icon = FONTE_ICON[item.fonte] ?? AlertTriangle
            const clickable = !!(item.row || item.linkTo)
            return (
              <div key={item.id}
                   onClick={() => clickable && handleClick(item)}
                   className={`flex items-center gap-3 px-4 py-3 transition-colors ${clickable ? 'cursor-pointer hover:bg-surface/20' : ''}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  item.severidade === 'critico' ? 'bg-red/10' : 'bg-yellow/10'
                }`}>
                  <Icon size={13} className={item.severidade === 'critico' ? 'text-red' : 'text-yellow'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-text truncate">{item.titulo}</p>
                  <p className="text-caption text-muted truncate">{item.motivo}</p>
                </div>
                <Badge variant={item.severidade === 'critico' ? 'red' : 'yellow'} dot={false}>{item.fonte}</Badge>
                {clickable && <ChevronRight size={14} className="text-muted/40 flex-shrink-0" />}
              </div>
            )
          })}
        </div>
      )}

      {truncado && (
        <p className="text-caption text-muted text-center">
          Mostrando os {LIMITE_ITENS} itens mais urgentes de {agenda.length} no total.
        </p>
      )}

      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />
    </div>
  )
}
