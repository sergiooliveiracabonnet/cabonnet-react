import { useState, useMemo, useEffect } from 'react'
import { useOSDerived } from '../contexts/OSDataContext'
import { isReagend, getReagendTipo, isCOPE } from '../lib/transform'
import type { OSRow, OrdensOptions } from '../lib/types'

// buildOrdens() exclui OS da COPE da lista base (mesma lógica do Reagendamento).
// Quando o usuário filtra por status "Pendente", precisamos reincorporá-las —
// COPE parada em roteirização é _situacaoEfetiva === 'Pendente' (ver transform.ts),
// mas nunca aparece porque foi removida de `ordens` antes do filtro de status rodar.
export function withCopeQuandoPendente(ordens: OSRow[], allRows: OSRow[], status: string): OSRow[] {
  if (status !== 'Pendente') return ordens
  return [...ordens, ...allRows.filter(r => isCOPE(r))]
}

function parseAgend(str: string | null | undefined): Date | null {
  if (!str) return null
  const s = str.trim().split(' ')[0]
  if (s.includes('/')) {
    const [d, m, y] = s.split('/')
    if (!d || !m || !y) return null
    return new Date(Number(y), Number(m) - 1, Number(d))
  }
  const dt = new Date(s)
  return isNaN(dt.getTime()) ? null : dt
}

/** Data no formato do ERP (DD/MM/YYYY) — comparar com ISO nunca casava e o
 *  KPI "Agend. hoje" ficava permanentemente em zero. */
export function dataBR(d: Date = new Date()): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function isAgendadaEm(r: OSRow, diaBR: string): boolean {
  return ((r.dataagendamento as string) || '').split(' ')[0] === diaBR
}

function normalizeSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}

export function matchesOSSearch(row: OSRow, query: string): boolean {
  const q = normalizeSearch(query)
  if (!q) return true
  const searchable = [
    row.nomecliente, row.numos, row.nomedacidade, row.bairro,
    row.logradouro, row.numero, row.nomedaequipe, row.tiposervico,
    row.codigocontrato, row.numcontrato, row.cpf, row.cpfcliente,
    row.cpf_cliente, row.nometecnico, row.nomeTecnico, row.tecnico,
    row.codigocliente,
  ]
  return searchable.some(value => normalizeSearch(value).includes(q))
}

// Agenda futura = OS ATIVAS com agendamento à frente de hoje. Sem o filtro de
// situação, COPE, reagendamentos e até concluídas adiantadas inflavam os KPIs
// (mesma correção da aba Cidades).
//
// Os dois baldes são DISJUNTOS: antes "futuro" significava "amanhã em diante" e
// portanto continha "amanhã" — dois cards lado a lado onde um era subconjunto
// do outro e cuja soma não fechava.
export function splitAgendaFutura(allRows: OSRow[]): { amanhaOrdens: OSRow[]; posAmanhaOrdens: OSRow[] } {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1)
  const posAmanha = new Date(hoje); posAmanha.setDate(hoje.getDate() + 2)
  const amanhaOrdens: OSRow[] = [], posAmanhaOrdens: OSRow[] = []
  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r)) continue
    if (!['Pendente', 'Atendimento'].includes(r.descsituacao)) continue
    const raw = ((r.dataagendamento as string) || '').split(' ')[0]
    if (!raw) continue
    const parts = raw.split('/')
    if (parts.length !== 3) continue
    const d = new Date(+parts[2], +parts[1] - 1, +parts[0])
    if (d >= posAmanha) {
      posAmanhaOrdens.push(r)
    } else if (d >= amanha) {
      amanhaOrdens.push(r)
    }
  }
  return { amanhaOrdens, posAmanhaOrdens }
}

export interface OrdensFiltros {
  search:      string
  status:      string
  reagendTipo: string
  tipo:        string
  cidade:      string
  bairro:      string
  equipe:      string
  fornecedor:  string
  tipoOs:      string
  periodo:     string
  aging:       string
  semEquipe:   boolean
  critico:     boolean
  agendHoje:   boolean
}

export function matchesAgingFaixa(aging: number, faixa: string): boolean {
  if (faixa === '1')  return aging <= 1
  if (faixa === '2')  return aging <= 2
  if (faixa === '3')  return aging >= 3 && aging <= 5
  if (faixa === '6')  return aging >= 6
  if (faixa === '11') return aging >= 11
  return true
}

