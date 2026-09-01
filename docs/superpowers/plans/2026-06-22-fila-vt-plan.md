# Fila de Prioridade VT — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao time operacional uma página dedicada (`/erp/vt`) que prioriza as OS de VT (08h/24h/48h) por tempo restante até o vencimento do prazo, com precisão de hora, mais um alerta automático no Telegram quando uma OS entra em risco ou viola o prazo.

**Architecture:** Backend (`cabonnet/`) corrige a precisão de hora na origem dos dados (SQL) e roda um novo monitor em background que reusa o cache já existente. Frontend adiciona campos derivados em `enrichRows` (sem tocar no pipeline de SLA/risco existente) e uma página nova que reusa componentes já existentes (`DataTable`, `KPICard`, `OSDrawer`, etc).

**Tech Stack:** Python (FastAPI, pytest), TypeScript/React (Vitest), Telegram Bot API.

Spec completa: `docs/superpowers/specs/2026-06-22-fila-vt-design.md`

---

## Task 1: Precisão de hora no `datacadastro` (SQL)

**Files:**
- Modify: `cabonnet/grafana.py:57`, `cabonnet/grafana.py:142`, `cabonnet/grafana.py:227`
- Test: `tests/python/test_grafana_sql.py` (novo arquivo)

Os textos a seguir aparecem **idênticos em 7 lugares** no arquivo (`SQL_PENDENTE`, `SQL_AGENDADO`, `SQL_FUTURO`, `SQL_REVISITAS`, `SQL_DETALHES_TEMPLATE`, `SQL_REVISITAS_COM_OBS`, `SQL_BACKLOG_TEMPLATE`). **Mude SOMENTE as 3 ocorrências dentro de `SQL_PENDENTE` (linha 57), `SQL_AGENDADO` (linha 142) e `SQL_FUTURO` (linha 227)** — são as únicas que alimentam `/query`. NÃO toque nas outras 4 (fora de escopo).

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/python/test_grafana_sql.py`:

```python
# -*- coding: utf-8 -*-
"""Testes da precisão de hora em datacadastro (Fila VT)."""

from cabonnet.grafana import SQL_PENDENTE, SQL_AGENDADO, SQL_FUTURO


def test_sql_pendente_datacadastro_inclui_hora():
    assert "to_char(o.d_datacadastro,    'DD/MM/YYYY HH24:MI') as datacadastro" in SQL_PENDENTE


def test_sql_agendado_datacadastro_inclui_hora():
    assert "to_char(o.d_datacadastro,    'DD/MM/YYYY HH24:MI') as datacadastro" in SQL_AGENDADO


def test_sql_futuro_datacadastro_inclui_hora():
    assert "to_char(o.d_datacadastro,    'DD/MM/YYYY HH24:MI') as datacadastro" in SQL_FUTURO
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `python -m pytest tests/python/test_grafana_sql.py -v`
Expected: 3 FAIL — `AssertionError` (o texto atual ainda é `'DD/MM/YYYY'`, sem `HH24:MI`)

- [ ] **Step 3: Aplicar a correção nas 3 queries**

Em `cabonnet/grafana.py`, linha 57 (dentro de `SQL_PENDENTE`):

```diff
-  to_char(o.d_datacadastro,    'DD/MM/YYYY') as datacadastro,
+  to_char(o.d_datacadastro,    'DD/MM/YYYY HH24:MI') as datacadastro,
```

Linha 142 (dentro de `SQL_AGENDADO`) — mesma mudança:

```diff
-  to_char(o.d_datacadastro,    'DD/MM/YYYY') as datacadastro,
+  to_char(o.d_datacadastro,    'DD/MM/YYYY HH24:MI') as datacadastro,
```

Linha 227 (dentro de `SQL_FUTURO`) — mesma mudança:

```diff
-  to_char(o.d_datacadastro,    'DD/MM/YYYY') as datacadastro,
+  to_char(o.d_datacadastro,    'DD/MM/YYYY HH24:MI') as datacadastro,
```

Confirme que as outras 4 ocorrências (em `SQL_REVISITAS`, `SQL_DETALHES_TEMPLATE`, `SQL_REVISITAS_COM_OBS`, `SQL_BACKLOG_TEMPLATE`) **não foram alteradas**.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `python -m pytest tests/python/test_grafana_sql.py -v`
Expected: 3 PASS

- [ ] **Step 5: Rodar a suíte completa de testes Python para garantir que nada quebrou**

Run: `python -m pytest tests/python -v`
Expected: todos os testes existentes continuam PASS (a mudança só adiciona texto a uma string SQL, não muda nenhum contrato de endpoint)

- [ ] **Step 6: Commit**

```bash
git add cabonnet/grafana.py tests/python/test_grafana_sql.py
git commit -m "fix: inclui hora em datacadastro nas queries PENDENTE/AGENDADO/FUTURO

Necessário para a Fila VT calcular contagem regressiva precisa em
horas (VT 08h/24h/48h). Seguro para o resto do sistema porque todo
parsing existente (parseDate, _parse_data_br) já ignora a hora."
```

---

## Task 2: Parsing de data+hora no backend Python

**Files:**
- Modify: `cabonnet/utils.py`
- Test: `tests/python/test_utils.py` (novo arquivo)

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/python/test_utils.py`:

```python
# -*- coding: utf-8 -*-
"""Testes dos helpers de parsing de data em cabonnet/utils.py."""

