import { useEffect, useRef } from 'react'
import { useTelegramStore } from '../store/telegramStore'
import { telegram } from '../lib/api'
import { shortEquipe } from '../lib/osFormat'
import { isCOPE, isReagend } from '../lib/transform'
import type { OSRow } from '../lib/types'
import {
  tgCriticas, tgEquipes, tgSLA, tgPulso,
  tgExecutadas, tgEquipeInativa, tgFilaResidual,
} from '../lib/tgTemplates'

const EXP_INICIO = 8
const EXP_FIM    = 18

function hojeStr(): string {
  const n = new Date()
  return `${String(n.getDate()).padStart(2,'0')}/${String(n.getMonth()+1).padStart(2,'0')}/${n.getFullYear()}`
}

function isHoje(r: OSRow): boolean {
  const s = hojeStr()
  return ((r.dataexecucao ?? r.dataagendamento ?? '') as string).startsWith(s)
}

function msAte(h: number, m = 0): number {
  const agora = new Date()
  const alvo  = new Date(agora)
  alvo.setHours(h, m, 0, 0)
  if (alvo <= agora) alvo.setDate(alvo.getDate() + 1)
  return alvo.getTime() - agora.getTime()
}

function msProximaHora(): number {
  const agora = new Date()
  const prox  = new Date(agora)
  prox.setMinutes(0, 0, 0)
  prox.setHours(prox.getHours() + 1)
  return prox.getTime() - agora.getTime()
}

