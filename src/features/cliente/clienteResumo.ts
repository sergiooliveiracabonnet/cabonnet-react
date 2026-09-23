import type { OSRow } from '../../lib/types'
import type { ClienteContrato } from '../../lib/api'
import { enrichRows, isExecucaoReal, isFilaAtiva, isForaDeRevisita, isOSAdministrativa, parseDate } from '../../lib/transform'
import { shortEquipe } from '../../lib/osFormat'

const DIA_MS = 86_400_000
const JANELA_DIAS = 365
// Fidelidade terminando dentro deste prazo vira alerta: é a janela de retenção.
export const AVISO_FIDELIDADE_DIAS = 60

export interface ClienteVisita {
  numos:   string
  data:    Date
  servico: string
  equipe:  string
  tecnico: string
}

export interface ClienteAlerta {
  tom:   'critical' | 'warning' | 'info'
  texto: string
}

export interface ClienteLocalizacao {
  lat:   number
  lng:   number
  numos: string
  data:  Date
}

export interface ContratoFidelidade {
  contrato: string
  meses:    number
  fim:      Date
  vigente:  boolean
}

export interface ClienteResumo {
  tecnicas:          OSRow[]
  administrativas:   OSRow[]
  os12m:             number
  visitas12m:        number
  abertas:           OSRow[]
  ultimaVisita:      ClienteVisita | null
  /** Marca oficial do ERP (ordemservico.recorrencia), menos as OS que a operação
   *  não considera revisita (isForaDeRevisita) — o ERP marca algumas delas. */
  reincidencias12m:  number
  /** null quando a auditoria não respondeu: "sem dado" não é "zero". */
  reagendamentos12m: number | null
  intervaloMedianoDias: number | null
  inadimplencia12m:  number
  localizacao:       ClienteLocalizacao | null
  fidelidades:       ContratoFidelidade[]
  servicosFrequentes: { servico: string; n: number }[]
  equipes:           { equipe: string; n: number }[]
  porMes:            { mes: string; n: number }[]
  alertas:           ClienteAlerta[]
}

const dataExecucao = (r: OSRow) => parseDate(r.dataexecucao || r.databaixa)
const campo = (r: OSRow, k: string) => String((r as unknown as Record<string, unknown>)[k] ?? '')
const fmtDia = (d: Date) => d.toLocaleDateString('pt-BR')

function contar<T extends string>(valores: T[], limite: number) {
  const m = new Map<T, number>()
  for (const v of valores) if (v) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limite)
}

function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const meio = Math.floor(s.length / 2)
  return s.length % 2 ? s[meio] : Math.round((s[meio - 1] + s[meio]) / 2)
}

