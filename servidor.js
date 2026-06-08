// servidor.js - Cabonnet React v2026.8
// Dev:  node servidor.js --dev   → Python (5000) + Vite HMR (3000)
// Prod: node servidor.js         → Python (5000) + dist/ estático (3000)
import http              from 'http'
import https             from 'https'
import fs                from 'fs'
import path              from 'path'
import net               from 'net'
import os               from 'os'
import { fileURLToPath } from 'url'
import { spawn, execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const DEV_MODE   = process.argv.includes('--dev')
const DIST_DIR   = path.join(__dirname, 'dist')
const API_HOST   = '127.0.0.1'
const API_PORT   = 5000
const SERVE_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000

function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return 'localhost'
}

// Parse .env manually (no dotenv dependency needed)
;(function loadEnv() {
  const envPath = path.join(__dirname, '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
})()

const GRAFANA_URL    = process.env.GRAFANA_URL    || ''
const GRAFANA_USER   = process.env.GRAFANA_USER   || ''
const GRAFANA_PASS   = process.env.GRAFANA_PASS   || ''
const GRAFANA_DS_UID = process.env.GRAFANA_DS_UID || ''
const MONITOR_URL    = process.env.MONITOR_URL    || ''
const MONITOR_USER   = process.env.MONITOR_USER   || ''
const MONITOR_PASS   = process.env.MONITOR_PASS   || ''
const MONITOR_DS_UID = process.env.MONITOR_DS_UID || ''
// UID do datasource Zabbix (plugin alexanderzobnin). Fallback para MONITOR_DS_UID.
const ZABBIX_DS_UID  = process.env.ZABBIX_DS_UID  || MONITOR_DS_UID

const MIME = {
  '.html' : 'text/html; charset=utf-8',
  '.js'   : 'application/javascript',
  '.mjs'  : 'application/javascript',
  '.css'  : 'text/css',
  '.svg'  : 'image/svg+xml',
  '.png'  : 'image/png',
  '.jpg'  : 'image/jpeg',
  '.jpeg' : 'image/jpeg',
  '.ico'  : 'image/x-icon',
  '.json' : 'application/json',
  '.woff' : 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf'  : 'font/ttf',
  '.txt'  : 'text/plain',
  '.webp' : 'image/webp',
}

const API_PREFIXES = ['/api', '/query', '/revisitas', '/backlog', '/atendimento', '/juniper', '/notify', '/detalhes', '/health', '/ai', '/grafana']

function isApiRoute(url) {
  const p = url.split('?')[0]
  return API_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/') || p.startsWith(prefix + '?'))
}

function log(msg) {
  const ts = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  console.log(`  [${ts}] ${msg}`)
}

function detectPython() {
  for (const cmd of ['python', 'python3', 'py']) {
    try { execSync(`${cmd} --version`, { stdio: 'ignore' }); return cmd } catch {}
  }
  return null
}

function waitForPort(host, port, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    function attempt() {
      const socket = new net.Socket()
      socket.setTimeout(500)
      socket.connect(port, host, () => { socket.destroy(); resolve() })
      socket.on('error', () => {
        socket.destroy()
        if (Date.now() < deadline) setTimeout(attempt, 500)
        else reject(new Error(`Porta ${port} nao disponivel apos ${timeoutMs}ms`))
      })
      socket.on('timeout', () => {
        socket.destroy()
        if (Date.now() < deadline) setTimeout(attempt, 500)
        else reject(new Error(`Timeout aguardando porta ${port}`))
      })
    }
    attempt()
  })
}

function proxyRequest(req, res) {
  const options = {
    hostname: API_HOST,
    port    : API_PORT,
    path    : req.url,
    method  : req.method,
    headers : { ...req.headers, host: `${API_HOST}:${API_PORT}` },
  }
  const proxyReq = http.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers }
    delete headers['transfer-encoding']
    res.writeHead(proxyRes.statusCode, headers)
    proxyRes.pipe(res, { end: true })
  })
  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Servidor Python indisponivel (porta 5000)' }))
    }
  })
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq, { end: true })
  } else {
    proxyReq.end()
  }
}

