/// <reference types="vite/client" />

const BASE       = (import.meta.env['VITE_API_URL'] as string | undefined) ?? ''
const TIMEOUT_MS = 35_000

function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  return fetch(url, { ...options, signal: ctrl.signal })
    .then(res  => { clearTimeout(tid); return res })
    .catch(err => { clearTimeout(tid); throw err })
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetchWithTimeout(`${BASE}${path}`, {
      credentials: 'same-origin',
      headers: {
        'Content-Type':  'application/json',
        'X-Request-ID':  crypto.randomUUID(),
        ...options.headers,
      },
      ...options,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      const msg = `Timeout (${path}): servidor não respondeu em 35s`
      console.error('[api]', msg)
      throw new Error('Timeout: o servidor não respondeu em 35 segundos')
    }
    console.error('[api] Erro de rede:', path, err)
    throw err
  }

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    throw new Error('401 Não autenticado')
  }
  if (!res.ok) {
    const ct   = res.headers.get('content-type') ?? ''
    const body = ct.includes('application/json') ? await res.json().catch(() => null) : null
    throw new Error((body as { error?: string; message?: string } | null)?.error ?? (body as { error?: string; message?: string } | null)?.message ?? `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  get:    <T = unknown>(path: string)              => request<T>(path),
  post:   <T = unknown>(path: string, body: unknown) => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T = unknown>(path: string, body: unknown) => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: <T = unknown>(path: string)              => request<T>(path, { method: 'DELETE' }),

  auth: {
    check:  ()                                     => request('/api/session'),
    login:  (username: string, password: string)   => request('/api/login',  { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: ()                                     => request('/api/logout'),
  },
}

export const endpoints = {
  query:       '/query',
  revisitas:   '/revisitas',
  atendimento: '/atendimento',
  juniper:     '/juniper',
  juniperHist: '/juniper/historico',
  detalhes:    '/detalhes',
  health:      '/health',
  stats:       '/stats',
} as const

export const ai = {
  narrative:         (payload: unknown) => request('/ai/narrative',           { method: 'POST', body: JSON.stringify(payload) }),
  revisitas:         (payload: unknown) => request('/ai/revisitas',           { method: 'POST', body: JSON.stringify(payload) }),
  anomalias:         (payload: unknown) => request('/ai/anomalias',           { method: 'POST', body: JSON.stringify(payload) }),
  briefingGet:       ()                 => request('/ai/daily-briefing'),
  briefingCreate:    ()                 => request('/ai/daily-briefing',      { method: 'POST', body: '{}' }),
  forecast:          (payload: unknown) => request('/ai/forecast',            { method: 'POST', body: JSON.stringify(payload) }),
  suggestTeam:       (payload: unknown) => request('/ai/suggest-team',        { method: 'POST', body: JSON.stringify(payload) }),
  proximaOs:         (payload: unknown) => request('/ai/proxima-os',          { method: 'POST', body: JSON.stringify(payload) }),
  cidadesCluster:    (payload: unknown) => request('/ai/cidades-cluster',     { method: 'POST', body: JSON.stringify(payload) }),
  planner:           (payload: unknown) => request('/ai/planner',             { method: 'POST', body: JSON.stringify(payload) }),
  juniperCorrelacao: (payload: unknown) => request('/ai/juniper-correlacao',  { method: 'POST', body: JSON.stringify(payload) }),
}

export const telegram = {
  status:    ()                                                             => request('/notify/telegram/status'),
  send:      (text: string, chat?: string)                                 => request('/notify/telegram',            { method: 'POST', body: JSON.stringify({ text, ...(chat && { chat }) }) }),
  sendNow:   ()                                                            => request('/notify/telegram/status_now', { method: 'POST', body: JSON.stringify({}) }),
  sendPhoto: (photo: string, caption: string, chat?: string, asDocument = false) => request('/notify/telegram/photo', { method: 'POST', body: JSON.stringify({ photo, caption, ...(chat && { chat }), ...(asDocument && { as_document: true }) }) }),
}