// Função pura para que os KPIs possam contar exatamente o mesmo recorte que a
// tabela mostra. Enquanto esta cadeia viveu dentro do useMemo, os cards de
// agenda foram escritos sobre allRows e passaram a ignorar todos os filtros.
export function aplicarFiltros(rows: OSRow[], f: OrdensFiltros, hoje: string = dataBR()): OSRow[] {
  let r = rows
  if (f.search)      r = r.filter(x => matchesOSSearch(x, f.search))
  if (f.status)      r = r.filter(x => x._situacaoEfetiva === f.status)
  if (f.reagendTipo) r = r.filter(x => getReagendTipo(x) === f.reagendTipo)
  if (f.tipo)        r = r.filter(x => x.tiposervico === f.tipo)
  if (f.cidade)      r = r.filter(x => x.nomedacidade === f.cidade)
  if (f.bairro)      r = r.filter(x => x.bairro === f.bairro)
  if (f.equipe)      r = r.filter(x => x.nomedaequipe === f.equipe)
  if (f.fornecedor)  r = r.filter(x => x._fornecedor === f.fornecedor)
  if (f.tipoOs)      r = r.filter(x => x._tipo === f.tipoOs)
  if (f.periodo)     r = r.filter(x => ((x.periodo as string) || '').trim().toLowerCase() === f.periodo.toLowerCase())
  if (f.semEquipe)   r = r.filter(x => !x.nomedaequipe)
  if (f.critico)     r = r.filter(x => x._slaCritico)
  if (f.agendHoje)   r = r.filter(x => isAgendadaEm(x, hoje))
  if (f.aging)       r = r.filter(x => matchesAgingFaixa(x._aging ?? x._agingAbertura ?? 0, f.aging))
  return r
}

export type AgendaFoco = 'hoje' | 'amanha' | 'posAmanha' | null

// Os três recortes de agenda definem qual base temporal está sendo olhada, então
// são mutuamente exclusivos entre si. Clicar no que já está ativo desliga.
export function proximoAgendaFoco(atual: AgendaFoco, clicado: Exclude<AgendaFoco, null>): AgendaFoco {
  return clicado === atual ? null : clicado
}