function serveStatic(req, res) {
  const urlPath  = req.url.split('?')[0].split('#')[0]
  const ext      = path.extname(urlPath)
  const target   = ext ? path.join(DIST_DIR, urlPath) : path.join(DIST_DIR, 'index.html')

  fs.readFile(target, (err, data) => {
    if (err) {
      fs.readFile(path.join(DIST_DIR, 'index.html'), (err2, data2) => {
        if (err2) { res.writeHead(404); res.end('404'); return }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
        res.end(data2)
      })
      return
    }
    const mime      = MIME[path.extname(target)] || 'application/octet-stream'
    const isHashed  = /\.[a-f0-9]{8,}\.\w+$/.test(target)
    const cacheCtrl = isHashed ? 'public, max-age=31536000, immutable' : 'no-cache'
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cacheCtrl })
    res.end(data)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Grafana proxy — keeps credentials server-side
// ─────────────────────────────────────────────────────────────────────────────

function httpsPost(baseUrl, user, pass, urlPath, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body)
    const isHttps = baseUrl.startsWith('https')
    const urlObj  = new URL(baseUrl + urlPath)
    const opts = {
      hostname          : urlObj.hostname,
      port              : urlObj.port || (isHttps ? 443 : 80),
      path              : urlObj.pathname + urlObj.search,
      method            : 'POST',
      headers           : {
        'Content-Type'   : 'application/json',
        'Accept'         : 'application/json',
        'Authorization'  : 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
        'Content-Length' : bodyBuf.byteLength,
      },
      rejectUnauthorized: false,
    }
    const req = (isHttps ? https : http).request(opts, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString()
        try   { resolve({ status: res.statusCode, body: JSON.parse(raw) }) }
        catch { resolve({ status: res.statusCode, body: raw }) }
      })
    })
    req.on('error', reject)
    req.write(bodyBuf)
    req.end()
  })
}

function parseGrafanaFrame(result) {
  try {
    const frame  = result?.results?.A?.frames?.[0]
    if (!frame) return []
    const fields = frame.schema.fields.map(f => f.name)
    const vals   = frame.data.values
    const len    = vals[0]?.length ?? 0
    return Array.from({ length: len }, (_, i) => {
      const row = {}
      fields.forEach((name, fi) => { row[name] = vals[fi]?.[i] ?? null })
      return row
    })
  } catch { return [] }
}

function jsonReply(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
  res.end(JSON.stringify(payload))
}

const SQL_OS_TOTAIS = `
SELECT
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao IN ('P','A'))                                        AS pendentes,
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao = 'F'
    AND o.datadofechamento >= CURRENT_DATE - INTERVAL '7 days')                                         AS fechados_7d,
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao IN ('P','A')
    AND o.databerabertura < CURRENT_TIMESTAMP - INTERVAL '72 hours')                                    AS aging_critico,
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao IN ('P','A') AND (o.equipe IS NULL OR o.equipe = 0)) AS sem_equipe
FROM ordemservico o
JOIN lanceservicos l ON l.codigodoserv_lanc = o.codservsolicitado
WHERE l.nomecategoriaservico IN ('INSTALAÇÃO','MANUTENÇÃO','REDE')
  AND o.cidade IN (SELECT codigo FROM tablocal WHERE nomedacidade IN ('São José dos Campos','Caçapava','Taubaté','Tremembé','Pindamonhangaba'))
`

const SQL_OS_CIDADES = `
SELECT
  tl.nomedacidade                                                                                         AS cidade,
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao IN ('P','A'))                                        AS pendentes,
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao = 'F'
    AND o.datadofechamento >= CURRENT_DATE - INTERVAL '7 days')                                         AS fechados_7d,
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao IN ('P','A')
    AND o.databerabertura < CURRENT_TIMESTAMP - INTERVAL '72 hours')                                    AS aging_critico
FROM ordemservico o
JOIN lanceservicos l ON l.codigodoserv_lanc = o.codservsolicitado
JOIN tablocal tl ON tl.codigo = o.cidade
WHERE l.nomecategoriaservico IN ('INSTALAÇÃO','MANUTENÇÃO','REDE')
  AND tl.nomedacidade IN ('São José dos Campos','Caçapava','Taubaté','Tremembé','Pindamonhangaba')
GROUP BY tl.nomedacidade
ORDER BY pendentes DESC
`

function grafanaQuery(dsUid, sql) {
  return JSON.stringify({
    queries: [{
      refId      : 'A',
      datasource : { uid: dsUid },
      rawQuery   : true,
      rawSql     : sql,
      format     : 'table',
    }],
    from: 'now-30d',
    to  : 'now',
  })
}

