#!/usr/bin/env node
// Auditoria do design system — impede regressão da Onda 1.
// Uso: node scripts/audit-ds.mjs [dir]   (default: src)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.argv[2] ?? 'src'
const BASELINE = JSON.parse(readFileSync(new URL('./audit-ds-baseline.json', import.meta.url), 'utf8'))

const RULES = [
  {
    name: 'Tamanho de fonte banido (mínimo do sistema é 11px / text-caption)',
    test: (src) => [...src.matchAll(/text-\[(?:8|9|10)px\]/g)].map(m => m[0]),
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
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8')
  const rel = relative('.', file).replace(/\\/g, '/')

  for (const rule of RULES) {
    for (const hit of rule.test(src)) {
      console.error(`✗ ${rel}: ${rule.name} → "${hit}"`)
      violations++
    }
  }

  // Regra 3: hex fora da baseline (tokens do index.css são globais; o resto é por arquivo)
  if (file.endsWith('.tsx')) {
    const allowed = new Set([...BASELINE.globalHex, ...(BASELINE.files[rel] ?? [])])
    for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      const hex = m[0].toLowerCase()
      if (!allowed.has(hex)) {
        console.error(`✗ ${rel}: hex fora dos tokens → "${hex}" (adicione um token ou justifique na baseline)`)
        violations++
      }
    }
  }
}

if (violations) {
  console.error(`\naudit:ds FALHOU — ${violations} violação(ões).`)
  process.exit(1)
}
console.log('audit:ds OK')
