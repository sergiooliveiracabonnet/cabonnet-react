/// <reference types="vite/client" />

export function resolveApiBase(configured: string | undefined, search: string): string {
  return new URLSearchParams(search).get('automation') === 'pdf' ? '' : (configured ?? '')
}

const BASE = resolveApiBase(
  import.meta.env['VITE_API_URL'] as string | undefined,
  typeof window === 'undefined' ? '' : window.location.search,
)
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
      throw new Error('Timeout: o servidor não respondeu em 35 segundos', { cause: err })
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
    check:  ()                                     => request<AuthResponse>('/api/session'),
    login:  (username: string, password: string)   => request<AuthResponse>('/api/login',  { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: ()                                     => request('/api/logout'),
  },
}

export interface AuthResponse {
  ok:        boolean
  role?:     UserRole | null
  username?: string | null
  fornecedor_key?: FornecedorAcesso | null
  modulos?:  string[]
  error?:    string
}

export const picoAlertas = {
  list:      ()          => request<{ ok: boolean; items: unknown[] }>('/api/pico-alertas'),
  dismiss:   (id: number) => request(`/api/pico-alertas/${id}/dismiss`,   { method: 'POST', body: '{}' }),
  justified: (id: number) => request(`/api/pico-alertas/${id}/justified`, { method: 'POST', body: '{}' }),
}

export const justificativas = {
  list:   (limit = 100)   => request<{ ok: boolean; items: unknown[] }>(`/api/justificativas?limit=${limit}`),
  save:   (body: unknown) => request<{ ok: boolean; id: number }>('/api/justificativas', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id: number)    => request<{ ok: boolean }>(`/api/justificativas/${id}`, { method: 'DELETE' }),
}

export interface MotivoEncerramentoItem { motivo: string; observacao: string; criado_em: string }

export const motivoEncerramento = {
  get:  (numos: string) => request<{ ok: boolean; item: MotivoEncerramentoItem | null }>(`/api/motivo-encerramento?numos=${encodeURIComponent(numos)}`),
  save: (body: { numos: string; motivo: string; observacao?: string; nomedaequipe?: string; nomedacidade?: string }) =>
    request<{ ok: boolean }>('/api/motivo-encerramento', { method: 'POST', body: JSON.stringify(body) }),
}

export interface TecnicoItem { codigo: string; nome_real: string; contato: string; ativo: boolean; atualizado_em: string }

export const tecnicos = {
  list:   () => request<{ ok: boolean; items: TecnicoItem[] }>('/api/tecnicos'),
  upsert: (body: { codigo: string; nome_real?: string; contato?: string; ativo?: boolean }) =>
    request<{ ok: boolean }>('/api/tecnicos', { method: 'POST', body: JSON.stringify(body) }),
  remove: (codigo: string) => request<{ ok: boolean }>(`/api/tecnicos/${encodeURIComponent(codigo)}`, { method: 'DELETE' }),
}

export interface FornecedorConfig {
  ok:    boolean
  /** Custo mensal VIGENTE na data consultada, por operadora. */
  custo: Record<string, number>
  meta:  Record<string, number>
}

export interface FornecedorCustoVigencia {
  custo_mensal:   number
  vigente_de:     string
  vigente_ate:    string | null
  atualizado_em:  string
  atualizado_por: string
}

export const fornecedorConfig = {
  /** `dataRef` em YYYY-MM-DD. Custo por OS de um período passado precisa do
   *  custo daquela época, não do vigente hoje. */
  get: (dataRef?: string) =>
    request<FornecedorConfig>(`/api/fornecedor/config${dataRef ? `?data_ref=${dataRef}` : ''}`),

  setCusto: (body: { forn_key: string; custo_mensal: number; vigente_de?: string }) =>
    request<{ ok: boolean }>('/api/fornecedor/custo', { method: 'POST', body: JSON.stringify(body) }),

  setMeta: (body: { forn_key: string; meta_sla: number | null }) =>
    request<{ ok: boolean }>('/api/fornecedor/meta', { method: 'POST', body: JSON.stringify(body) }),

  historico: (fornKey: string) =>
    request<{ ok: boolean; items: FornecedorCustoVigencia[] }>(
      `/api/fornecedor/custo/historico?forn_key=${encodeURIComponent(fornKey)}`
    ),
}

export type UserRole = 'gestor' | 'operador' | 'viewer' | 'fornecedor'
export type FornecedorAcesso = 'WES' | 'Instacable' | 'THM'

export interface UsuarioItem {
  id:            number
  username:      string
  role:          UserRole
  fornecedor_key: FornecedorAcesso | null
  ativo:         boolean
  criado_em:     string
  atualizado_em: string
}