async function handleOsTotais(req, res) {
  if (!GRAFANA_URL) return jsonReply(res, 503, { ok: false, error: 'Grafana não configurado' })
  try {
    const r    = await httpsPost(GRAFANA_URL, GRAFANA_USER, GRAFANA_PASS, '/api/ds/query', grafanaQuery(GRAFANA_DS_UID, SQL_OS_TOTAIS))
    const rows = parseGrafanaFrame(r.body)
    jsonReply(res, 200, { ok: true, data: rows[0] ?? {} })
  } catch (e) { jsonReply(res, 502, { ok: false, error: e.message }) }
}

async function handleOsCidades(req, res) {
  if (!GRAFANA_URL) return jsonReply(res, 503, { ok: false, error: 'Grafana não configurado' })
  try {
    const r    = await httpsPost(GRAFANA_URL, GRAFANA_USER, GRAFANA_PASS, '/api/ds/query', grafanaQuery(GRAFANA_DS_UID, SQL_OS_CIDADES))
    const rows = parseGrafanaFrame(r.body)
    jsonReply(res, 200, { ok: true, data: rows })
  } catch (e) { jsonReply(res, 502, { ok: false, error: e.message }) }
}

async function handleIncidentes(req, res) {
  if (!MONITOR_URL) return jsonReply(res, 503, { ok: false, error: 'Monitor não configurado' })
  const zabbixBody = JSON.stringify({
    jsonrpc: '2.0', id: 1, auth: null,
    method : 'problem.get',
    params  : {
      output       : ['eventid','objectid','clock','name','severity','acknowledged'],
      selectHosts  : ['hostid','host','name'],
      suppressed   : false,
      recent       : true,
      sortfield    : ['severity','clock'],
      sortorder    : ['DESC','DESC'],
      limit        : 50,
    },
  })
  // Tenta Grafana 10+ resources endpoint primeiro, depois fallback para proxy legado
  const candidates = [
    `/api/datasources/uid/${ZABBIX_DS_UID}/resources/zabbix-api`,
    `/api/datasources/proxy/uid/${ZABBIX_DS_UID}/`,
  ]
  const SEV_MAP = ['','INFORMACAO','AVISO','MEDIO','ALTO','CRITICO','DESASTRE']
  for (const urlPath of candidates) {
    try {
      const r = await httpsPost(MONITOR_URL, MONITOR_USER, MONITOR_PASS, urlPath, zabbixBody)
      if (r.status === 400) {
        log(`[Zabbix] 400 em ${urlPath} — ${JSON.stringify(r.body).slice(0, 200)}`)
        continue
      }
      const payload  = r.body
      const problems = payload?.result ?? (Array.isArray(payload) ? payload : [])
      const data = problems.map(p => ({
        id    : p.eventid,
        host  : p.hosts?.[0]?.name ?? p.hosts?.[0]?.host ?? '—',
        desc  : p.name,
        sev   : SEV_MAP[parseInt(p.severity)] ?? 'DESCONHECIDO',
        sevNum: parseInt(p.severity),
        ack   : p.acknowledged === '1',
        ts    : new Date(parseInt(p.clock) * 1000).toISOString(),
      }))
      return jsonReply(res, 200, { ok: true, data })
    } catch (e) { log(`[Zabbix] Falha em ${urlPath}: ${e.message}`) }
  }
  jsonReply(res, 502, { ok: false, error: 'Zabbix indisponível — verifique logs e ZABBIX_DS_UID no .env' })
}

async function zabbixProxy(req, res, method, params, mapFn) {
  if (!MONITOR_URL) return jsonReply(res, 503, { ok: false, error: 'Monitor não configurado' })
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, auth: null, method, params })
  const candidates = [
    `/api/datasources/uid/${ZABBIX_DS_UID}/resources/zabbix-api`,
    `/api/datasources/proxy/uid/${ZABBIX_DS_UID}/`,
  ]
  for (const urlPath of candidates) {
    try {
      const r = await httpsPost(MONITOR_URL, MONITOR_USER, MONITOR_PASS, urlPath, body)
      if (r.status === 400) { log(`[Zabbix] 400 em ${urlPath}`); continue }
      const payload = r.body
      const result  = payload?.result ?? (Array.isArray(payload) ? payload : [])
      return jsonReply(res, 200, { ok: true, data: mapFn ? mapFn(result) : result })
    } catch (e) { log(`[Zabbix] Falha em ${urlPath}: ${e.message}`) }
  }
  jsonReply(res, 502, { ok: false, error: 'Zabbix indisponível' })
}

