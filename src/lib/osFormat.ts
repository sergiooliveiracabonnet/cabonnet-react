// Formatters e constantes compartilhados por OSDrawer, OSDetailModal e transform
import type { Categoria, Fornecedor, OSRow } from './types'

export const EQUIPE_NAMES: Record<string, string> = {
  'INST F01':  'INST F01 - FELIPE',
  'INST F04':  'INST F04 - THIAGO',
  'INST F05':  'INST F05 - JADIEL',
  'INST F07':  'INST F07 - JHONATA',
  'INST F08':  'INST F08 - ELCIO',
  'INST F11':  'INST F11 - ADANS',
  'INST F12':  'INST F12 - CLAUDIO',
  'INST F13':  'INST F13 - KAIQUE',
  'INST F14':  'INST F14 - JOÃO',
  'INST F20':  'INST F20 - LUCAS',
  'INST F36':  'INST F36 - MAYKON',
  'INST F39':  'INST F39 - RODRIGO',
  'INST F44':  'INST F44 - WILLIAM',
  'INST F45':  'INST F45 - DIMAS',
  'INST F46':  'INST F46 - VANDERLEI',
  'INST F47':  'INST F47 - JEAN',
  'INST F48':  'INST F48 - MATHEUS',
  'INST F49':  'INST F49 - BRUNO',
  'INST F23':  'INST F23 - ANDERSON',
  'INST F27':  'INST F27 - CELSO',
  'MANUT F02': 'MANUT F02 - CLÁUDIO',
  'MANUT F04': 'MANUT F04 - THAÍS',
  'MANUT F77': 'MANUT F77 - SERGIO',
  'REDE F01':  'REDE F01 - LUCIANO',
  'REDE F04':  'REDE F04 - SIDNEI',
  'REDE F06':  'REDE F06 - JULIO',
  'REDE F07':  'REDE F07 - CARLOS',
  'REDE F08':  'REDE F08 - LEONARDO',
  'REDE F09':  'REDE F09 - JEFFERSON',
  'REDE F10':  'REDE F10 - VINÍCIUS',
  'INST F50':  'INST F50 - HIGOR',
}

export function shortEquipe(nome: string | null | undefined): string {
  if (!nome) return '—'
  // Strip "03- VAL -" prefix (variações com/sem espaços e hifens)
  const s = nome.replace(/^0*3[\s-]*VAL\s*[-–]\s*/i, '').trim()
  const u = s.toUpperCase()

  let code: string
  let liveLeader: string | null = null

  if (/^MANUTENC/i.test(u)) {
    const m = s.match(/\b([A-Z]?\d+)\b/i)
    if (!m) { code = 'MANUT' }
    else {
      const c = m[1].toUpperCase()
      code = /^M/.test(c) ? c : `MANUT ${c}`
    }
    const lm = s.match(/\b[A-Z]?\d+\b\s+([A-Za-zÀ-ÿ]+)/i)
    if (lm) liveLeader = lm[1].toUpperCase()
  } else if (/^INSTALAC/i.test(u)) {
    const m = s.match(/\b(F\d+)\b/i)
    code = m ? `INST ${m[1].toUpperCase()}` : 'INST'
    const lm = s.match(/\b(F\d+)\b\s+([A-Za-zÀ-ÿ]+)/i)
    if (lm) liveLeader = lm[2].toUpperCase()
  } else if (/^REDE\b/i.test(u)) {
    const rest = s.replace(/^REDE\s*/i, '').trim()
    code = rest ? `REDE ${rest.slice(0, 8).trim()}` : 'REDE'
  } else if (/^COPE/i.test(u)) {
    code = 'COPE'
  } else if (/^[A-Z]\d+$/i.test(s.trim())) {
    code = s.trim().toUpperCase()
  } else {
    code = s.slice(0, 15).trim()
  }

  if (liveLeader && code) return `${code} - ${liveLeader}`
  return EQUIPE_NAMES[code] ?? code
}

export function fmtDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
    .replace('T', ' ')
    .replace(/Z$/, '')
    .replace(/[+-]\d{2}:\d{2}$/, '')
  const datePart = s.split(' ')[0]
  const timePart = s.split(' ')[1]
  let day: string, month: string, year: string
  if (datePart.includes('/')) {
    [day, month, year] = datePart.split('/')
  } else if (datePart.includes('-')) {
    [year, month, day] = datePart.split('-')
  } else return raw
  const time = timePart ? timePart.slice(0, 5) : null
  return time ? `${day}/${month}/${year} ${time}` : `${day}/${month}/${year}`
}

