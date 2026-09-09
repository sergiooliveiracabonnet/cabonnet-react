#!/usr/bin/env node
// Auditoria do design system.
//
// Duas metades:
//
//   REGRAS   coisas que nunca podem entrar. Reprovam sempre.
//   CATRACA  dívida que ainda existe. Não reprova pelo que já está lá; reprova
//            se crescer. A cada PR que paga um pedaço, `npm run audit:ds:catraca`
//            baixa o teto — e ele nunca sobe.
//
// A baseline nasceu como congelador: uma lista de exceções permanentes. Isso
// impede regressão mas não cobra a dívida, e em 31 arquivos ela virou paisagem.
// O teto resolve o outro lado.
//
// Uso: node scripts/audit-ds.mjs [dir]        (default: src)
//      node scripts/audit-ds.mjs --catraca    baixa o teto e limpa a baseline
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const args = process.argv.slice(2)
const CATRACA = args.includes('--catraca')
const ROOT = args.find(a => !a.startsWith('--')) ?? 'src'
const BASELINE_URL = new URL('./audit-ds-baseline.json', import.meta.url)
const BASELINE = JSON.parse(readFileSync(BASELINE_URL, 'utf8'))

const RULES = [
  {
    // A regra antiga só pegava 8/9/10px inteiros — 9.5px e 10.5px passavam por
    // baixo dela. Agora qualquer tamanho avulso reprova: quem precisa de um
    // degrau novo adiciona na escala, onde o vizinho é visível.
    name: 'Tamanho de fonte avulso (use um papel da escala: text-caption ... text-readout-2xl)',
    test: (src) => [...src.matchAll(/text-\[[0-9.]+(?:px|rem|em)\]/g)].map(m => m[0]),
  },
  {
    name: 'Primitivo de token em componente (use a camada semântica --c-*)',
    test: (src) => [...src.matchAll(/--p-[a-z0-9-]+/g)].map(m => m[0]),
  },
  {
    // Alfa sobre branco não é borda: no tema claro dependia de um seletor
    // global de atributo, que a Fase 3 removeu.
    name: 'Borda em alfa sobre branco (use border-hairline / border-subtle / border-strong)',
    test: (src) => [...src.matchAll(/\b(?:[a-z-]+:)?(?:border|divide)[a-z-]*-white\/\[[0-9.]+\]/g)].map(m => m[0]),
  },
  {
    name: 'Import de componente removido do design system',
    test: (src) => [...src.matchAll(/from\s+['"][^'"]*ui\/KPICard['"]|(?:\bBentoKPICard\b|\bKpiBadge\b|\bKpiCard\b)/g)].map(m => m[0]),
  },
]

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(tsx|ts)$/.test(name) && !name.endsWith('.test.tsx') && !name.endsWith('.test.ts')) yield p
  }
}

let violations = 0
let arbitrarios = 0
const hexVistos = {}   // arquivo → hex que realmente aparecem nele

for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8')
  const rel = relative('.', file).replace(/\\/g, '/')

  for (const rule of RULES) {
    for (const hit of rule.test(src)) {
      console.error(`✗ ${rel}: ${rule.name} → "${hit}"`)
      violations++
    }
  }

  if (!file.endsWith('.tsx')) continue

  // Hex fora da baseline (tokens do index.css são globais; o resto é por arquivo)
  const allowed = new Set([...BASELINE.globalHex, ...(BASELINE.files[rel] ?? [])])
  for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = m[0].toLowerCase()
    if (allowed.has(hex)) {
      (hexVistos[rel] ??= new Set()).add(hex)
    } else {
      console.error(`✗ ${rel}: hex fora dos tokens → "${hex}" (adicione um token ou justifique na baseline)`)
      violations++
    }
  }

  arbitrarios += [...src.matchAll(/\b[a-z-]+-\[[^\]]+\]/g)].length
}

// ── Catraca ──────────────────────────────────────────────────────────────────
const hexTolerados =
  BASELINE.globalHex.length +
  Object.values(BASELINE.files).reduce((a, v) => a + v.length, 0)

const atual = { hexTolerados, valoresArbitrarios: arbitrarios }
const teto = BASELINE.tetos ?? {}

if (CATRACA) {
  // Poda: exceção que o arquivo não usa mais deixa de ser exceção. Sem isso a
  // baseline vira paisagem e o teto para de descer sozinho.
  const files = {}
  let podados = 0
  for (const [rel, hexes] of Object.entries(BASELINE.files)) {
    const usados = hexVistos[rel] ?? new Set()
    const restantes = hexes.filter(h => usados.has(h.toLowerCase()))
    podados += hexes.length - restantes.length
    if (restantes.length) files[rel] = restantes
  }
  const novoTotal =
    BASELINE.globalHex.length + Object.values(files).reduce((a, v) => a + v.length, 0)

  const tetos = {}
  for (const [k, v] of Object.entries({ ...atual, hexTolerados: novoTotal })) {
    // Nunca sobe: um teto que sobe não é catraca, é permissão.
    tetos[k] = Math.min(v, teto[k] ?? Infinity)
  }

  writeFileSync(BASELINE_URL, JSON.stringify({ ...BASELINE, files, tetos }, null, 2) + '\n')
  console.log(`catraca: ${podados} exceção(ões) podada(s)`)
  for (const [k, v] of Object.entries(tetos)) {
    console.log(`  ${k}: ${teto[k] ?? '—'} → ${v}`)
  }
  process.exit(0)
}

for (const [k, v] of Object.entries(atual)) {
  const limite = teto[k]
  if (limite === undefined) continue
  if (v > limite) {
    console.error(`✗ catraca: ${k} subiu de ${limite} para ${v} — pague a dívida ou justifique`)
    violations++
  } else if (v < limite) {
    console.log(`↓ catraca: ${k} está em ${v}, abaixo do teto ${limite} — rode "npm run audit:ds:catraca"`)
  }
}

if (violations) {
  console.error(`\naudit:ds FALHOU — ${violations} violação(ões).`)
  process.exit(1)
}
console.log('audit:ds OK')