from datetime import datetime

from cabonnet.utils import _parse_datetime_br


def test_parse_datetime_br_com_hora():
    dt = _parse_datetime_br("22/06/2026 14:35")
    assert dt == datetime(2026, 6, 22, 14, 35)


def test_parse_datetime_br_sem_hora_assume_meia_noite():
    dt = _parse_datetime_br("22/06/2026")
    assert dt == datetime(2026, 6, 22, 0, 0)


def test_parse_datetime_br_string_vazia_retorna_none():
    assert _parse_datetime_br("") is None
    assert _parse_datetime_br(None) is None


def test_parse_datetime_br_invalida_retorna_none():
    assert _parse_datetime_br("não é uma data") is None
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `python -m pytest tests/python/test_utils.py -v`
Expected: FAIL — `ImportError: cannot import name '_parse_datetime_br'`

- [ ] **Step 3: Implementar `_parse_datetime_br`**

Em `cabonnet/utils.py`, logo depois da função `_parse_data_br` existente (linha 40-47):

```python
def _parse_datetime_br(s):
    """Parseia 'DD/MM/YYYY HH:MM' (com hora) ou 'DD/MM/YYYY' (assume 00:00) em datetime, ou None."""
    if not s:
        return None
    s = s.strip()
    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(s[:16], fmt)
        except ValueError:
            continue
    return None
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `python -m pytest tests/python/test_utils.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add cabonnet/utils.py tests/python/test_utils.py
git commit -m "feat: adiciona _parse_datetime_br para parsing de data+hora

Paralelo ao _parse_data_br existente (que descarta a hora) — usado
pelo monitor de VT para calcular horas restantes com precisão."
```

---

## Task 3: Parsing de data+hora no frontend

**Files:**
- Modify: `src/lib/transform.ts`
- Test: `src/lib/transform.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Em `src/lib/transform.test.ts`, adicionar ao final do bloco de imports da linha 3 `parseDateTime`:

```ts
import { enrichRows, getFornecedor, parseCSV, applyDateFilter, parseDate, parseDateTime, isConcluida, isExecucaoReal } from './transform.js'
```

Adicionar um novo `describe` após o bloco `describe('parseDate', ...)` (depois da linha 446+41=487, ou seja, ao final do describe existente de `parseDate`):

```ts
describe('parseDateTime', () => {
  it('parseia data com hora', () => {
    const dt = parseDateTime('22/06/2026 14:35')
    expect(dt?.getFullYear()).toBe(2026)
    expect(dt?.getMonth()).toBe(5)
    expect(dt?.getDate()).toBe(22)
    expect(dt?.getHours()).toBe(14)
    expect(dt?.getMinutes()).toBe(35)
  })

  it('parseia data sem hora assumindo 00:00', () => {
    const dt = parseDateTime('22/06/2026')
    expect(dt?.getHours()).toBe(0)
    expect(dt?.getMinutes()).toBe(0)
  })

  it('retorna null para string vazia ou nula', () => {
    expect(parseDateTime('')).toBeNull()
    expect(parseDateTime(null)).toBeNull()
  })

  it('retorna null para data inválida', () => {
    expect(parseDateTime('32/13/2026')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/transform.test.ts -t "parseDateTime"`
Expected: FAIL — `parseDateTime is not a function` / erro de import

- [ ] **Step 3: Implementar `parseDateTime`**

Em `src/lib/transform.ts`, imediatamente depois da função `parseDate` existente (depois da linha 53, `}`):

```ts
export function parseDateTime(s: string | null | undefined): Date | null {
  if (!s) return null
  const [datePart, timePart] = s.trim().split(' ')
  const parts = datePart.split(/[/-]/)
  if (parts.length < 3) return null
  const [d, m, y] = parts.map(Number)
  if (!d || !m || !y || m < 1 || m > 12 || d < 1 || d > 31) return null
  let hh = 0
  let mi = 0
  if (timePart) {
    const [h, mn] = timePart.split(':').map(Number)
    if (!Number.isNaN(h))  hh = h
    if (!Number.isNaN(mn)) mi = mn
  }
  const dt = new Date(y, m - 1, d, hh, mi)
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return dt
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/transform.test.ts -t "parseDateTime"`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/transform.ts src/lib/transform.test.ts
git commit -m "feat: adiciona parseDateTime para parsing de data+hora no frontend

Paralelo ao parseDate existente (que descarta a hora) — usado pela
Fila VT para calcular horas restantes com precisão."
```

---

## Task 4: `getVtPrazoHoras` e novos campos em `enrichRows`

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/transform.ts`
- Test: `src/lib/transform.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/transform.test.ts`, adicionar ao topo (perto de `daysAgo`) um novo helper `hoursAgo`:

