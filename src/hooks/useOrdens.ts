import { useState, useMemo } from 'react'
import { useOSDerived } from '../contexts/OSDataContext'
import type { OSRow } from '../lib/types'

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

export function useOrdens() {
  const { derived: { ordens: ordensData }, allRows, isLoading, error } = useOSDerived()

  const [search,      setSearch]      = useState('')
  const [status,      setStatus]      = useState('')
  const [tipo,        setTipo]        = useState('')
  const [cidade,      setCidade]      = useState('')
  const [bairro,      setBairro]      = useState('')
  const [equipe,      setEquipe]      = useState('')
  const [aging,       setAging]       = useState('')
  const [fornecedor,  setFornecedor]  = useState('')
  const [tipoOs,      setTipoOs]      = useState('')
  const [periodo,     setPeriodo]     = useState('')
  const [semEquipe,   setSemEquipe]   = useState(false)
  const [agendHoje,   setAgendHoje]   = useState(false)
  const [agendAmanha, setAgendAmanha] = useState(false)
  const [agendFuturo, setAgendFuturo] = useState(false)
  const [hideRede,    setHideRede]    = useState(false)
  const [sortBy,      setSortBy]      = useState('agendamento')
  const [density,     setDensity]     = useState('normal')
  const [page,        setPage]        = useState(1)
  const PAGE_SIZE = 50

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ordens, options } = ordensData as any

  const { amanhaOrdens, futuroOrdens } = useMemo(() => {
    const hoje  = new Date(); hoje.setHours(0, 0, 0, 0)
    const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1)
    const amanhaDDMM = `${String(amanha.getDate()).padStart(2,'0')}/${String(amanha.getMonth()+1).padStart(2,'0')}/${amanha.getFullYear()}`
    const amanhaOrdens: OSRow[] = [], futuroOrdens: OSRow[] = []
    for (const r of allRows) {
      const raw = ((r.dataagendamento as string) || '').split(' ')[0]
      if (!raw) continue
      const parts = raw.split('/')
      if (parts.length !== 3) continue
      const d = new Date(+parts[2], +parts[1] - 1, +parts[0])
      if (d >= amanha) {
        futuroOrdens.push(r)
        if (raw === amanhaDDMM) amanhaOrdens.push(r)
      }
    }
    return { amanhaOrdens, futuroOrdens }
  }, [allRows])

  const baseOrdens: OSRow[] = agendAmanha ? amanhaOrdens : agendFuturo ? futuroOrdens : ordens

  const filtered = useMemo(() => {
    let r = baseOrdens
    const q = search.toLowerCase()
    if (q)          r = r.filter(x => ((x.nomecliente as string) ?? '').toLowerCase().includes(q) || ((x.numos as string) ?? '').includes(q) || ((x.nomedacidade as string) ?? '').toLowerCase().includes(q))
    if (status)     r = r.filter(x => x._situacaoEfetiva === status)
    if (tipo)       r = r.filter(x => x.tiposervico === tipo)
    if (cidade)     r = r.filter(x => x.nomedacidade === cidade)
    if (bairro)     r = r.filter(x => x.bairro === bairro)
    if (equipe)     r = r.filter(x => x.nomedaequipe === equipe)
    if (fornecedor) r = r.filter(x => x._fornecedor === fornecedor)
    if (tipoOs)     r = r.filter(x => x._tipo === tipoOs)
    if (periodo)    r = r.filter(x => ((x.periodo as string) || '').trim().toLowerCase() === periodo.toLowerCase())
    if (semEquipe)  r = r.filter(x => !x.nomedaequipe)
    if (hideRede)   r = r.filter(x => x._fornecedor !== 'REDE')
    if (agendHoje) {
      const today = new Date().toISOString().slice(0, 10)
      r = r.filter(x => (x.dataagendamento as string | undefined)?.startsWith(today))
    }
    if (aging) {
      r = r.filter(x => {
        const a = (x._aging as number) ?? 0
        if (aging === '1')  return a <= 1
        if (aging === '2')  return a <= 2
        if (aging === '3')  return a >= 3 && a <= 5
        if (aging === '6')  return a >= 6
        if (aging === '11') return a >= 11
        return true
      })
    }

    if (sortBy === 'agendamento') {
      r = [...r].sort((a, b) => {
        const da = parseAgend(a.dataagendamento as string)
        const db = parseAgend(b.dataagendamento as string)
        if (!da && !db) return 0
        if (!da) return 1
        if (!db) return -1
        return da.getTime() - db.getTime()
      })
    }

    return r
  }, [baseOrdens, search, status, tipo, cidade, bairro, equipe, fornecedor, tipoOs, periodo, semEquipe, agendHoje, aging, hideRede, sortBy])

  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    let criticas = 0, semEquipeCount = 0, agendHojeCount = 0, instalacao = 0, manutencao = 0, servico = 0
    for (const r of filtered) {
      if (((r._aging as number) ?? 0) >= 6) criticas++
      if (!r.nomedaequipe) semEquipeCount++
      if ((r.dataagendamento as string | undefined)?.startsWith(today)) agendHojeCount++
      if (r._tipo === 'INSTALACAO') instalacao++
      else if (r._tipo === 'MANUTENCAO') manutencao++
      else servico++
    }
    return { total: filtered.length, criticas, semEquipe: semEquipeCount, agendHoje: agendHojeCount, agendAmanha: amanhaOrdens.length, agendFuturo: futuroOrdens.length, instalacao, manutencao, servico }
  }, [filtered, amanhaOrdens, futuroOrdens])

  const clearFilters = () => {
    setSearch(''); setStatus(''); setTipo(''); setCidade(''); setBairro('')
    setEquipe(''); setAging(''); setFornecedor(''); setTipoOs(''); setPeriodo('')
    setSemEquipe(false); setAgendHoje(false); setAgendAmanha(false); setAgendFuturo(false)
    setPage(1)
  }

  return {
    isLoading, error, ordens, filtered, paginated,
    totalPages, page, setPage, density, setDensity, kpis,
    search, setSearch, status, setStatus, tipo, setTipo,
    cidade, setCidade, bairro, setBairro, equipe, setEquipe,
    aging, setAging, fornecedor, setFornecedor, tipoOs, setTipoOs,
    periodo, setPeriodo,
    semEquipe, setSemEquipe, agendHoje, setAgendHoje,
    agendAmanha, setAgendAmanha, agendFuturo, setAgendFuturo,
    hideRede, setHideRede,
    sortBy, setSortBy,
    clearFilters, options,
  }
}