export function useAlertasEngine(allRows: OSRow[] | null | undefined, _rows: OSRow[] | null | undefined) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = useTelegramStore() as any

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  function clearAllTimers() {
    timers.current.forEach(id => clearTimeout(id))
    timers.current = []
  }

  function addTimer(id: ReturnType<typeof setTimeout>) { timers.current.push(id) }

  async function enviarTelegram(texto: string) {
    try { await telegram.send(texto, 'alertas') } catch { /* best-effort */ }
  }

  function verificar() {
    if (!allRows?.length) return
    const hora = new Date().getHours()
    if (hora < EXP_INICIO || hora >= EXP_FIM) return

    const base  = allRows.filter(r => !isCOPE(r) && !isReagend(r) && r._tipo !== 'REDE')
    const novos: { tipo: string; ref: string; nivel: string; titulo: string; msg: string; icon: string }[] = []

    // Alerta 1: Equipe sem execução com fila ≥ 3
    const byEq: Record<string, { exec: number; fila: number }> = {}
    base.forEach(r => {
      const eq = shortEquipe(r.nomedaequipe as string) || '(sem equipe)'
      if (!byEq[eq]) byEq[eq] = { exec: 0, fila: 0 }
      if (r.descsituacao === 'Concluída' && isHoje(r)) byEq[eq].exec++
      if (['Atendimento','Pendente'].includes(r.descsituacao as string)) byEq[eq].fila++
    })
    Object.entries(byEq).forEach(([eq, d]) => {
      if (d.exec === 0 && d.fila >= 3 && !store.jaEmitido('equipe_parada', eq)) {
        novos.push({ tipo: 'equipe_parada', ref: eq, nivel: 'critico', titulo: `Equipe ${eq} sem execução`, msg: `${d.fila} OS na fila, nenhuma concluída hoje`, icon: 'alert-triangle' })
      }
    })

    // Alerta 2: OS em crise de SLA
    const ativas   = base.filter(r => ['Atendimento','Pendente'].includes(r.descsituacao as string))
    const criticas = ativas.filter(r => r._slaCritico || r._slaExcedido)
    if (criticas.length > 0 && !store.jaEmitido('sla_crise', String(criticas.length))) {
      novos.push({ tipo: 'sla_crise', ref: String(criticas.length), nivel: 'critico', titulo: `${criticas.length} OS com SLA vencido`, msg: criticas.slice(0,3).map(r => r.numos).join(', ') + (criticas.length > 3 ? ` +${criticas.length-3}` : ''), icon: 'alert-circle' })
    }

    // Alerta 3: Fila acima do threshold
    const filaTotal = ativas.length
    if (filaTotal > store.filaThreshold && !store.jaEmitido('fila_alta', String(filaTotal))) {
      novos.push({ tipo: 'fila_alta', ref: String(filaTotal), nivel: 'atencao', titulo: `Fila alta: ${filaTotal} OS`, msg: `Acima do limite de ${store.filaThreshold} OS configurado`, icon: 'trending-up' })
    }

    // Alerta 4: Cluster de manutenções por cidade
    const manutHoje = base.filter(r => ['Atendimento','Pendente'].includes(r.descsituacao as string) && ((r.tiposervico ?? '') as string).toUpperCase().includes('MANUTENCAO') && r._agingAbertura === 0)
    const byCidade: Record<string, number> = {}
    manutHoje.forEach(r => { const c = ((r.nomedacidade ?? '') as string).trim(); if (!c) return; byCidade[c] = (byCidade[c] ?? 0) + 1 })
    Object.entries(byCidade).forEach(([cidade, total]) => {
      if (total >= 3 && !store.jaEmitido('falha_cidade', cidade)) {
        novos.push({ tipo: 'falha_cidade', ref: cidade, nivel: 'atencao', titulo: `Cluster de falhas: ${cidade}`, msg: `${total} OS de manutenção abertas hoje`, icon: 'map-pin' })
      }
    })

    // Alerta 5b: OS sem equipe há mais de 4 horas
    const semEquipe4h = ativas.filter(r =>
      !(r.nomedaequipe as string | undefined)?.trim() &&
      r._agingHoras != null &&
      (r._agingHoras as number) > 4
    )
    if (semEquipe4h.length > 0 && !store.jaEmitido('sem_equipe_4h', String(semEquipe4h.length))) {
      novos.push({
        tipo:   'sem_equipe_4h',
        ref:    String(semEquipe4h.length),
        nivel:  'critico',
        titulo: `${semEquipe4h.length} OS sem equipe há mais de 4h`,
        msg:    semEquipe4h.slice(0, 3).map((r: OSRow) =>
          `${r.numos} (${Math.round((r._agingHoras as number) ?? 0)}h · ${r.nomedacidade ?? '?'})`
        ).join(', ') + (semEquipe4h.length > 3 ? ` +${semEquipe4h.length - 3}` : ''),
        icon:   'users',
      })
    }

    // Alerta 5: OS individuais com SLA vencido
    if (store.alertaAging) {
      const enviados = store.getAgingEnviados() as Set<string>
      const ativas5  = base.filter(r => ['Atendimento','Pendente'].includes(r.descsituacao as string) && (r._slaCritico || r._slaExcedido))
      let count = 0
      for (const r of ativas5) {
        if (count >= 3) break
        if (enviados.has(String(r.numos))) continue
        enviados.add(String(r.numos))
        count++
        const aging  = (r._agingAbertura as number) ?? 0
        const equipe = shortEquipe(r.nomedaequipe as string) ?? 'sem equipe'
        novos.push({ tipo: 'aging_os', ref: String(r.numos), nivel: 'critico', titulo: `OS ${r.numos} — SLA vencido (${aging}d)`, msg: `${r.nomecliente ?? '?'} · ${r.nomedacidade ?? '?'} · ${equipe}`, icon: 'clock' })
      }
      store.saveAgingEnviados(enviados)
    }

    novos.forEach(a => {
      store.addAlert(a)
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        try { new Notification(`Cabonnet — ${a.titulo}`, { body: a.msg, tag: a.tipo + '_' + a.ref }) } catch { /* permission denied */ }
      }
      if (store.enabled && store.deveEnviarTelegram(a.nivel)) {
        const txt = a.tipo === 'sla_crise'     ? tgCriticas(base)
                  : a.tipo === 'equipe_parada' ? tgEquipes(base)
                  : a.tipo === 'fila_alta'     ? tgSLA(base)
                  : a.tipo === 'falha_cidade'  ? tgEquipes(base)
                  : tgCriticas(base)
        enviarTelegram(txt)
      }
    })
  }

  const semRede = allRows?.filter(r => r._tipo !== 'REDE') ?? []

  function agendarExecutadas() {
    const ms = msProximaHora()
    addTimer(setTimeout(() => {
      const h = new Date().getHours()
      if (h >= EXP_INICIO && h < EXP_FIM && store.enabled && semRede.length) {
        enviarTelegram(tgExecutadas(semRede))
      }
      agendarExecutadas()
    }, ms))
  }

  function agendarPulso() {
    addTimer(setTimeout(() => {
      const h = new Date().getHours()
      if (h >= EXP_INICIO && h < EXP_FIM && store.enabled && semRede.length) {
        enviarTelegram(tgPulso(semRede))
      }
      addTimer(setInterval(() => {
        const h2 = new Date().getHours()
        if (h2 >= EXP_INICIO && h2 < EXP_FIM && store.enabled && semRede.length) {
          enviarTelegram(tgPulso(semRede))
        }
      }, 30 * 60 * 1000))
    }, msAte(EXP_INICIO, 30)))
  }

  function agendarEquipeInativa() {
    addTimer(setInterval(() => {
      const h = new Date().getHours()
      if (h >= EXP_INICIO && h < EXP_FIM && store.enabled && semRede.length) {
        enviarTelegram(tgEquipeInativa(semRede))
      }
    }, 75 * 60 * 1000))
  }

  function agendarFilaResidual() {
    addTimer(setTimeout(() => {
      if (store.enabled && semRede.length) enviarTelegram(tgFilaResidual(semRede))
    }, msAte(16, 30)))
  }

  useEffect(() => {
    if (!store.ativo) { clearAllTimers(); return }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    telegram.status()
      .then((d: unknown) => store.setEnabled((d as { enabled?: boolean })?.enabled === true))
      .catch(() => store.setEnabled(false))

    verificar()
    const poll = setInterval(verificar, store.pollMin * 60 * 1000)

    agendarExecutadas()
    agendarPulso()
    agendarEquipeInativa()
    agendarFilaResidual()

    return () => {
      clearInterval(poll)
      clearAllTimers()
    }
  }, [store.ativo, allRows]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    verificarAgora:   verificar,
    enviarSLA:        () => semRede.length && enviarTelegram(tgSLA(semRede)),
    enviarEquipes:    () => semRede.length && enviarTelegram(tgEquipes(semRede)),
    enviarCriticas:   () => semRede.length && enviarTelegram(tgCriticas(semRede)),
    enviarPulso:      () => semRede.length && enviarTelegram(tgPulso(semRede)),
    enviarExecutadas: () => semRede.length && enviarTelegram(tgExecutadas(semRede)),
  }
}