```ts
function hoursAgo(n: number): string {
  const d = new Date()
  d.setHours(d.getHours() - n)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const HH = String(d.getHours()).padStart(2, '0')
  const MI = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()} ${HH}:${MI}`
}
```

Adicionar um novo `describe` após `describe('enrichRows — SLA', ...)`:

```ts
describe('enrichRows — VT Prazo Horas', () => {
  it('getVtPrazoHoras retorna 8 para VT 08H', () => {
    const [r] = enrichRows([makeOS({ servico: 'ASSISTENCIA - VT 08H' })])
    expect(r._vtPrazoHoras).toBe(8)
  })

  it('getVtPrazoHoras retorna 24 para VT 24H', () => {
    const [r] = enrichRows([makeOS({ servico: 'ASSISTENCIA - VT 24H' })])
    expect(r._vtPrazoHoras).toBe(24)
  })

  it('getVtPrazoHoras retorna 48 para VT 48H', () => {
    const [r] = enrichRows([makeOS({ servico: 'VT 48H TESTE' })])
    expect(r._vtPrazoHoras).toBe(48)
  })

  it('getVtPrazoHoras retorna null para serviço não-VT', () => {
    const [r] = enrichRows([makeOS({ servico: 'ASSISTENCIA TECNICA' })])
    expect(r._vtPrazoHoras).toBeNull()
  })

  it('_vtHorasRestantes positivo quando dentro do prazo (VT 24h, aberta há 20h)', () => {
    const os = makeOS({
      numos: 'VT1', servico: 'ASSISTENCIA - VT 24H',
      descsituacao: 'Pendente', datacadastro: hoursAgo(20),
    })
    const [r] = enrichRows([os])
    expect(r._vtHorasRestantes).not.toBeNull()
    expect(r._vtHorasRestantes as number).toBeGreaterThan(3)
    expect(r._vtHorasRestantes as number).toBeLessThan(5)
    expect(r._vtViolado).toBe(false)
  })

  it('_vtHorasRestantes negativo e _vtViolado=true quando passou do prazo (VT 24h, aberta há 30h)', () => {
    const os = makeOS({
      numos: 'VT2', servico: 'ASSISTENCIA - VT 24H',
      descsituacao: 'Pendente', datacadastro: hoursAgo(30),
    })
    const [r] = enrichRows([os])
    expect(r._vtHorasRestantes as number).toBeLessThan(0)
    expect(r._vtViolado).toBe(true)
  })

  it('_vtHorasRestantes é null para OS não-VT', () => {
    const os = makeOS({
      numos: 'VT3', servico: 'ASSISTENCIA TECNICA',
      descsituacao: 'Pendente', datacadastro: hoursAgo(5),
    })
    const [r] = enrichRows([os])
    expect(r._vtHorasRestantes).toBeNull()
    expect(r._vtViolado).toBe(false)
  })

  it('_vtHorasRestantes é null para OS VT já concluída (não está mais na fila ativa)', () => {
    const os = makeOS({
      numos: 'VT4', servico: 'ASSISTENCIA - VT 24H',
      descsituacao: 'Concluída', datacadastro: hoursAgo(30),
    })
    const [r] = enrichRows([os])
    expect(r._vtHorasRestantes).toBeNull()
    expect(r._vtViolado).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/transform.test.ts -t "VT Prazo Horas"`
Expected: FAIL — `r._vtPrazoHoras` é `undefined`, não existe ainda

- [ ] **Step 3: Adicionar os novos campos à interface `OSRow`**

Em `src/lib/types.ts`, dentro da interface `OSRow` (depois do campo `_diasAteViolacao:` na linha 50):

```ts
  _vtPrazoHoras:      number | null
  _vtHorasRestantes:  number | null
  _vtViolado:         boolean
```

- [ ] **Step 4: Implementar `getVtPrazoHoras` e o cálculo em `enrichRows`**

Em `src/lib/transform.ts`, adicionar a função `getVtPrazoHoras` imediatamente depois de `getSlaLimite` (depois da linha 183, `}`):

```ts
export function getVtPrazoHoras(servico: string | null | undefined): number | null {
  const s = (servico || '').toUpperCase()
  if (s.includes('VT 08H')) return 8
  if (s.includes('VT 24H')) return 24
  if (s.includes('VT 48H')) return 48
  return null
}
```

Em `enrichRows`, imediatamente depois do bloco de `_categoria` (depois da linha 300, `else row._categoria = 'SERVICO'`), adicionar:

```ts
    const vtPrazoHoras = getVtPrazoHoras(row.servico)
    row._vtPrazoHoras = vtPrazoHoras
    if (vtPrazoHoras != null && isAtiva) {
      const dtAberturaPrecisa = parseDateTime(row.datacadastro)
      row._vtHorasRestantes = dtAberturaPrecisa
        ? vtPrazoHoras - Math.max(0, (dtRef.getTime() - dtAberturaPrecisa.getTime()) / 3600000)
        : null
    } else {
      row._vtHorasRestantes = null
    }
    row._vtViolado = row._vtHorasRestantes != null && row._vtHorasRestantes <= 0
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/transform.test.ts`
Expected: todos PASS, incluindo os 8 novos casos de `VT Prazo Horas`

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/transform.ts src/lib/transform.test.ts
git commit -m "feat: adiciona campos _vtPrazoHoras/_vtHorasRestantes/_vtViolado

Calculados em paralelo ao sistema de SLA existente (que continua
intocado) — base para a Fila de Prioridade VT."
```

---

## Task 5: Helper de formatação de horas

**Files:**
- Modify: `src/lib/osFormat.ts`
- Test: `src/lib/osFormat.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar a `src/lib/osFormat.test.js` (ao final do arquivo):

```js
describe('fmtHorasMin', () => {
  it('formata horas e minutos', () => {
    expect(fmtHorasMin(1.5)).toBe('1h 30min')
  })

  it('formata só horas quando minutos são zero', () => {
    expect(fmtHorasMin(2)).toBe('2h')
  })

  it('formata só minutos quando menos de 1 hora', () => {
    expect(fmtHorasMin(0.75)).toBe('45min')
  })

  it('usa valor absoluto (ignora sinal negativo)', () => {
    expect(fmtHorasMin(-1.5)).toBe('1h 30min')
  })
})
```

Confirmar que `fmtHorasMin` está importado no topo do arquivo de teste junto aos outros imports de `osFormat`.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/osFormat.test.js -t "fmtHorasMin"`
Expected: FAIL — `fmtHorasMin is not a function`

- [ ] **Step 3: Implementar `fmtHorasMin`**

Em `src/lib/osFormat.ts`, depois da função `calcDuracao` existente:

```ts
export function fmtHorasMin(absHoras: number): string {
  const mins = Math.round(Math.abs(absHoras) * 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h === 0 ? `${m}min` : m > 0 ? `${h}h ${m}min` : `${h}h`
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/osFormat.test.js -t "fmtHorasMin"`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/osFormat.ts src/lib/osFormat.test.js
git commit -m "feat: adiciona fmtHorasMin para formatar duração em horas/minutos"
```

---

## Task 6: Template Telegram `tgVTUrgente` + `chatKeyForFornecedor`

**Files:**
- Modify: `src/lib/tgTemplates.ts`
- Test: `src/lib/tgTemplates.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/tgTemplates.test.ts`, adicionar ao import do topo:

```ts
import {
  tgCriticas, tgEquipes, tgSLA, tgPulso,
  tgExecutadas, tgEquipeInativa, tgFilaResidual,
  tgVTUrgente, chatKeyForFornecedor,
} from './tgTemplates'
```

Adicionar um novo `describe` ao final do arquivo:

```ts
describe('tgVTUrgente', () => {
  it('inclui número da OS, cliente e equipe', () => {
    const os  = makeEnrichedOS({ numos: '7654321', nomecliente: 'Maria Souza', nomedaequipe: 'INST F01', servico: 'ASSISTENCIA - VT 24H' })
    const msg = tgVTUrgente(os)
    expect(msg).toContain('7654321')
    expect(msg).toContain('Maria Souza')
  })

  it('mostra "VIOLADO" quando _vtViolado é true', () => {
    const os  = makeEnrichedOS({ servico: 'ASSISTENCIA - VT 24H', datacadastro: daysAgo(2) })
    const msg = tgVTUrgente(os)
    expect(msg).toContain('VIOLADO')
  })
})

describe('chatKeyForFornecedor', () => {
  it('mapeia WES para "wes"', () => {
    expect(chatKeyForFornecedor(makeEnrichedOS({ nomedaequipe: 'EQUIPE F08' }))).toBe('wes')
  })

  it('mapeia Instacable para "instacable"', () => {
    expect(chatKeyForFornecedor(makeEnrichedOS({ nomedaequipe: 'EQUIPE F01' }))).toBe('instacable')
  })

  it('mapeia fornecedor desconhecido para "alertas"', () => {
    expect(chatKeyForFornecedor(makeEnrichedOS({ nomedaequipe: 'EQUIPE DESCONHECIDA' }))).toBe('alertas')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/tgTemplates.test.ts -t "tgVTUrgente|chatKeyForFornecedor"`
Expected: FAIL — `tgVTUrgente is not a function`

- [ ] **Step 3: Implementar `tgVTUrgente` e `chatKeyForFornecedor`**

Em `src/lib/tgTemplates.ts`, atualizar o import do topo para incluir `fmtHorasMin`:

```ts
import { shortEquipe, fmtHorasMin } from './osFormat'
```

Adicionar ao final do arquivo:

```ts
// ─── Template: VT Urgente (notificação manual de OS individual) ──────────────
export function tgVTUrgente(row: OSRow): string {
  const numos   = row.numos
  const cliente = esc(row.nomecliente ?? '(Sem nome)')
  const cidade  = esc(row.nomedacidade ?? '')
  const bairro  = esc(row.bairro ?? '')
  const equipe  = esc(shortEquipe(row.nomedaequipe) ?? 'Sem equipe')
  const tipo    = esc(row._slaTipoLabel ?? 'VT')
  const restante = row._vtHorasRestantes

  const statusLinha = restante == null
    ? ''
    : restante <= 0
      ? `🔴 <b>VIOLADO</b> há ${fmtHorasMin(restante)}`
      : `🟠 Faltam <b>${fmtHorasMin(restante)}</b>`

  let m = `🚨 <b>${EMP} — OS URGENTE (${tipo})</b>\n`
  m += `${DIV}\n\n`
  m += `<b>OS ${numos}</b>  ·  ${equipe}\n`
  m += `${cliente}${cidade ? ' · ' + cidade : ''}${bairro ? ' · ' + bairro : ''}\n\n`
  if (statusLinha) m += `${statusLinha}\n\n`
  m += rod()
  return m
}

// ─── Roteamento de chat por fornecedor (Fila VT) ──────────────────────────────
export function chatKeyForFornecedor(row: OSRow): string {
  switch (row._fornecedor) {
    case 'WES':        return 'wes'
    case 'Instacable':  return 'instacable'
    case 'THM':         return 'thm'
    case 'REDE':        return 'rede'
    default:            return 'alertas'
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/tgTemplates.test.ts`
Expected: todos PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/tgTemplates.ts src/lib/tgTemplates.test.ts
git commit -m "feat: adiciona template tgVTUrgente e roteamento de chat por fornecedor"
```

---

## Task 7: Página `VTPriorityPage`

**Files:**
- Create: `src/features/erp/vt/VTPriorityPage.tsx`

- [ ] **Step 1: Criar o arquivo da página**

```tsx
import { useMemo, useState } from 'react'
import { AlertTriangle, Flame, Clock, CheckCircle2, Send, Check } from 'lucide-react'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { useAuditStore } from '../../../store/auditStore'
import { KPICard } from '../../../components/ui/KPICard'
import { FilterSelect } from '../../../components/ui/FilterSelect'
import { SearchBox } from '../../../components/ui/SearchBox'
import { DataTable } from '../../../components/ui/DataTable'
import { Badge } from '../../../components/ui/Badge'
import { shortEquipe, fmtHorasMin } from '../../../lib/osFormat'
import { tgVTUrgente, chatKeyForFornecedor } from '../../../lib/tgTemplates'
import { telegram } from '../../../lib/api'
import OSDrawer from '../../ordens/OSDrawer'
import type { OSRow } from '../../../lib/types'

type ColRender = (value: unknown, row: OSRow) => React.ReactNode

const tipoVTOptions = [
  { value: '8',  label: 'VT 08h' },
  { value: '24', label: 'VT 24h' },
  { value: '48', label: 'VT 48h' },
]

const fornecedorOptions = [
  { value: 'WES',        label: 'WES' },
  { value: 'Instacable', label: 'Instacable' },
  { value: 'THM',        label: 'THM' },
  { value: 'REDE',       label: 'Rede' },
  { value: 'MANUTENCAO', label: 'Manutenção' },
]

function tempoRestanteVariant(restante: number): 'red' | 'orange' | 'yellow' | 'green' {
  if (restante <= 0) return 'red'
  if (restante <= 2) return 'orange'
  if (restante <= 6) return 'yellow'
  return 'green'
}

function tempoRestanteLabel(restante: number): string {
  return restante <= 0
    ? `Violado há ${fmtHorasMin(restante)}`
    : `${fmtHorasMin(restante)} restantes`
}

export default function VTPriorityPage() {
  const { rows, isLoading } = useOSDerived()
  const logAudit = useAuditStore(s => s.log)

  const [tipoVT, setTipoVT]         = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [search, setSearch]         = useState('')
  const [drawerOS, setDrawerOS]     = useState<OSRow | null>(null)
  const [notified, setNotified]     = useState<Record<string, 'ok' | 'error' | undefined>>({})

  const filaVT = useMemo(() => {
    let fila = rows.filter(r => r._vtPrazoHoras != null && r._vtHorasRestantes != null)
    if (tipoVT)      fila = fila.filter(r => String(r._vtPrazoHoras) === tipoVT)
    if (fornecedor)  fila = fila.filter(r => r._fornecedor === fornecedor)
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      fila = fila.filter(r =>
        r.numos?.toLowerCase().includes(term) ||
        r.nomecliente?.toLowerCase().includes(term)
      )
    }
    return [...fila].sort((a, b) => (a._vtHorasRestantes ?? 0) - (b._vtHorasRestantes ?? 0))
  }, [rows, tipoVT, fornecedor, search])

  const kpis = useMemo(() => {
    const violadas = filaVT.filter(r => r._vtViolado).length
    const critico   = filaVT.filter(r => !r._vtViolado && (r._vtHorasRestantes ?? 99) <= 2).length
    const atencao    = filaVT.filter(r => !r._vtViolado && (r._vtHorasRestantes ?? 99) > 2 && (r._vtHorasRestantes ?? 99) <= 6).length
    const noPrazo    = filaVT.filter(r => !r._vtViolado && (r._vtHorasRestantes ?? 99) > 6).length
    return { violadas, critico, atencao, noPrazo }
  }, [filaVT])

  async function handleNotificar(row: OSRow, e: React.MouseEvent) {
    e.stopPropagation()
    const chat = chatKeyForFornecedor(row)
    try {
      await telegram.send(tgVTUrgente(row), chat)
      logAudit('Telegram enviado (VT urgente)', `OS ${row.numos} · ${chat}`, 'telegram')
      setNotified(prev => ({ ...prev, [row.numos]: 'ok' }))
    } catch {
      setNotified(prev => ({ ...prev, [row.numos]: 'error' }))
    } finally {
      setTimeout(() => setNotified(prev => ({ ...prev, [row.numos]: undefined })), 2000)
    }
  }

  const columns: { key?: string; label: string; render?: ColRender }[] = [
    { key: 'numos', label: 'Nº OS' },
    { key: 'nomecliente', label: 'Cliente' },
    { key: 'nomedacidade', label: 'Cidade' },
    { key: 'bairro', label: 'Bairro' },
    { key: 'nomedaequipe', label: 'Equipe', render: (v) => shortEquipe(v as string) },
    { key: '_vtPrazoHoras', label: 'Tipo VT', render: (v) => <Badge variant="cyan">VT {v as number}h</Badge> },
    {
      key: '_vtHorasRestantes', label: 'Tempo Restante',
      render: (v) => {
        const restante = v as number
        return <Badge variant={tempoRestanteVariant(restante)}>{tempoRestanteLabel(restante)}</Badge>
      },
    },
    {
      label: 'Ação',
      render: (_v, row) => {
        const st = notified[row.numos]
        return (
          <button
            onClick={(e) => handleNotificar(row, e)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium
                       text-muted hover:text-primary hover:bg-primary/10 transition-colors"
          >
            {st === 'ok' ? <Check size={12} className="text-green" /> : <Send size={12} />}
            {st === 'ok' ? 'Enviado' : 'Notificar'}
          </button>
        )
      },
    },
  ]

  if (isLoading) {
    return <div className="p-6 text-muted text-[12px]">Carregando fila VT…</div>
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-[20px] font-bold text-text">Fila de Prioridade VT</h1>
        <p className="text-[12px] text-muted mt-0.5">OS de Visita Técnica (08h/24h/48h) ordenadas por tempo restante até o vencimento do prazo</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KPICard title="Violadas" value={kpis.violadas} accent="red" icon={AlertTriangle} />
        <KPICard title="Crítico < 2h" value={kpis.critico} accent="orange" icon={Flame} />
        <KPICard title="Atenção < 6h" value={kpis.atencao} accent="yellow" icon={Clock} />
        <KPICard title="No prazo" value={kpis.noPrazo} accent="green" icon={CheckCircle2} />
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterSelect value={tipoVT} onChange={setTipoVT} options={tipoVTOptions} placeholder="Todos os tipos" className="w-40" />
        <FilterSelect value={fornecedor} onChange={setFornecedor} options={fornecedorOptions} placeholder="Todos os fornecedores" className="w-48" />
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por cliente ou nº OS…" className="w-64" />
      </div>

      {filaVT.length === 0 ? (
        <div className="rounded-xl bg-card border border-white/[0.08] p-12 text-center">
          <p className="text-[14px] text-secondary">Nenhuma OS de VT em aberto 🎉</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={filaVT} onRowClick={setDrawerOS} />
      )}

      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />
    </div>
  )
}
```

- [ ] **Step 2: Verificar que o build TypeScript não tem erros**

Run: `npm run build`
Expected: build conclui sem erros de TypeScript relacionados a `VTPriorityPage.tsx` (a página ainda não está roteada, então não aparece em nenhuma tela — isso só confirma que o arquivo compila)

- [ ] **Step 3: Commit**

```bash
git add src/features/erp/vt/VTPriorityPage.tsx
git commit -m "feat: adiciona página VTPriorityPage (Fila de Prioridade VT)"
```

---

## Task 8: Navegação — rota, lazy import e item de menu

**Files:**
- Modify: `src/pages/index.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Adicionar o lazy import**

Em `src/pages/index.ts`, depois da linha `export const ERPPlannerPage = lazy(...)`:

```ts
export const ERPVTPage = lazy(() => import('../features/erp/vt/VTPriorityPage'))
```

- [ ] **Step 2: Adicionar a rota**

Em `src/App.tsx`, dentro do bloco `<Route path="erp">` (depois da linha `<Route path="planner" element={<ERPPlannerPage />} />`):

```tsx
          <Route path="vt"           element={<ERPVTPage />}          />
```

- [ ] **Step 3: Adicionar o item de menu na Sidebar**

Em `src/components/layout/Sidebar.tsx`:

1. Adicionar `Siren` à lista de imports de ícones (linha 3-9), junto aos outros:

```tsx
import {
  LayoutDashboard, ClipboardList,
  BarChart2, PieChart, MapPin,
  Zap, Monitor, LogOut, FileText, Map,
  Bell, ChevronRight, Briefcase,
  TrendingUp, Award, CalendarDays, Shield, Siren,
} from 'lucide-react'
```

2. Adicionar o item ao array `links` do grupo `erp` (depois de `{ to: '/erp/planner', label: 'Planner', icon: CalendarDays },`):

```tsx
      { to: '/erp/vt',             label: 'Fila VT',       icon: Siren       },
```

- [ ] **Step 4: Rodar o build para confirmar que tudo compila**

Run: `npm run build`
Expected: build sem erros

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.ts src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: adiciona rota /erp/vt e item 'Fila VT' no menu ERP"
```

---

## Task 9: Verificação manual da página no navegador

**Files:** nenhum (apenas verificação)

- [ ] **Step 1: Rodar o servidor de desenvolvimento**

Run: `npm run dev`
Expected: servidor sobe em `http://localhost:3000` sem erros no terminal

- [ ] **Step 2: Verificar a página manualmente**

1. Abrir `http://localhost:3000` no navegador, fazer login se necessário
2. Clicar em "Fila VT" no menu ERP da sidebar
3. Confirmar que a página carrega, mostra os 4 KPIs no topo e a tabela (ou o estado vazio "Nenhuma OS de VT em aberto 🎉" se não houver OS de VT no momento)
4. Se houver OS na fila: confirmar que estão ordenadas por tempo restante (mais urgente primeiro) e que os badges de cor fazem sentido (vermelho = violado, etc.)
5. Clicar em uma linha → confirmar que o `OSDrawer` abre com os detalhes da OS
6. Clicar no botão "Notificar" de uma linha → confirmar que o ícone muda para "Enviado" por ~2s (ou erro, se o Telegram não estiver configurado no `.env` local — comportamento esperado nesse caso)

Não há passo de "fix" aqui — esta é uma verificação de fumaça. Se algo falhar, voltar à task correspondente.

---

## Task 10: Estado do monitor automático (backend)

**Files:**
- Modify: `cabonnet/state.py`

- [ ] **Step 1: Adicionar as novas variáveis de estado**

Em `cabonnet/state.py`, depois do bloco `_manut_vistos`/`_manut_vistos_data` (depois da linha 44):

```python
# ── Estado do monitor de VT (Fila de Prioridade) ─────────────────────────────
_vt_alertados      = {}   # { numos(str): {"estagio": "risco"|"violado", "last_sent": datetime} }
_vt_alertados_data = None # date do último reset
```

- [ ] **Step 2: Commit**

```bash
git add cabonnet/state.py
git commit -m "feat: adiciona estado para o monitor de VT (Fila de Prioridade)"
```

---

## Task 11: Monitor de background `_vt_monitor_loop`

**Files:**
- Modify: `cabonnet/monitors.py`

- [ ] **Step 1: Atualizar os imports no topo do arquivo**

Em `cabonnet/monitors.py`, atualizar o import de `cabonnet.config` (linha 12-16) para incluir `TELEGRAM_CHAT_REDE`:

```python
from cabonnet.config import (
    TELEGRAM_CHAT_ALERTAS, TELEGRAM_CHAT_ID,
    TELEGRAM_CHAT_INSTACABLE, TELEGRAM_CHAT_WES, TELEGRAM_CHAT_REDE,
    TELEGRAM_CHAT_OPERACIONAL_THM,
)
```

Atualizar o import de `cabonnet.utils` (linha 19) para incluir `_parse_datetime_br`:

```python
from cabonnet.utils import _parse_data_br, _parse_datetime_br
```

Atualizar o import de `cabonnet.telegram` (linha 20-23) para incluir `_operadora_da_os`:

```python
from cabonnet.telegram import (
    _telegram_enabled, _telegram_send, _telegram_send_long,
    _tg_esc, _abrev_equipe, _is_campo, _TG_DIV, _operadora_da_os,
)
```

- [ ] **Step 2: Implementar `_enviar_alertas_vt` e `_vt_monitor_loop`**

Em `cabonnet/monitors.py`, adicionar ao final do arquivo:

```python
# ── Monitor de VT (Fila de Prioridade) ────────────────────────────────────────

_VT_CHAT_POR_OPERADORA = {
    "WES":        TELEGRAM_CHAT_WES,
    "INSTACABLE": TELEGRAM_CHAT_INSTACABLE,
    "REDE":       TELEGRAM_CHAT_REDE,
    "THM":        TELEGRAM_CHAT_OPERACIONAL_THM,
}


def _enviar_alertas_vt(items, tipo):
    """items: lista de (row, restante_h, prazo_h). tipo: 'violado' | 'risco'."""
    if not items:
        return

    agora  = datetime.now()
    por_op = {}
    for r, restante, prazo_h in items:
        op = _operadora_da_os(r) or "ALERTAS"
        por_op.setdefault(op, []).append((r, restante, prazo_h))

    for op, batch in por_op.items():
        chat   = _VT_CHAT_POR_OPERADORA.get(op, TELEGRAM_CHAT_ALERTAS)
        titulo = "🔴 VT VIOLADO" if tipo == "violado" else "🟠 VT EM RISCO"
        linhas = [f"{titulo} — {len(batch)} OS", f"<i>{agora.strftime('%d/%m/%Y às %H:%M')}</i>", _TG_DIV]
        for r, restante, prazo_h in batch[:10]:
            numos = _tg_esc(r.get("numos", "?"))
            cli   = _tg_esc((r.get("nomecliente") or "?")[:28])
            eq    = _tg_esc(_abrev_equipe(r.get("nomedaequipe", "")) or "Sem equipe")
            if restante <= 0:
                linhas.append(f"🔴 <b>OS {numos}</b> · VT {prazo_h}h · violado há {round(abs(restante), 1)}h · {cli} · {eq}")
            else:
                linhas.append(f"🟠 <b>OS {numos}</b> · VT {prazo_h}h · faltam {round(restante, 1)}h · {cli} · {eq}")
        if len(batch) > 10:
            linhas.append(f"<i>… +{len(batch) - 10} OS</i>")
        texto = "\n".join(linhas)
        _telegram_send(texto, chat_id_override=chat)
        if chat != TELEGRAM_CHAT_ALERTAS:
            _telegram_send(texto, chat_id_override=TELEGRAM_CHAT_ALERTAS)

    log.info("[VTMonitor] %s — %d OS notificadas", tipo, len(items))


def _vt_monitor_loop():
    log.info("[VTMonitor] Iniciado")
    while True:
        _time_mod.sleep(180)
        if not _telegram_enabled():
            continue
        try:
            hoje = date.today()
            if state._vt_alertados_data != hoje:
                state._vt_alertados = {}
                state._vt_alertados_data = hoje

            with state._dados_cache_lock:
                rows = list(state._dados_cache["agendado"])

            agora  = datetime.now()
            ativos = [r for r in rows if r.get("descsituacao") in ("Pendente", "Atendimento")]

            novas_viol  = []
            novas_risco = []

            for r in ativos:
                servico = (r.get("servico") or "").upper()
                if "VT 08H" in servico:
                    prazo_h = 8
                elif "VT 24H" in servico:
                    prazo_h = 24
                elif "VT 48H" in servico:
                    prazo_h = 48
                else:
                    continue

                numos = str(r.get("numos", ""))
                dt    = _parse_datetime_br(r.get("datacadastro", ""))
                if not dt:
                    continue
                aging_h   = (agora - dt).total_seconds() / 3600
                restante  = prazo_h - aging_h
                registro  = state._vt_alertados.get(numos)
                estagio_atual = registro["estagio"] if registro else None

                if restante <= 0:
                    if estagio_atual != "violado":
                        novas_viol.append((r, restante, prazo_h))
                        state._vt_alertados[numos] = {"estagio": "violado", "last_sent": agora}
                    else:
                        last_sent = registro["last_sent"]
                        if (agora - last_sent).total_seconds() >= 1800:
                            novas_viol.append((r, restante, prazo_h))
                            state._vt_alertados[numos] = {"estagio": "violado", "last_sent": agora}
                elif restante <= 4 and estagio_atual is None:
                    novas_risco.append((r, restante, prazo_h))
                    state._vt_alertados[numos] = {"estagio": "risco", "last_sent": agora}

            _enviar_alertas_vt(novas_viol, "violado")
            _enviar_alertas_vt(novas_risco, "risco")

        except Exception as ex:
            log.warning("[VTMonitor] Erro: %s", str(ex)[:120])
```

- [ ] **Step 3: Verificar que o módulo importa sem erros**

Run: `python -c "from cabonnet.monitors import _vt_monitor_loop, _enviar_alertas_vt; print('OK')"`
Expected: imprime `OK` sem `ImportError`/`SyntaxError`

- [ ] **Step 4: Rodar a suíte de testes Python para garantir que nada quebrou**

Run: `python -m pytest tests/python -v`
Expected: todos os testes existentes continuam PASS

- [ ] **Step 5: Commit**

```bash
git add cabonnet/monitors.py
git commit -m "feat: adiciona _vt_monitor_loop — alerta automático no Telegram para OS de VT em risco/violadas"
```

---

## Task 12: Registrar o thread do monitor no startup

**Files:**
- Modify: `cabonnet/app.py`

- [ ] **Step 1: Adicionar o import do novo monitor**

Em `cabonnet/app.py`, dentro de `lifespan`, atualizar o import de `cabonnet.monitors` (linha 237-244):

```python
    from cabonnet.monitors import (
        _atendimento_travado_loop,
        _fila_monitor_loop,
        _manut_monitor_loop,
        _resumo_scheduler_loop,
        _sem_exec_monitor_loop,
        _sla_monitor_loop,
        _vt_monitor_loop,
    )
```

- [ ] **Step 2: Registrar o thread**

No mesmo arquivo, dentro do bloco `if _telegram_enabled():` (depois da linha `threading.Thread(target=_sla_monitor_loop, ...)`):

```python
        threading.Thread(target=_vt_monitor_loop,          name="VTMonitor",         daemon=True).start()
```

- [ ] **Step 3: Verificar que o app inicia sem erros**

Run: `python -m pytest tests/python -v`
Expected: todos os testes PASS (a fixture `client` instancia o `app` completo, incluindo o `lifespan` — se o import ou o registro do thread tivesse erro de sintaxe, todos os testes falhariam)

- [ ] **Step 4: Commit**

```bash
git add cabonnet/app.py
git commit -m "feat: registra thread VTMonitor no startup do servidor"
```

---

## Task 13: Verificação manual end-to-end do monitor automático

**Files:** nenhum (apenas verificação)

- [ ] **Step 1: Rodar o servidor e observar os logs**

Run: `npm run dev`
Expected: no terminal (stdout do Python, visível via `servidor.js --dev`), aparece a linha `[VTMonitor] Iniciado` nos primeiros segundos (somente se `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` estiverem configurados no `.env` — caso contrário o monitor não inicia, comportamento esperado)

- [ ] **Step 2: Confirmar que o monitor não derruba o servidor**

Deixar o servidor rodando por alguns minutos (o loop dorme 180s antes do primeiro ciclo real de verificação) e confirmar nos logs que não aparecem exceptions repetidas com a tag `[VTMonitor] Erro:`. Uma ocorrência isolada não é necessariamente um bug (pode ser falta de configuração local de Telegram), mas erros repetidos a cada ciclo indicam problema na lógica.

Não há passo de "fix" aqui — esta é uma verificação de fumaça. Se algo falhar, voltar à Task 11.

---

## Self-Review (preenchido durante a escrita do plano)

- **Cobertura da spec:** Seção 0 → Tasks 1-2. Seção 1 → Tasks 3-4. Seção 2 → Tasks 7-9. Seção 3 → Task 6 (template) + Task 7 (botão). Seção 4 → Task 8. Seção 5 → Tasks 10-13. Todas as seções da spec têm task correspondente.
- **Sem placeholders:** todo código é completo e executável, sem TODO/TBD.
- **Consistência de tipos:** `_vtPrazoHoras`/`_vtHorasRestantes`/`_vtViolado` usam os mesmos nomes em `types.ts` (Task 4), `transform.ts` (Task 4), `tgTemplates.ts` (Task 6) e `VTPriorityPage.tsx` (Task 7). `chatKeyForFornecedor` e `tgVTUrgente` definidos na Task 6 são importados com os mesmos nomes na Task 7. `fmtHorasMin` definido na Task 5 é usado nas Tasks 6 e 7 com a mesma assinatura `(absHoras: number) => string`.