export const usuarios = {
  list: () => request<{ ok: boolean; items: UsuarioItem[] }>('/api/usuarios'),
  create: (body: { username: string; password: string; role: UserRole; fornecedor_key?: FornecedorAcesso | null }) =>
    request<{ ok: boolean; id: number }>('/api/usuarios', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: { role?: UserRole; ativo?: boolean; fornecedor_key?: FornecedorAcesso | null }) =>
    request<{ ok: boolean; item: UsuarioItem }>(`/api/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  resetPassword: (id: number, password: string) =>
    request<{ ok: boolean }>(`/api/usuarios/${id}/senha`, { method: 'POST', body: JSON.stringify({ password }) }),
  changeOwnPassword: (atual: string, nova: string) =>
    request<{ ok: boolean }>('/api/usuarios/me/senha', { method: 'POST', body: JSON.stringify({ atual, nova }) }),
}

export interface ModuloDef { key: string; label: string }

export const permissoes = {
  get: () => request<{ ok: boolean; permissoes: Record<UserRole, string[]>; modulos: ModuloDef[] }>('/api/permissoes'),
  set: (role: UserRole, modulos: string[]) =>
    request<{ ok: boolean; modulos: string[] }>(`/api/permissoes/${role}`, { method: 'PUT', body: JSON.stringify({ modulos }) }),
}

export const endpoints = {
  query:            '/query',
  revisitas:        '/revisitas',
  atendimento:      '/atendimento',
  juniper:          '/juniper',
  juniperHist:      '/juniper/historico',
  detalhes:         '/detalhes',
  detalhesFoto:     '/detalhes/foto',
  osExecucaoGeo:    '/erp/os-execucao-geo',
  health:           '/health',
  stats:            '/stats',
} as const

export function osFotoUrl(numos: string | number, codfoto: number): string {
  return `${BASE}${endpoints.detalhesFoto}?numos=${numos}&codfoto=${codfoto}`
}

export const ai = {
  narrative:         (payload: unknown) => request('/ai/narrative',            { method: 'POST', body: JSON.stringify(payload) }),
  revisitas:         (payload: unknown) => request('/ai/revisitas',            { method: 'POST', body: JSON.stringify(payload) }),
  anomalias:         (payload: unknown) => request('/ai/anomalias',            { method: 'POST', body: JSON.stringify(payload) }),
  briefingGet:       ()                 => request('/ai/daily-briefing'),
  briefingCreate:    ()                 => request('/ai/daily-briefing',       { method: 'POST', body: '{}' }),
  forecast:          (payload: unknown) => request('/ai/forecast',             { method: 'POST', body: JSON.stringify(payload) }),
  suggestTeam:       (payload: unknown) => request('/ai/suggest-team',         { method: 'POST', body: JSON.stringify(payload) }),
  // Passivos
  alertas:           (payload: unknown) => request('/ai/alertas',              { method: 'POST', body: JSON.stringify(payload) }),
  fornecedorRec:     (payload: unknown) => request('/ai/fornecedor-rec',       { method: 'POST', body: JSON.stringify(payload) }),
  produtividade:     (payload: unknown) => request('/ai/produtividade-analise',{ method: 'POST', body: JSON.stringify(payload) }),
  // Ativos
  proximaOs:         (payload: unknown) => request('/ai/proxima-os',           { method: 'POST', body: JSON.stringify(payload) }),
  cidadesCluster:    (payload: unknown) => request('/ai/cidades-cluster',      { method: 'POST', body: JSON.stringify(payload) }),
  planner:           (payload: unknown) => request('/ai/planner',              { method: 'POST', body: JSON.stringify(payload) }),
  juniperCorrelacao:     (payload: unknown) => request('/ai/juniper-correlacao',    { method: 'POST', body: JSON.stringify(payload) }),
  revisitasCausa:        (payload: unknown) => request('/ai/revisitas-causa',       { method: 'POST', body: JSON.stringify(payload) }),
  justificativaBacklog:  (payload: unknown) => request('/ai/justificativa-backlog', { method: 'POST', body: JSON.stringify(payload) }),
  chat: (messages: { role: string; content: string }[]) => request<{ ok: boolean; response: string; tool_calls: string[] }>('/ai/chat', { method: 'POST', body: JSON.stringify({ messages }) }),
}

export const aiStatus = () => request<{
  ok: boolean; valid: boolean; reason?: string
  model?: string; models_avail?: number; console_url?: string
  usage?: { calls: number; errors: number; input_tokens: number; output_tokens: number; total_tokens: number; cost_usd: number; cost_brl: number }
}>('/ai/status')

export const telegram = {
  status:    ()                                                             => request('/notify/telegram/status'),
  send:      (text: string, chat?: string)                                 => request('/notify/telegram',            { method: 'POST', body: JSON.stringify({ text, ...(chat && { chat }) }) }),
  sendNow:   ()                                                            => request('/notify/telegram/status_now', { method: 'POST', body: JSON.stringify({}) }),
  sendPhoto: (photo: string, caption: string, chat?: string, asDocument = false) => request('/notify/telegram/photo', { method: 'POST', body: JSON.stringify({ photo, caption, ...(chat && { chat }), ...(asDocument && { as_document: true }) }) }),
}