// Coordenada do app de campo no início da execução. Vem como texto e às vezes
// zerada; fora da faixa do estado de SP é descartada.
function coordenada(r: OSRow): { lat: number; lng: number } | null {
  const lat = Number(campo(r, 'latitude').replace(',', '.'))
  const lng = Number(campo(r, 'longitude').replace(',', '.'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -26 || lat > -19 || lng < -54 || lng > -44) return null
  return { lat, lng }
}

export function fidelidadeDoContrato(c: ClienteContrato, hoje: Date): ContratoFidelidade | null {
  const meses = c.plano?.fidelidade_meses
  const inicio = parseDate(c.datainstalacao) ?? parseDate(c.datavenda)
  if (!meses || !inicio || c.situacao !== 2) return null
  const fim = new Date(inicio.getFullYear(), inicio.getMonth() + meses, inicio.getDate())
  return { contrato: c.contrato, meses, fim, vigente: fim >= hoje }
}

export function isReincidencia(r: OSRow): boolean {
  return campo(r, 'recorrencia') === '1' && !isForaDeRevisita(r)
}

const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function buildClienteResumo(
  ordens: Record<string, string>[],
  contratos: ClienteContrato[],
  hoje: Date = new Date(),
  auditoriaOk = true,
): ClienteResumo {
  const rows = enrichRows(ordens as unknown as OSRow[])
  const tecnicas        = rows.filter(r => !isOSAdministrativa(r))
  const administrativas = rows.filter(r =>  isOSAdministrativa(r))
  const corte = new Date(hoje.getTime() - JANELA_DIAS * DIA_MS)
  const naJanela = (d: Date | null) => !!d && d >= corte && d <= hoje
  const tecnicas12m = tecnicas.filter(r => naJanela(parseDate(r.datacadastro)))

  const executadas = tecnicas
    .filter(r => isExecucaoReal(r.descsituacao))
    .map(r => ({ r, data: dataExecucao(r) }))
    .filter((v): v is { r: OSRow; data: Date } => v.data != null)
    .sort((a, b) => a.data.getTime() - b.data.getTime())
  const visitas: ClienteVisita[] = executadas.map(({ r, data }) => ({
    numos: r.numos, data, servico: r.servico ?? '',
    equipe: shortEquipe((r.equipeexecutou as string | undefined) || r.nomedaequipe),
    tecnico: campo(r, 'nomeexecutante'),
  }))
  const intervalos = visitas.slice(1).map((v, i) => Math.round((v.data.getTime() - visitas[i].data.getTime()) / DIA_MS))

  const localizacao = [...executadas].reverse()
    .map(({ r, data }) => ({ c: coordenada(r), numos: r.numos, data }))
    .find(x => x.c != null)
  const diasAberta = (r: OSRow) => {
    const d = parseDate(r.datacadastro)
    return d ? Math.max(0, Math.floor((hoje.getTime() - d.getTime()) / DIA_MS)) : 0
  }
  const abertas = tecnicas
    .filter(r => isFilaAtiva(r.descsituacao))
    .sort((a, b) => diasAberta(b) - diasAberta(a))

  const reincidencias12m = tecnicas12m.filter(isReincidencia).length
  const reagendamentos12m = auditoriaOk
    ? tecnicas12m.reduce((n, r) => n + (Number(campo(r, 'reagendamentos')) || 0), 0)
    : null
  const inadimplencia12m = administrativas
    .filter(r => /INADIMPL/i.test(r.servico ?? '') && naJanela(parseDate(r.datacadastro))).length
  const fidelidades = contratos
    .map(c => fidelidadeDoContrato(c, hoje))
    .filter((f): f is ContratoFidelidade => f != null)

  const porMes = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1)
    return { chave: `${d.getFullYear()}-${d.getMonth()}`, mes: `${MES_ABREV[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, n: 0 }
  })
  for (const r of tecnicas) {
    const d = parseDate(r.datacadastro)
    const slot = d && porMes.find(p => p.chave === `${d.getFullYear()}-${d.getMonth()}`)
    if (slot) slot.n++
  }

  const alertas: ClienteAlerta[] = []
  if (reincidencias12m >= 2) alertas.push({ tom: 'critical', texto: `${reincidencias12m} reincidências no último ano` })
  else if (reincidencias12m === 1) alertas.push({ tom: 'warning', texto: '1 reincidência no último ano' })
  for (const os of abertas) {
    const dias = diasAberta(os)
    const reag = Number(campo(os, 'reagendamentos')) || 0
    if (dias >= 3 || reag >= 2) {
      const partes = [dias >= 3 && `aberta há ${dias} dias`, reag >= 2 && `reagendada ${reag} vezes`].filter(Boolean)
      alertas.push({ tom: 'warning', texto: `OS ${os.numos} ${partes.join(', ')}` })
    }
  }
  if (inadimplencia12m > 0) {
    alertas.push({ tom: inadimplencia12m >= 3 ? 'warning' : 'info',
      texto: `${inadimplencia12m} ${inadimplencia12m === 1 ? 'evento' : 'eventos'} de inadimplência em 12 meses` })
  }
  for (const c of contratos) {
    if (c.situacao === 3 || c.situacao === 4) alertas.push({ tom: 'warning', texto: `Contrato ${c.contrato} ${c.situacao === 3 ? 'suspenso' : 'bloqueado'}` })
  }
  for (const f of fidelidades) {
    const dias = Math.ceil((f.fim.getTime() - hoje.getTime()) / DIA_MS)
    if (dias >= 0 && dias <= AVISO_FIDELIDADE_DIAS) {
      alertas.push({ tom: 'info', texto: `Fidelidade do contrato ${f.contrato} termina em ${fmtDia(f.fim)}` })
    }
  }
  if (contratos.length > 0 && contratos.every(c => c.situacao === 5)) alertas.push({ tom: 'info', texto: 'Todos os contratos estão cancelados' })

  return {
    tecnicas, administrativas, abertas, reincidencias12m, reagendamentos12m, inadimplencia12m, alertas, fidelidades,
    ultimaVisita: visitas.at(-1) ?? null,
    localizacao:  localizacao?.c ? { ...localizacao.c, numos: localizacao.numos, data: localizacao.data } : null,
    os12m:      tecnicas12m.length,
    visitas12m: visitas.filter(v => naJanela(v.data)).length,
    intervaloMedianoDias: mediana(intervalos),
    servicosFrequentes: contar(tecnicas.map(r => r.servico ?? ''), 5).map(([servico, n]) => ({ servico, n })),
    equipes:            contar(visitas.map(v => v.equipe), 5).map(([equipe, n]) => ({ equipe, n })),
    porMes:             porMes.map(({ mes, n }) => ({ mes, n })),
  }
}