export function useOrdens() {
  const { derived: { ordens: ordensData }, allRows, isLoading, error } = useOSDerived()

  const [search,      setSearch]      = useState('')
  const [status,      setStatus]      = useState('')
  const [reagendTipo, setReagendTipo] = useState('')
  const [tipo,        setTipo]        = useState('')
  const [cidade,      setCidade]      = useState('')
  const [bairro,      setBairro]      = useState('')
  const [equipe,      setEquipe]      = useState('')
  const [aging,       setAging]       = useState('')
  const [critico,     setCritico]     = useState(false)
  const [fornecedor,  setFornecedor]  = useState('')
  const [tipoOs,      setTipoOs]      = useState('')
  const [periodo,     setPeriodo]     = useState('')
  const [semEquipe,   setSemEquipe]   = useState(false)
  const [agendHoje,   setAgendHoje]   = useState(false)
  const [agendAmanha, setAgendAmanha] = useState(false)
  const [agendFuturo, setAgendFuturo] = useState(false)
  const [tableSort,   setTableSort]   = useState<{ key: string | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' })
  const [density,     setDensity]     = useState('normal')
  const [page,        setPage]        = useState(1)
  const [pageSize,    setPageSize]    = useState(50)

  const agendaFoco: AgendaFoco = agendHoje ? 'hoje' : agendAmanha ? 'amanha' : agendFuturo ? 'posAmanha' : null

  // Troca o recorte temporal sem tocar nos filtros dimensionais: clicar em
  // "Amanhã" com Taubaté selecionado deve mostrar "amanhã EM Taubaté".
  const setAgendaFoco = (clicado: Exclude<AgendaFoco, null>) => {
    const alvo = proximoAgendaFoco(agendaFoco, clicado)
    setAgendHoje(alvo === 'hoje')
    setAgendAmanha(alvo === 'amanha')
    setAgendFuturo(alvo === 'posAmanha')
  }

  const toggleTableSort = (key: string) => {
    setPage(1)
    setTableSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  }

  const { ordens, options } = ordensData as { ordens: OSRow[]; options: OrdensOptions }

  const { amanhaOrdens, posAmanhaOrdens } = useMemo(() => splitAgendaFutura(allRows), [allRows])

  // Reagendamentos são excluídos do `ordens` base (buildOrdens), então o filtro de
  // Reagendamento usa a lista ao-vivo (allRows), espelhando os KPIs do Dashboard.
  const reagendOrdens = useMemo(() => allRows.filter(r => isReagend(r)), [allRows])
  const verReagend = status === 'Reagendamento' || !!reagendTipo

  // Mesma lógica: COPE também é excluída de `ordens`, então o filtro "Pendente"
  // precisa reincorporá-la — senão fica vazio mesmo com OS aguardando roteirização.
  const ordensComCope = useMemo(() => withCopeQuandoPendente(ordens, allRows, status), [ordens, allRows, status])

  const baseOrdens: OSRow[] = agendAmanha
    ? amanhaOrdens
    : agendFuturo
      ? posAmanhaOrdens
      : verReagend
        ? reagendOrdens
        : ordensComCope

  const filtros: OrdensFiltros = useMemo(() => ({
    search, status, reagendTipo, tipo, cidade, bairro, equipe,
    fornecedor, tipoOs, periodo, aging, semEquipe, critico, agendHoje,
  }), [search, status, reagendTipo, tipo, cidade, bairro, equipe,
       fornecedor, tipoOs, periodo, aging, semEquipe, critico, agendHoje])

  const filtered = useMemo(() => {
    let r = aplicarFiltros(baseOrdens, filtros)

    // Ordem base sempre por agendamento. O sort por coluna abaixo aplica em
    // cima disto e, como Array.sort é estável, o agendamento continua sendo o
    // critério de desempate dentro de valores iguais.
    r = [...r].sort((a, b) => {
      const da = parseAgend(a.dataagendamento as string)
      const db = parseAgend(b.dataagendamento as string)
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return da.getTime() - db.getTime()
    })

    // Sort por coluna sobre o CONJUNTO filtrado — dentro do DataTable ordenaria
    // só a página de 50: "ordenar por Risco" não traria as piores do conjunto.
    if (tableSort.key) {
      const k = tableSort.key
      const val = (x: OSRow): number | string => {
        if (k === '_aging')          return (x._aging ?? x._agingAbertura ?? -1)
        if (k === 'dataagendamento') return parseAgend(x.dataagendamento as string)?.getTime() ?? Number.MAX_SAFE_INTEGER
        const v = x[k]
        return typeof v === 'number' ? v : String(v ?? '')
      }
      r = [...r].sort((a, b) => {
        const av = val(a), bv = val(b)
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true })
        return tableSort.dir === 'asc' ? cmp : -cmp
      })
    }

    return r
  }, [baseOrdens, filtros, tableSort])

  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize)
  const totalPages = Math.ceil(filtered.length / pageSize)

  useEffect(() => {
    setPage(1)
  }, [search, status, reagendTipo, tipo, cidade, bairro, equipe, aging, critico,
      fornecedor, tipoOs, periodo, semEquipe, agendHoje, agendAmanha, agendFuturo])

  useEffect(() => {
    setPage(current => Math.min(current, Math.max(1, totalPages)))
  }, [totalPages])

  const kpis = useMemo(() => {
    const hojeBR = dataBR()
    let criticas = 0, semEquipeCount = 0, agendHojeCount = 0, instalacao = 0, manutencao = 0, servico = 0
    for (const r of filtered) {
      // Mesma régua do resto do sistema (e do deep-link do Dashboard): > 2× o SLA
      if (r._slaCritico) criticas++
      if (!r.nomedaequipe) semEquipeCount++
      if (isAgendadaEm(r, hojeBR)) agendHojeCount++
      if (r._tipo === 'INSTALACAO') instalacao++
      else if (r._tipo === 'MANUTENCAO') manutencao++
      else if (r._tipo === 'OUTRO') servico++   // REDE não é serviço
    }

    // Os cards de agenda contam o MESMO recorte de filtros que a tabela mostra.
    // Só agendHoje é zerado: os dois baldes contêm exclusivamente datas futuras,
    // então o toggle jamais casaria e o card ficaria preso em 0. agendAmanha e
    // agendFuturo não passam por aqui — eles escolhem baseOrdens, não filtram.
    const filtrosAgenda: OrdensFiltros = { ...filtros, agendHoje: false }

    return {
      total:       filtered.length,
      criticas,
      semEquipe:   semEquipeCount,
      agendHoje:   agendHojeCount,
      agendAmanha: aplicarFiltros(amanhaOrdens,    filtrosAgenda, hojeBR).length,
      agendFuturo: aplicarFiltros(posAmanhaOrdens, filtrosAgenda, hojeBR).length,
      instalacao, manutencao, servico,
    }
  }, [filtered, amanhaOrdens, posAmanhaOrdens, filtros])

  const clearFilters = () => {
    setSearch(''); setStatus(''); setReagendTipo(''); setTipo(''); setCidade(''); setBairro('')
    setEquipe(''); setAging(''); setFornecedor(''); setTipoOs(''); setPeriodo('')
    setSemEquipe(false); setCritico(false); setAgendHoje(false); setAgendAmanha(false); setAgendFuturo(false)
    setTableSort({ key: null, dir: 'asc' })
    setPage(1)
  }

  const filtersActive = Boolean(
    search || status || reagendTipo || tipo || cidade || bairro || equipe || aging || fornecedor ||
    tipoOs || periodo || semEquipe || agendHoje || agendAmanha || agendFuturo || critico || tableSort.key
  )

  return {
    isLoading, error, ordens, filtered, paginated,
    totalPages, page, setPage, pageSize, setPageSize, density, setDensity, kpis,
    search, setSearch, status, setStatus, reagendTipo, setReagendTipo, tipo, setTipo,
    cidade, setCidade, bairro, setBairro, equipe, setEquipe,
    aging, setAging, critico, setCritico, fornecedor, setFornecedor, tipoOs, setTipoOs,
    periodo, setPeriodo,
    semEquipe, setSemEquipe,
    agendHoje, agendAmanha, agendFuturo,
    agendaFoco, setAgendaFoco,
    tableSort, toggleTableSort,
    clearFilters, filtersActive, options,
  }
}