async function routeGrafana(req, res) {
  const p = req.url.split('?')[0]
  if (p === '/grafana/os-totais')  return handleOsTotais(req, res)
  if (p === '/grafana/os-cidades') return handleOsCidades(req, res)
  if (p === '/grafana/incidentes') return handleIncidentes(req, res)

  if (p === '/grafana/zabbix/mttr') {
    const from_ts = Math.floor((Date.now() - 30 * 86400 * 1000) / 1000)
    return zabbixProxy(req, res, 'event.get', {
      output: ['eventid','clock','r_clock','name','severity','acknowledged'],
      selectHosts: ['hostid','host','name'],
      source: 0, object: 0, value: 1,
      time_from: from_ts, sortfield: ['clock'], sortorder: 'DESC', limit: 2000,
    }, (events) => {
      const SEV  = ['','INFORMACAO','AVISO','MEDIO','ALTO','CRITICO','DESASTRE']
      const resolved = events.filter(e => parseInt(e.r_clock) > 0)
      const bySev = {}
      for (const e of resolved) {
        const sev = parseInt(e.severity); const dur = parseInt(e.r_clock) - parseInt(e.clock)
        if (!bySev[sev]) bySev[sev] = { count: 0, total_s: 0 }
        bySev[sev].count++; bySev[sev].total_s += dur
      }
      const totalS = resolved.reduce((a,e) => a + parseInt(e.r_clock) - parseInt(e.clock), 0)
      return {
        total_eventos: events.length,
        resolvidos:    resolved.length,
        em_aberto:     events.length - resolved.length,
        mttr_min:      resolved.length ? +(totalS / resolved.length / 60).toFixed(1) : 0,
        por_severidade: Object.entries(bySev)
          .map(([sev,d]) => ({ sev: SEV[sev]??sev, sevNum: +sev, count: d.count, mttr_min: +(d.total_s/d.count/60).toFixed(1) }))
          .sort((a,b) => b.sevNum - a.sevNum),
      }
    })
  }

  if (p === '/grafana/zabbix/top-equipamentos') {
    const from_ts = Math.floor((Date.now() - 30 * 86400 * 1000) / 1000)
    return zabbixProxy(req, res, 'event.get', {
      output: ['eventid','clock','r_clock','name','severity'],
      selectHosts: ['hostid','host','name'],
      source: 0, object: 0, value: 1, time_from: from_ts, limit: 2000,
    }, (events) => {
      const stats = {}
      for (const e of events) {
        const sev = parseInt(e.severity); const r = parseInt(e.r_clock); const ok = r > 0
        for (const h of e.hosts ?? []) {
          const id = h.hostid; const name = h.name || h.host || '—'
          if (!stats[id]) stats[id] = { host: name, ocorrencias: 0, criticos: 0, resolvidos: 0, mttr_s: 0 }
          stats[id].ocorrencias++
          if (sev >= 5) stats[id].criticos++
          if (ok) { stats[id].resolvidos++; stats[id].mttr_s += r - parseInt(e.clock) }
        }
      }
      return Object.entries(stats)
        .map(([id,s]) => ({
          hostid: id, host: s.host,
          ocorrencias_30d: s.ocorrencias, criticos_30d: s.criticos,
          mttr_min: s.resolvidos ? +(s.mttr_s/s.resolvidos/60).toFixed(1) : null,
        }))
        .sort((a,b) => b.ocorrencias_30d - a.ocorrencias_30d)
        .slice(0,20)
    })
  }

  // Rotas /grafana/zabbix/* não tratadas aqui são delegadas ao Python
  proxyRequest(req, res)
}

// ─────────────────────────────────────────────────────────────────────────────
// Inicialização compartilhada: Python
// ─────────────────────────────────────────────────────────────────────────────