export type SituacaoVariant = 'green' | 'red' | 'cyan' | 'orange' | 'yellow' | 'secondary'

export function situacaoVariant(s = ''): SituacaoVariant {
  const sl = s.toLowerCase()
  if (sl.includes('conclu'))  return 'green'
  if (sl.includes('cancel'))  return 'red'
  if (sl.includes('atend'))   return 'cyan'
  if (sl.includes('reagend')) return 'orange'
  if (sl.includes('pendent')) return 'yellow'
  return 'secondary'
}

export function calcDuracao(raw1: string | null | undefined, raw2: string | null | undefined): string | null {
  if (!raw1 || !raw2) return null
  const parse = (raw: string): Date | null => {
    const s = raw.trim().replace('T', ' ').replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '')
    const [datePart, timePart] = s.split(' ')
    let day: string, month: string, year: string
    if (datePart.includes('/'))      [day, month, year] = datePart.split('/')
    else if (datePart.includes('-')) [year, month, day] = datePart.split('-')
    else return null
    return new Date(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${timePart || '00:00:00'}`)
  }
  const d1 = parse(raw1), d2 = parse(raw2)
  if (!d1 || !d2 || isNaN(d1.getTime()) || isNaN(d2.getTime())) return null
  const mins = Math.round(Math.abs(d2.getTime() - d1.getTime()) / 60000)
  if (mins < 1) return null
  const h = Math.floor(mins / 60), m = mins % 60
  return h === 0 ? `${m}min` : m > 0 ? `${h}h ${m}min` : `${h}h`
}

export function fmtHorasMin(absHoras: number): string {
  const mins = Math.round(Math.abs(absHoras) * 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h === 0 ? `${m}min` : m > 0 ? `${h}h ${m}min` : `${h}h`
}

export interface OSHistoricoEntry {
  autor?:     string | null
  data?:      string | null
  hora?:      string | null
  texto?:     string | null
  isReagend?: boolean
}

// Resumo da OS para colar no WhatsApp (mesmo formato do botão do OSDrawer).
// Quando `historico` é informado, anexa a linha do tempo de ocorrências/reagendamentos.
export function buildOSWhatsApp(os: OSRow, historico?: OSHistoricoEntry[]): string {
  const sit    = os._situacaoEfetiva ?? os.descsituacao ?? '—'
  const equipe = shortEquipe(os.nomedaequipe) || '—'
  const aging  = os._aging != null ? `${os._aging}d` : '—'
  const agend  = os.dataagendamento ? os.dataagendamento.slice(0, 10) : 'Não agendado'
  const loc    = [os.nomedacidade, os.bairro].filter(Boolean).join(' · ') || '—'
  const end    = [os.logradouro || os.enderecoconexao, os.numero, os.complemento].filter(Boolean).join(', ') || '—'
  const lines  = [
    `📋 *OS ${os.numos}* — ${sit}`,
    `👤 ${os.nomecliente || '—'}`,
    `📍 ${loc}`,
    `🏠 ${end}`,
    `🔧 ${os.tiposervico || '—'} · ${os.servico || '—'}`,
    `👷 ${equipe}`,
    `⏱ Aging: ${aging}`,
    `📅 Agend: ${agend}`,
  ]

  if (historico && historico.length) {
    lines.push('', '🕓 *Histórico:*')
    for (const e of historico) {
      const meta = [e.autor, [e.data, e.hora].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
      lines.push(`${e.isReagend ? '🔄' : '•'} ${meta || '—'}`)
      if (e.texto) lines.push(`   ${e.texto.trim().replace(/\n+/g, ' ')}`)
    }
  }

  return lines.join('\n')
}

// Tipo de OS (instalação/manutenção/serviço/rede) — usa _categoria (calculado em enrichRows)
export const CATEGORIA_LABEL: Record<Categoria, string> = {
  INSTALACAO:    'Instalação',
  VT_MANUTENCAO: 'Manutenção',
  SERVICO:       'Serviço',
  REDE:          'Rede',
}

export const CATEGORIA_COLOR: Record<Categoria, string> = {
  INSTALACAO:    '#3b82f6',
  VT_MANUTENCAO: '#fb923c',
  SERVICO:       '#c4b5fd',
  REDE:          '#71717a',
}

export const FORN_LABEL: Record<Fornecedor, string> = {
  WES:        'WES',
  Instacable: 'Instacable',
  THM:        'THM',
  REDE:       'Rede',
  MANUTENCAO: 'Manutenção',
  INSTALACAO: 'Instalação',
  INTERNO:    'COPE Interno',
  OUTRO:      '—',
}