async function startPython() {
  const pyCmd = detectPython()
  if (!pyCmd) {
    log('[AVISO] Python nao encontrado - chamadas de API retornarao 502')
    return null
  }
  log(`Iniciando servidor Python em background (${pyCmd})...`)
  const pyProcess = spawn(pyCmd, [path.join(__dirname, 'cabonnet_server.py')], {
    cwd    : __dirname,
    stdio  : DEV_MODE ? ['ignore', 'inherit', 'inherit'] : 'ignore',
    detached: false,
  })
  pyProcess.on('error', err  => log(`[AVISO] Python: ${err.message}`))
  pyProcess.on('exit',  code => { if (code !== 0 && code !== null) log(`[AVISO] Python encerrou (code ${code})`) })

  const kill = () => { try { pyProcess.kill() } catch {} }
  process.on('exit',   kill)
  process.on('SIGINT',  () => { kill(); process.exit(0) })
  process.on('SIGTERM', () => { kill(); process.exit(0) })

  log('Aguardando Python ficar pronto na porta 5000...')
  try {
    await waitForPort(API_HOST, API_PORT, 20000)
    log('Python pronto.')
  } catch {
    log('[AVISO] Python nao respondeu em 20s. Continuando sem API...')
  }
  return pyProcess
}

function makeRequestHandler(getViteMiddlewares) {
  return (req, res) => {
    res.setHeader('X-Powered-By', 'Cabonnet')
    if (req.url.split('?')[0].startsWith('/grafana/'))
      return routeGrafana(req, res).catch(e => jsonReply(res, 500, { ok: false, error: e.message }))
    if (isApiRoute(req.url))
      return proxyRequest(req, res)
    const vite = getViteMiddlewares()
    if (vite)
      return vite(req, res, () => { res.writeHead(404); res.end('Not found') })
    serveStatic(req, res)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo desenvolvimento — Vite HMR embutido
// ─────────────────────────────────────────────────────────────────────────────

async function startDev() {
  await startPython()

  let viteMiddlewares = null
  const httpServer = http.createServer(makeRequestHandler(() => viteMiddlewares))

  httpServer.on('error', err => {
    if (err.code === 'EADDRINUSE')
      console.error(`\n  [ERRO] Porta ${SERVE_PORT} ja esta em uso. Use: PORT=3001 node servidor.js --dev\n`)
    else
      console.error('\n  [ERRO]', err.message)
    process.exit(1)
  })

  httpServer.listen(SERVE_PORT, '0.0.0.0', () => {
    const ip = getLocalIP()
    console.log('')
    console.log('  +==========================================+')
    console.log('  |     CABONNET REACT - DESENVOLVIMENTO     |')
    console.log('  +==========================================+')
    console.log('')
    log(`Local     -> http://localhost:${SERVE_PORT}  (Vite HMR ativo)`)
    log(`Rede      -> http://${ip}:${SERVE_PORT}`)
    log(`API proxy -> http://localhost:${SERVE_PORT} -> http://localhost:${API_PORT}`)
    console.log('')
    console.log('  Pressione Ctrl+C para encerrar tudo.')
    console.log('')
  })

  // Importação dinâmica para que o Vite (devDependency) não seja exigido em produção
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({
    configFile: path.join(__dirname, 'vite.config.js'),
    server    : { middlewareMode: true, hmr: { server: httpServer } },
    appType   : 'spa',
  })
  viteMiddlewares = vite.middlewares
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo produção — serve dist/ estático
// ─────────────────────────────────────────────────────────────────────────────

async function startProd() {
  if (!fs.existsSync(DIST_DIR) || !fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    console.error('\n  [ERRO] Pasta dist/ nao encontrada. Execute: npm run build\n')
    process.exit(1)
  }

  await startPython()

  const server = http.createServer(makeRequestHandler(() => null))

  server.listen(SERVE_PORT, '0.0.0.0', () => {
    const ip = getLocalIP()
    console.log('')
    console.log('  +==========================================+')
    console.log('  |       CABONNET REACT - PRODUCAO          |')
    console.log('  +==========================================+')
    console.log('')
    log(`Local     -> http://localhost:${SERVE_PORT}`)
    log(`Rede      -> http://${ip}:${SERVE_PORT}`)
    log(`API proxy -> http://localhost:${SERVE_PORT} -> http://localhost:${API_PORT}`)
    console.log('')
    console.log('  Pressione Ctrl+C para encerrar tudo.')
    console.log('')
  })

  server.on('error', err => {
    if (err.code === 'EADDRINUSE')
      console.error(`\n  [ERRO] Porta ${SERVE_PORT} ja esta em uso. Use: PORT=3001 node servidor.js\n`)
    else
      console.error('\n  [ERRO]', err.message)
    process.exit(1)
  })
}

// ─────────────────────────────────────────────────────────────────────────────

if (DEV_MODE) startDev()
else          startProd()
