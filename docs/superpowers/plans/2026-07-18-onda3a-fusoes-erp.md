# Redesign Enterprise — Onda 3a: Fusões de Telas ERP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir o grupo ERP da sidebar de 8 para 6 telas: remover Central de Ação (`/erp/acao`, redirect para `/`), fundir Produtividade em Planner (`/erp/produtividade` → `/erp/planner` com toggle Executado/Planejado) e consolidar Ranking de Técnicos como fonte única de desempenho por equipe (ganha colunas hoje só em Relatórios).

**Architecture:** Nenhuma tela sobrevivente muda de lógica de dado — só de composição. `RankingTecnicosPage` ganha uma função pura `buildRankingTecnicos` que cruza os mesmos dados já calculados por `derived.sla.semaforo` e `derived.revisitas.porEquipe` (mais o cálculo de execuções/fila que hoje só existe em `RelatoriosPage`). `Produtividade` e `Planner` viram dois arquivos de view (`PlannerExecutadoView.tsx`, `PlannerPlanejadoView.tsx`) por trás de uma casca `PlannerPage.tsx` com toggle — nenhum dos dois muda de comportamento interno, só perdem o próprio `<h1>` (a casca passa a ser dona do título de página). Permissões são por papel (`role_permissoes(role, modulo)` no SQLite, não por usuário) — a migração dos módulos removidos roda uma vez, de forma idempotente, dentro de `_db_init()`.

**Tech Stack:** React + TypeScript, Tailwind CSS, Vitest + @testing-library/react (frontend). Python stdlib + sqlite3, pytest (backend, `cabonnet/db.py`).

## Global Constraints

- Design sóbrio: tokens reais do `index.css`, Inter, cor apenas para status. Nenhuma mudança visual fora do escopo desta onda.
- Sem novas dependências de stack.
- `npm run build`, `npm run lint`, `npx tsc --noEmit` e **`npm run audit:ds`** devem ficar limpos antes de qualquer commit tocando `.tsx`/`.ts` — `audit:ds` ficou de fora das checagens da Onda 2 e um hex fora da baseline só foi pego pelo CI.
- `npm test` (suíte Vitest completa) e `pytest tests/python` (suíte Python completa) devem continuar 100% verdes após cada task.
- Nenhuma lógica de negócio nova é inventada — toda métrica nova em uma tela já existia calculada em outra; a fusão só reaproveita.
- Permissão é por **papel** (`gestor`/`operador`/`viewer`), nunca por usuário individual — não confundir com um cadastro por usuário ao migrar módulos.
- Ver spec completa: `docs/superpowers/specs/2026-07-18-onda3a-fusoes-erp-design.md`.

---

### Task 1: Backend — migração de permissões (remove `erp_produtividade` e `erp_acao`)

**Files:**
- Modify: `cabonnet/db.py:22-27` (`ALL_MODULOS`), `cabonnet/db.py:31-35` (`_DEFAULT_OPERADOR_MODULOS`), `cabonnet/db.py:39-160` (`_db_init`, adicionar chamada de migração no final)
- Test: `tests/python/test_permissoes.py` (adicionar casos novos ao arquivo existente)

**Interfaces:**
- Produces: `_db_migrate_onda3a_modulos()` — função nova, sem parâmetros, sem retorno, idempotente. Chamada dentro de `_db_init()` após a criação das tabelas.

**Contexto:** Onda 3a remove as telas Central de Ação (`erp_acao`) e Produtividade (`erp_produtividade`, fundida em `erp_planner`). Permissões são gravadas por papel em `role_permissoes(role, modulo)` — só `operador`/`viewer` têm linhas lá (`gestor` é tratado como "todos os módulos" direto em `_db_get_permissoes`, nunca lido da tabela). A migração precisa: para cada papel que tinha `erp_produtividade`, garantir `erp_planner`; para cada papel que tinha `erp_acao`, garantir `dashboard`; depois remover as duas entradas antigas. Rodar sempre no startup (idempotente — no segundo boot não encontra nada para migrar, é um no-op barato numa tabela pequena).

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `tests/python/test_permissoes.py`:

```python
def test_migra_erp_produtividade_para_erp_planner():
    db._db_set_permissoes("operador", ["dashboard", "erp_produtividade"])
    db._db_migrate_onda3a_modulos()
    modulos = db._db_get_permissoes("operador")
    assert "erp_produtividade" not in modulos
    assert "erp_planner" in modulos
    assert "dashboard" in modulos


def test_migra_erp_acao_para_dashboard():
    db._db_set_permissoes("viewer", ["erp_acao", "graficos"])
    db._db_migrate_onda3a_modulos()
    modulos = db._db_get_permissoes("viewer")
    assert "erp_acao" not in modulos
    assert "dashboard" in modulos
    assert "graficos" in modulos


def test_migracao_e_idempotente_e_nao_duplica_modulo_ja_presente():
    db._db_set_permissoes("operador", ["erp_produtividade", "erp_planner"])
    db._db_migrate_onda3a_modulos()
    db._db_migrate_onda3a_modulos()  # roda de novo, não deve quebrar nem duplicar
    modulos = db._db_get_permissoes("operador")
    assert modulos.count("erp_planner") == 1
    assert "erp_produtividade" not in modulos


def test_migracao_nao_afeta_papel_sem_modulos_antigos():
    db._db_set_permissoes("operador", ["dashboard", "erp_fila"])
    db._db_migrate_onda3a_modulos()
    assert set(db._db_get_permissoes("operador")) == {"dashboard", "erp_fila"}
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `pytest tests/python/test_permissoes.py -v -k migra`
Expected: FAIL com `AttributeError: module 'cabonnet.db' has no attribute '_db_migrate_onda3a_modulos'`.

- [ ] **Step 3: Atualizar `ALL_MODULOS` e os defaults, e implementar a migração**

Em `cabonnet/db.py`, substituir o bloco (linhas 22-36):

```python
ALL_MODULOS = [
    "dashboard", "ordens", "graficos", "cidades", "fornecedor", "juniper",
    "fechamento", "mapa", "noc",
    "erp_relatorios", "erp_alertas", "erp_produtividade", "erp_qualidade",
    "erp_planner", "erp_fila", "erp_ranking", "erp_acao",
]

# Defaults semeados no bootstrap — só o ponto de partida, ajustável depois pela
# própria tela de permissões.
_DEFAULT_OPERADOR_MODULOS = [
    "dashboard", "ordens", "cidades", "mapa", "juniper",
    "erp_relatorios", "erp_alertas", "erp_produtividade", "erp_qualidade",
    "erp_planner", "erp_fila", "erp_ranking", "erp_acao",
]
_DEFAULT_VIEWER_MODULOS = ["dashboard", "graficos", "cidades", "mapa"]
```

por:

```python
ALL_MODULOS = [
    "dashboard", "ordens", "graficos", "cidades", "fornecedor", "juniper",
    "fechamento", "mapa", "noc",
    "erp_relatorios", "erp_alertas", "erp_qualidade",
    "erp_planner", "erp_fila", "erp_ranking",
]

# Defaults semeados no bootstrap — só o ponto de partida, ajustável depois pela
# própria tela de permissões.
_DEFAULT_OPERADOR_MODULOS = [
    "dashboard", "ordens", "cidades", "mapa", "juniper",
    "erp_relatorios", "erp_alertas", "erp_qualidade",
    "erp_planner", "erp_fila", "erp_ranking",
]
_DEFAULT_VIEWER_MODULOS = ["dashboard", "graficos", "cidades", "mapa"]

# Onda 3a (2026-07): erp_produtividade fundido em erp_planner, erp_acao removido
# (redirect pra dashboard). Mapa usado por _db_migrate_onda3a_modulos() pra
# preservar o acesso de quem já tinha o módulo antigo liberado.
_MODULOS_RENOMEADOS_ONDA3A = {
    "erp_produtividade": "erp_planner",
    "erp_acao":          "dashboard",
}
```

Adicionar a função de migração logo após `_db_init` (antes de `_db_save_cache`, por volta da linha 161):

```python
def _db_migrate_onda3a_modulos():
    """Migração idempotente: para cada papel que tinha um módulo removido na
    Onda 3a (erp_produtividade, erp_acao), garante que o módulo substituto
    (erp_planner, dashboard) esteja liberado antes de apagar a entrada antiga.
    Roda no startup, toda vez — tabela pequena, no-op barato quando já migrado.
    Ver docs/superpowers/specs/2026-07-18-onda3a-fusoes-erp-design.md §4.4."""
    with state._db_lock:
        con = sqlite3.connect(_DB_PATH)
        for antigo, novo in _MODULOS_RENOMEADOS_ONDA3A.items():
            papeis = [r[0] for r in con.execute(
                "SELECT DISTINCT role FROM role_permissoes WHERE modulo=?", (antigo,)
            ).fetchall()]
            for papel in papeis:
                con.execute(
                    "INSERT OR IGNORE INTO role_permissoes (role, modulo) VALUES (?,?)",
                    (papel, novo)
                )
            con.execute("DELETE FROM role_permissoes WHERE modulo=?", (antigo,))
        con.commit()
        con.close()
```

Chamar a migração no final de `_db_init()`, logo após o `con.commit(); con.close()` da criação de tabelas (linha ~159-160):

```python
        con.commit()
        con.close()

    _db_migrate_onda3a_modulos()
```

(fora do `with state._db_lock:` do `_db_init`, já que `_db_migrate_onda3a_modulos` adquire o lock por conta própria).

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `pytest tests/python/test_permissoes.py -v`
Expected: PASS — todos os testes, incluindo os 4 novos.

Run: `pytest tests/python -v`
Expected: PASS — suíte Python completa, sem regressão em `test_db_usuarios.py`/`test_usuarios.py`.

- [ ] **Step 5: Commit**

```bash
git add cabonnet/db.py tests/python/test_permissoes.py
git commit -m "feat(auth): migra erp_produtividade->erp_planner e erp_acao->dashboard"
```

---

### Task 2: `sla.ts` — expor `agingMed` no semáforo

**Files:**
- Modify: `src/lib/builders/sla.ts:51`
- Modify: `src/lib/types.ts:227-233` (`SlaSemaforo`)
- Test: `src/lib/builders/sla.test.ts` (novo arquivo)

**Interfaces:**
- Produces: `SlaSemaforo.agingMed: number` — campo novo, consumido na Task 5 por `buildRankingTecnicos`.

**Contexto:** `buildSla` já calcula `agingMed` por equipe (linha 23 do arquivo), mas o array `semaforo` retornado (linha 51, o que `RankingTecnicosPage` e outras telas consomem via `derived.sla.semaforo`) não expõe esse campo. A Task 5 precisa dele para a coluna "Aging Médio" do Ranking consolidado — em vez de recalcular aging do zero na página de Ranking (duplicando lógica que já existe e já é usada por `AgingPanel`/`agingEq`), expomos o campo que já existe internamente.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/builders/sla.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSla } from './sla'
import type { OSRow } from '../types'

function makeRow(overrides: Partial<OSRow>): OSRow {
  return {
    numos: '1234567', nomedaequipe: 'F01 - JOAO', descsituacao: 'Pendente',
    nomecliente: 'Cliente', nomedacidade: 'SJC', tiposervico: 'Instalação',
    _tipo: 'INSTALACAO', _slaExcedido: false, _slaCritico: false, _aging: 0,
    ...overrides,
  } as OSRow
}

describe('buildSla — semaforo', () => {
  it('expõe agingMed por equipe no semaforo', () => {
    const rows = [
      makeRow({ nomedaequipe: 'F01 - JOAO', _aging: 4 }),
      makeRow({ nomedaequipe: 'F01 - JOAO', _aging: 6 }),
    ]
    const { semaforo } = buildSla(rows)
    const entry = semaforo.find(e => e.nome === 'F01 - JOAO')
    expect(entry?.agingMed).toBe(5)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/builders/sla.test.ts`
Expected: FAIL — `entry?.agingMed` é `undefined`, `expect(undefined).toBe(5)` falha.

- [ ] **Step 3: Expor `agingMed` no `semaforo` e no tipo `SlaSemaforo`**

Em `src/lib/builders/sla.ts:51`, trocar:

```ts
  const semaforo = equipes.map(e => ({ nome: e.nome, tipo: e.tipo, sla: e.sla, total: e.total, criticas: e.criticas }))
```

por:

```ts
  const semaforo = equipes.map(e => ({ nome: e.nome, tipo: e.tipo, sla: e.sla, total: e.total, criticas: e.criticas, agingMed: e.agingMed }))
```

Em `src/lib/types.ts:227-233`, trocar:

```ts
export interface SlaSemaforo {
  nome:     string
  tipo:     string
  sla:      number
  total:    number
  criticas: number
}
```

por:

```ts
export interface SlaSemaforo {
  nome:     string
  tipo:     string
  sla:      number
  total:    number
  criticas: number
  agingMed: number
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/builders/sla.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS — nenhuma regressão nas telas que já consomem `derived.sla.semaforo` (o campo é aditivo, não muda nada existente).

- [ ] **Step 5: Commit**

```bash
git add src/lib/builders/sla.ts src/lib/types.ts src/lib/builders/sla.test.ts
git commit -m "feat(sla): expoe agingMed no semaforo por equipe"
```

---

### Task 3: Frontend — remover módulos obsoletos de `modulos.ts`

**Files:**
- Modify: `src/lib/modulos.ts`

**Interfaces:**
- Produces: `MODULO_ROTA` sem as chaves `erp_produtividade` e `erp_acao`.

**Contexto:** Mapa módulo↔rota usado por `Sidebar.tsx` (`rotaParaModulo`) e pelas telas que checam permissão. Precisa ficar em sincronia com `ALL_MODULOS` do backend (Task 1). Sem teste dedicado — é uma constante estática sem lógica; a garantia de correção vem do build/lint (nenhuma rota vai referenciar uma chave que não existe mais) e das Tasks 4/8/9, que removem as rotas correspondentes.

- [ ] **Step 1: Remover as duas entradas**

Em `src/lib/modulos.ts`, trocar:

```ts
export const MODULO_ROTA: Record<string, string> = {
  dashboard:         '/',
  ordens:            '/ordens',
  graficos:          '/graficos',
  cidades:           '/cidades',
  fornecedor:        '/fornecedor',
  juniper:           '/juniper',
  fechamento:        '/fechamento',
  mapa:              '/mapa',
  noc:               '/noc',
  erp_relatorios:    '/erp/relatorios',
  erp_alertas:       '/erp/alertas',
  erp_produtividade: '/erp/produtividade',
  erp_qualidade:     '/erp/qualidade',
  erp_planner:       '/erp/planner',
  erp_fila:          '/erp/fila',
  erp_ranking:       '/erp/ranking',
  erp_acao:          '/erp/acao',
}
```

por:

```ts
export const MODULO_ROTA: Record<string, string> = {
  dashboard:         '/',
  ordens:            '/ordens',
  graficos:          '/graficos',
  cidades:           '/cidades',
  fornecedor:        '/fornecedor',
  juniper:           '/juniper',
  fechamento:        '/fechamento',
  mapa:              '/mapa',
  noc:               '/noc',
  erp_relatorios:    '/erp/relatorios',
  erp_alertas:       '/erp/alertas',
  erp_qualidade:     '/erp/qualidade',
  erp_planner:       '/erp/planner',
  erp_fila:          '/erp/fila',
  erp_ranking:       '/erp/ranking',
}
```

- [ ] **Step 2: Confirmar que nada mais referencia as chaves removidas ainda**

Run: `grep -rn "erp_produtividade\|erp_acao" src/ cabonnet/`
Expected neste ponto do plano: ainda aparecem em `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `src/pages/index.ts`, `src/features/erp/acao/`, `src/features/erp/produtividade/` — serão removidos nas Tasks 4, 8 e 9. Isso é esperado; só confirme que `src/lib/modulos.ts` não está mais na lista.

- [ ] **Step 3: Commit**

```bash
git add src/lib/modulos.ts
git commit -m "chore(modulos): remove erp_produtividade e erp_acao do mapa modulo->rota"
```

---

### Task 4: Remover Central de Ação

**Files:**
- Delete: `src/features/erp/acao/CentralAcaoPage.tsx`
- Modify: `src/pages/index.ts` (remover export `ERPCentralAcaoPage`)
- Modify: `src/App.tsx:69` (rota `acao` vira redirect)
- Modify: `src/components/layout/Sidebar.tsx` (remover item + import de ícone não usado)

**Interfaces:**
- Produces: nenhuma interface nova — só remoção. A rota `/erp/acao` passa a existir como redirect puro.

**Contexto:** Decisão aprovada — Central de Ação é 100% agregação de dado que já existe em `/erp/alertas` (motor de alertas já emite `equipe_parada`/`sem_equipe_4h`) e no Dashboard (Onda 2). Ver spec §4.3. Mesmo padrão de redirect já usado em `App.tsx:67` (`/erp/vt → /erp/fila`) e `App.tsx:82` (`/gerencial → /cidades`).

- [ ] **Step 1: Remover a rota real e adicionar o redirect**

Em `src/App.tsx`, localizar a linha (por volta de 69):

```tsx
          <Route path="acao"          element={<RequireModulo modulo="erp_acao">         <ERPCentralAcaoPage />  </RequireModulo>} />
```

Trocar por:

```tsx
          <Route path="acao"          element={<Navigate to="/" replace />} />
```

- [ ] **Step 2: Remover o import/export da página**

Em `src/pages/index.ts`, remover a linha:

```ts
export const ERPCentralAcaoPage = lazy(() => import('../features/erp/acao/CentralAcaoPage'))
```

Em `src/App.tsx`, remover `ERPCentralAcaoPage` da lista de imports vindos de `pages/index.ts` (o import é agregado — localizar a linha que importa `ERPCentralAcaoPage` junto dos demais `ERP*Page` e remover só esse nome da lista).

- [ ] **Step 3: Remover o item da sidebar e o ícone não usado**

Em `src/components/layout/Sidebar.tsx`, remover a linha:

```tsx
      { to: '/erp/acao',          label: 'Central de Ação', icon: ListTodo  },
```

E remover `ListTodo` do import de ícones (linha 8) — confirmar antes que não é usado em mais nenhum lugar do arquivo:

Run: `grep -n "ListTodo" "src/components/layout/Sidebar.tsx"`
Expected: só a linha do import (após a remoção acima, zero ocorrências fora do import) — remova `ListTodo` da lista de ícones importados de `lucide-react`.

- [ ] **Step 4: Deletar o arquivo da página**

```bash
git rm src/features/erp/acao/CentralAcaoPage.tsx
```

- [ ] **Step 5: Rodar build, lint e typecheck**

Run: `npm run build`
Expected: PASS — sem erro de import quebrado.

Run: `npm run lint`
Expected: PASS — sem `no-unused-vars` para `ListTodo`/`ERPCentralAcaoPage`.

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(erp): remove Central de Acao, /erp/acao vira redirect pra Dashboard"
```

---

### Task 5: Consolidar Ranking de Técnicos

**Files:**
- Modify: `src/features/erp/ranking/RankingTecnicosPage.tsx`
- Test: `src/features/erp/ranking/RankingTecnicosPage.test.ts` (novo arquivo — só testa a função pura exportada, não o componente)

**Interfaces:**
- Consumes: `derived.sla.semaforo: SlaSemaforo[]` (com `agingMed`, Task 2), `derived.revisitas.porEquipe: { equipe: string; taxa: number }[]` (já existente, sem mudança)
- Produces: `export function buildRankingTecnicos(rows: OSRow[], semaforo: SlaSemaforo[], revisitasPorEquipe: { equipe: string; taxa: number }[]): RankRow[]` — usado pela Task 5 e testável isoladamente.

**Contexto:** Decisão aprovada — Ranking de Técnicos vira fonte única de desempenho por equipe, ganhando execuções por tipo, OS na fila, SLA vencido e aging médio (hoje só em `RelatoriosPage`). Achado da spec (§4.2): "Críticas" (já existe, baseado em `_slaCritico` — aging > 2× o limite do SLA) e "SLA Vencido" (novo, baseado em `_slaExcedido`/`_slaSemAgend` — aging > 1× o limite) são métricas **diferentes**, não duplicadas — ambas ficam na tabela. O agrupamento é por `nomedaequipe` completo (como já faz esta página), não por `code` curto + array fixo `TEAMS` (como fazia `RelatoriosPage`) — isso preserva técnicos que não estão no array `TEAMS` fixo de `erpConstants.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/features/erp/ranking/RankingTecnicosPage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildRankingTecnicos } from './RankingTecnicosPage'
import type { OSRow } from '../../../lib/types'

function makeRow(overrides: Partial<OSRow>): OSRow {
  return {
    numos: '1234567', nomedaequipe: 'F01 - JOAO', descsituacao: 'Pendente',
    nomecliente: 'Cliente', nomedacidade: 'SJC', tiposervico: 'Instalação',
    _tipo: 'INSTALACAO', _slaExcedido: false, _slaSemAgend: false, _aging: 0,
    ...overrides,
  } as OSRow
}

describe('buildRankingTecnicos', () => {
  it('conta execucoes por tipo, fila e sla vencido por equipe', () => {
    const rows = [
      makeRow({ nomedaequipe: 'F01 - JOAO', descsituacao: 'Concluída', _tipo: 'INSTALACAO' }),
      makeRow({ nomedaequipe: 'F01 - JOAO', descsituacao: 'Concluída', _tipo: 'MANUTENCAO' }),
      makeRow({ nomedaequipe: 'F01 - JOAO', descsituacao: 'Pendente',  _slaExcedido: true }),
      makeRow({ nomedaequipe: 'F01 - JOAO', descsituacao: 'Atendimento' }),
    ]
    const [row] = buildRankingTecnicos(rows, [], [])
    expect(row.nome).toBe('F01 - JOAO')
    expect(row.execInst).toBe(1)
    expect(row.execManut).toBe(1)
    expect(row.execServico).toBe(0)
    expect(row.queue).toBe(2)
    expect(row.slaVenc).toBe(1)
  })

  it('cruza sla e aging medio vindos do semaforo, mesmo sem OS ativas', () => {
    const semaforo = [{ nome: 'F04 - MARIA', tipo: 'INSTALACAO', sla: 82, total: 5, criticas: 1, agingMed: 3.5 }]
    const [row] = buildRankingTecnicos([], semaforo, [])
    expect(row.nome).toBe('F04 - MARIA')
    expect(row.sla).toBe(82)
    expect(row.criticas).toBe(1)
    expect(row.avgAging).toBe(3.5)
    expect(row.volume).toBe(0)
  })

  it('cruza taxa de retrabalho vinda de revisitas', () => {
    const revisitas = [{ equipe: 'F07 - PEDRO', taxa: 12 }]
    const [row] = buildRankingTecnicos([], [], revisitas)
    expect(row.nome).toBe('F07 - PEDRO')
    expect(row.taxaRevisita).toBe(12)
  })

  it('ignora linhas sem equipe atribuida', () => {
    const rows = [makeRow({ nomedaequipe: '' })]
    expect(buildRankingTecnicos(rows, [], [])).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/features/erp/ranking/RankingTecnicosPage.test.ts`
Expected: FAIL — `buildRankingTecnicos` não existe ainda (`SyntaxError`/`is not a function`).

- [ ] **Step 3: Implementar `buildRankingTecnicos` e consumir na página**

Em `src/features/erp/ranking/RankingTecnicosPage.tsx`, trocar o bloco de tipos e o `useMemo` de `ranking` (linhas 18-119 do arquivo atual) por:

```tsx
type SortKey = 'volume' | 'sla' | 'taxaRevisita' | 'criticas'

export interface RankRow {
  nome:         string
  volume:       number
  sla:          number | null
  criticas:     number
  taxaRevisita: number | null
  execInst:     number
  execManut:    number
  execServico:  number
  queue:        number
  slaVenc:      number
  avgAging:     number | null
}

interface SemaforoEntry { nome: string; sla: number; criticas: number; agingMed: number }
interface RevisitaEntry { equipe: string; taxa: number }

export function buildRankingTecnicos(
  rows: OSRow[],
  semaforo: SemaforoEntry[],
  revisitasPorEquipe: RevisitaEntry[]
): RankRow[] {
  const base = rows.filter(r => !isCOPE(r) && !isReagend(r))

  const volMap   = new Map<string, number>()
  const execMap  = new Map<string, { inst: number; manut: number; servico: number }>()
  const queueMap = new Map<string, number>()
  const slaVencMap = new Map<string, number>()

  for (const r of base) {
    const nome = (r.nomedaequipe || '').trim()
    if (!nome) continue

    if (isExecucaoReal(r.descsituacao)) {
      volMap.set(nome, (volMap.get(nome) ?? 0) + 1)
      const exec = execMap.get(nome) ?? { inst: 0, manut: 0, servico: 0 }
      if (r._tipo === 'INSTALACAO')      exec.inst++
      else if (r._tipo === 'MANUTENCAO') exec.manut++
      else                               exec.servico++
      execMap.set(nome, exec)
    }

    if (r.descsituacao === 'Pendente' || r.descsituacao === 'Atendimento') {
      queueMap.set(nome, (queueMap.get(nome) ?? 0) + 1)
      if (r._slaExcedido || r._slaSemAgend) {
        slaVencMap.set(nome, (slaVencMap.get(nome) ?? 0) + 1)
      }
    }
  }

  const slaMap = new Map(semaforo.map(e => [e.nome, e]))
  const revMap = new Map(revisitasPorEquipe.map(e => [e.equipe, e]))

  const nomes = new Set<string>([...volMap.keys(), ...slaMap.keys(), ...revMap.keys(), ...queueMap.keys()])

  return [...nomes].map(nome => {
    const exec = execMap.get(nome) ?? { inst: 0, manut: 0, servico: 0 }
    const sla  = slaMap.get(nome)
    return {
      nome,
      volume:       volMap.get(nome) ?? 0,
      sla:          sla?.sla ?? null,
      criticas:     sla?.criticas ?? 0,
      taxaRevisita: revMap.get(nome)?.taxa ?? null,
      execInst:     exec.inst,
      execManut:    exec.manut,
      execServico:  exec.servico,
      queue:        queueMap.get(nome) ?? 0,
      slaVenc:      slaVencMap.get(nome) ?? 0,
      avgAging:     sla?.agingMed ?? null,
    }
  })
}
```

No componente `RankingTecnicosPage`, trocar o `useMemo` que hoje monta `ranking` manualmente:

```tsx
  const ranking = useMemo<RankRow[]>(() => {
    const base = rows.filter(r => !isCOPE(r) && !isReagend(r))

    const volMap = new Map<string, number>()
    for (const r of base) {
      if (!isExecucaoReal(r.descsituacao)) continue
      const nome = (r.nomedaequipe || '').trim() || 'Sem equipe'
      volMap.set(nome, (volMap.get(nome) ?? 0) + 1)
    }

    const slaMap = new Map(derived.sla.semaforo.map(e => [e.nome, e]))
    const revMap = new Map(derived.revisitas.porEquipe.map(e => [e.equipe, e]))

    const nomes = new Set<string>([...volMap.keys(), ...slaMap.keys(), ...revMap.keys()])
    nomes.delete('Sem equipe')

    return [...nomes].map(nome => ({
      nome,
      volume:       volMap.get(nome) ?? 0,
      sla:          slaMap.get(nome)?.sla ?? null,
      criticas:     slaMap.get(nome)?.criticas ?? 0,
      taxaRevisita: revMap.get(nome)?.taxa ?? null,
    }))
  }, [rows, derived.sla.semaforo, derived.revisitas.porEquipe])
```

por:

```tsx
  const ranking = useMemo(
    () => buildRankingTecnicos(rows, derived.sla.semaforo, derived.revisitas.porEquipe),
    [rows, derived.sla.semaforo, derived.revisitas.porEquipe]
  )
```

Adicionar as 6 novas colunas na tabela — no `<thead>`, depois da coluna "Retrabalho" (após a `<th>` que faz `toggleSort('taxaRevisita')`), adicionar cabeçalhos sem sort (decisão de escopo: só as 4 colunas já existentes permanecem ordenáveis, as novas são só leitura — evita gold-plating fora do pedido):

```tsx
                <th className="px-4 py-3 text-right text-caption font-bold uppercase tracking-[0.05em] text-muted">Exec. Instalação</th>
                <th className="px-4 py-3 text-right text-caption font-bold uppercase tracking-[0.05em] text-muted">Exec. Manutenção</th>
                <th className="px-4 py-3 text-right text-caption font-bold uppercase tracking-[0.05em] text-muted">Exec. Serviço</th>
                <th className="px-4 py-3 text-right text-caption font-bold uppercase tracking-[0.05em] text-muted">OS na Fila</th>
                <th className="px-4 py-3 text-right text-caption font-bold uppercase tracking-[0.05em] text-muted">SLA Vencido</th>
                <th className="px-4 py-3 text-right text-caption font-bold uppercase tracking-[0.05em] text-muted">Aging Médio</th>
```

No `<tbody>`, depois da última `<td>` (coluna Retrabalho), adicionar:

```tsx
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text">{r.execInst || <span className="text-muted/40">—</span>}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text">{r.execManut || <span className="text-muted/40">—</span>}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text">{r.execServico || <span className="text-muted/40">—</span>}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text">{r.queue}</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.slaVenc > 0 ? <Badge variant="red" dot={false}>{r.slaVenc}</Badge> : <span className="text-muted/40">0</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted">
                    {r.avgAging != null ? `${r.avgAging.toFixed(1)}d` : '—'}
                  </td>
```

E atualizar o `colSpan` da linha de "Nenhum técnico..." de `5` para `11` (5 colunas originais + 6 novas).

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/features/erp/ranking/RankingTecnicosPage.test.ts`
Expected: PASS — os 4 casos.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/erp/ranking/RankingTecnicosPage.tsx src/features/erp/ranking/RankingTecnicosPage.test.ts
git commit -m "feat(ranking): consolida Ranking de Tecnicos como fonte unica de desempenho"
```

---

### Task 6: Remover tabela de ranking de `RelatoriosPage`

**Files:**
- Modify: `src/features/erp/relatorios/RelatoriosPage.tsx`

**Interfaces:** nenhuma — remoção de UI, o cálculo interno de `ranking`/`totals` continua existindo (alimenta "Produção Consolidada" e o PDF), só a `<table>` visual e os botões de export de ranking somem.

**Contexto:** Decisão aprovada — Relatórios mantém KPIs/gráficos/export, perde a tabela de ranking (que agora vive, consolidada, em `/erp/ranking`). O `useMemo` de `ranking` (linhas 130-160) e `totals` (linhas 162-178) continuam existindo porque `totals` alimenta a seção "Produção Consolidada do Período" que fica na tela. Só a seção "Ranking de Equipes" (linhas ~455-624, incluindo o `<table>` e os 3 botões CSV/PDF Escuro/PDF Claro) e a função `handleExportRanking` são removidas.

- [ ] **Step 1: Remover a seção "Ranking de Equipes" do JSX**

Em `src/features/erp/relatorios/RelatoriosPage.tsx`, remover todo o bloco desde:

```tsx
          {/* ── Ranking de equipes ── */}
          <div className="bg-elevated border border-white/[0.08] rounded-xl overflow-hidden">
```

até o fechamento correspondente dessa `<div>` (a que contém `<table>`, `<thead>`, `<tbody>` e `<tfoot>` do ranking — termina antes do próximo elemento irmão da seção seguinte). Usar a estrutura já lida do arquivo (linhas ~455 até o fechamento da `<div>` que engloba a tabela) como referência exata de onde cortar.

- [ ] **Step 2: Remover `handleExportRanking` e os botões que a chamam**

Remover a função:

```tsx
  function handleExportRanking() {
    exportCSV('ranking_equipes.csv', ranking.map(r => ({
      Equipe: r.code,
      Líder: r.leader,
      'Exec. Instalação': r.execInst,
      'Exec. Manutenção': r.execManut,
      'Exec. Serviço': r.execServico,
      'Exec. Total': r.execInst + r.execManut + r.execServico,
      'OS na Fila': r.queue,
      'SLA %': r.sla.toFixed(1),
      'SLA Vencido': r.criticas,
      'Aging Médio (d)': r.avgAging.toFixed(1),
    })))
  }
```

Se `exportCSV` (import de `./relatoriosUtils`) não for mais usado em nenhum outro lugar do arquivo, remover o import também — confirmar com:

Run: `grep -n "exportCSV" "src/features/erp/relatorios/RelatoriosPage.tsx"`
Expected: zero ocorrências após a remoção (se houver outro uso de `exportCSV` no arquivo, mantenha o import).

- [ ] **Step 3: Rodar build, lint e typecheck**

Run: `npm run build && npm run lint && npx tsc --noEmit`
Expected: PASS — sem variável/import não usado (`Download`, `Printer` de `lucide-react` também podem ficar órfãos se não usados em mais nenhum botão do arquivo; confirmar com `grep -n "Download\|Printer" src/features/erp/relatorios/RelatoriosPage.tsx` e remover do import se órfãos).

- [ ] **Step 4: Rodar a suíte de testes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/erp/relatorios/RelatoriosPage.tsx
git commit -m "refactor(relatorios): remove tabela de ranking, consolidada em /erp/ranking"
```

---

### Task 7: Remover ranking por equipe de `QualidadePage`

**Files:**
- Modify: `src/features/erp/qualidade/QualidadePage.tsx`

**Interfaces:** nenhuma — remoção de UI. `rankingEquipe` (useMemo, linhas 148-173) e `maxRev` (linha 208, derivado dele) deixam de ser necessários e são removidos junto.

**Contexto:** Decisão aprovada — Qualidade mantém gráfico diário de revisitas, causa-raiz e clientes crônicos (únicos), perde a seção "Ranking — Revisitas por Equipe" (linhas ~463-510), que duplicava a coluna "Retrabalho" já presente em `/erp/ranking` (mesma fonte, `derived.revisitas.porEquipe`).

- [ ] **Step 1: Remover a seção "Ranking — Revisitas por Equipe" do JSX**

Em `src/features/erp/qualidade/QualidadePage.tsx`, remover o bloco JSX da seção "Ranking por equipe" (a partir do comentário `{/* Ranking por equipe */}`, por volta da linha 467, até o fechamento do bloco `{rankingEquipe.length > 0 && (...)}`).

- [ ] **Step 2: Remover os cálculos que só alimentavam essa seção**

Remover o `useMemo` de `rankingEquipe` (linhas 148-173):

```tsx
  // Ranking por equipe — usa revisitasFiltradas vs total do mesmo tipo
  const rankingEquipe = useMemo(() => {
    const allRows = data?.rows ?? []
    const totalMap: Record<string, number> = {}
    const revMap:   Record<string, number> = {}

    for (const r of allRows) {
      const eq    = r.nomedaequipe || 'Sem equipe'
      const isRev = tipoAtivo === 'todos'
        ? (Number(r.revisita_inst) + Number(r.revisita_manut) + Number(r.revisita_serv)) > 0
        : tipoAtivo === 'instalacao' ? Number(r.revisita_inst)  === 1
        : tipoAtivo === 'manutencao' ? Number(r.revisita_manut) === 1
        :                               Number(r.revisita_serv)  === 1
      totalMap[eq] = (totalMap[eq] ?? 0) + 1
      if (isRev) revMap[eq] = (revMap[eq] ?? 0) + 1
    }
    return Object.entries(revMap)
      .map(([equipe, rev]) => ({
        equipe,
        total: totalMap[equipe] ?? 0,
        rev,
        taxa: totalMap[equipe] ? Math.round((rev / totalMap[equipe]) * 100) : 0,
      }))
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 15)
  }, [data, tipoAtivo])
```

E a linha `const maxRev = Math.max(1, ...rankingEquipe.map(e => e.rev))` (linha 208) — confirmar antes que `maxRev` não é usado em mais nenhum outro lugar do arquivo:

Run: `grep -n "maxRev" "src/features/erp/qualidade/QualidadePage.tsx"`
Expected: só a linha de declaração (a ser removida) — se aparecer em outro lugar, mantenha a declaração e só ajuste o que for necessário.

- [ ] **Step 3: Rodar build, lint e typecheck**

Run: `npm run build && npm run lint && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Rodar a suíte de testes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/erp/qualidade/QualidadePage.tsx
git commit -m "refactor(qualidade): remove ranking por equipe, consolidado em /erp/ranking"
```

---

### Task 8: Fundir Produtividade + Planner em `/erp/planner`

**Files:**
- Create: `src/features/erp/planner/PlannerModeToggle.tsx`
- Test: `src/features/erp/planner/PlannerModeToggle.test.tsx`
- Move: `src/features/erp/produtividade/ProdutividadePage.tsx` → `src/features/erp/planner/PlannerExecutadoView.tsx`
- Move: `src/features/erp/planner/PlannerPage.tsx` (conteúdo atual) → `src/features/erp/planner/PlannerPlanejadoView.tsx`
- Create: `src/features/erp/planner/PlannerPage.tsx` (casca nova)
- Delete: diretório `src/features/erp/produtividade/`

**Interfaces:**
- Produces: `PlannerModeToggle({ modo: 'executado' | 'planejado', onChange: (m: 'executado' | 'planejado') => void })` — componente puro, sem dependência de dado.
- `PlannerExecutadoView()` e `PlannerPlanejadoView()` — mesma assinatura de antes (sem props), só o nome muda.

**Contexto:** Ver spec §4.1. As duas telas têm fontes de dado e navegação incompatíveis (histórico com range global vs semana futura com offset) — a fusão não tenta unificar o controle de navegação, só insere um toggle no topo e cada modo mantém seu próprio bloco de controle e conteúdo. O `<h1>` de cada view sai (a casca passa a ser dona do título de página); o resto de cada view (KPIs, grid, IA, legenda) fica idêntico.

- [ ] **Step 1: Escrever o teste do toggle (falha)**

Criar `src/features/erp/planner/PlannerModeToggle.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlannerModeToggle } from './PlannerModeToggle'

describe('PlannerModeToggle', () => {
  it('mostra os dois modos e destaca o ativo', () => {
    render(<PlannerModeToggle modo="executado" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Executado' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Planejado' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('chama onChange com o modo clicado', () => {
    const onChange = vi.fn()
    render(<PlannerModeToggle modo="executado" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Planejado' }))
    expect(onChange).toHaveBeenCalledWith('planejado')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/features/erp/planner/PlannerModeToggle.test.tsx`
Expected: FAIL — módulo `./PlannerModeToggle` não existe.

- [ ] **Step 3: Implementar `PlannerModeToggle`**

Criar `src/features/erp/planner/PlannerModeToggle.tsx`:

```tsx
export type PlannerModo = 'executado' | 'planejado'

export function PlannerModeToggle({ modo, onChange }: { modo: PlannerModo; onChange: (m: PlannerModo) => void }) {
  const opcoes: { key: PlannerModo; label: string }[] = [
    { key: 'executado', label: 'Executado' },
    { key: 'planejado', label: 'Planejado' },
  ]
  return (
    <div className="flex gap-1 bg-elevated border border-white/[0.08] rounded-lg p-0.5">
      {opcoes.map(o => (
        <button
          key={o.key}
          type="button"
          aria-pressed={modo === o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all duration-150
            ${modo === o.key ? 'bg-primary/20 text-primary' : 'text-secondary hover:text-text hover:bg-surface/40'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/features/erp/planner/PlannerModeToggle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mover Produtividade para `PlannerExecutadoView`**

```bash
git mv src/features/erp/produtividade/ProdutividadePage.tsx src/features/erp/planner/PlannerExecutadoView.tsx
```

Em `src/features/erp/planner/PlannerExecutadoView.tsx`:

1. Renomear a função exportada de `export default function ProdutividadePage()` para `export default function PlannerExecutadoView()`.
2. Trocar o bloco de header (linhas ~510-516):

```tsx
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-headline font-bold text-text mb-0.5">Produtividade por Equipe</h1>
        <p className="text-label text-muted">
          Histórico de {days.length} dia{days.length > 1 ? 's' : ''} · OS executadas por equipe · expanda e clique no dia para ver as ordens
        </p>
      </div>
```

por (mantém a descrição dinâmica, remove o `<h1>` — a casca `PlannerPage` passa a ser dona do título):

```tsx
      {/* Descrição do período — título da página vem da casca PlannerPage */}
      <p className="text-label text-muted">
        Histórico de {days.length} dia{days.length > 1 ? 's' : ''} · OS executadas por equipe · expanda e clique no dia para ver as ordens
      </p>
```

3. Todos os imports relativos (`'../useERPRows'`, `'../../../store/uiStore'`, `'../../../lib/osFormat'`, `'../../../lib/transform'`, `'../../../components/ui/Badge'`, `'../../../lib/types'`, `'../../../hooks/useAIProdutividade'`) continuam corretos sem alteração — `planner/` está na mesma profundidade que `produtividade/` estava (`src/features/erp/<pasta>/`).

- [ ] **Step 6: Mover Planner (conteúdo atual) para `PlannerPlanejadoView`**

```bash
git mv src/features/erp/planner/PlannerPage.tsx src/features/erp/planner/PlannerPlanejadoView.tsx
```

Em `src/features/erp/planner/PlannerPlanejadoView.tsx`:

1. Renomear `export default function PlannerPage()` para `export default function PlannerPlanejadoView()`.
2. Trocar o bloco de header + navegação (linhas ~96-131):

```tsx
      {/* Header + navegação */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-headline font-bold text-text mb-0.5">Planner Semanal</h1>
          <p className="text-label text-muted">Clique em qualquer célula para ver as OS daquele dia</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
```

por (remove o `<h1>`, mantém a descrição e toda a navegação por semana):

```tsx
      {/* Navegação — título da página vem da casca PlannerPage */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-label text-muted">Clique em qualquer célula para ver as OS daquele dia</p>
        <div className="flex items-center gap-2 flex-wrap">
```

(o fechamento das duas `<div>` no final do bloco de navegação não muda — só a abertura perde um nível de aninhamento; ajustar o JSX para fechar corretamente as tags abertas.)

- [ ] **Step 7: Criar a casca `PlannerPage.tsx`**

Criar `src/features/erp/planner/PlannerPage.tsx`:

```tsx
import { useState } from 'react'
import { PlannerModeToggle, type PlannerModo } from './PlannerModeToggle'
import PlannerExecutadoView from './PlannerExecutadoView'
import PlannerPlanejadoView from './PlannerPlanejadoView'

export default function PlannerPage() {
  const [modo, setModo] = useState<PlannerModo>('executado')

  return (
    <div className="space-y-4 max-w-[1600px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-headline font-bold text-text mb-0.5">Planner de Equipes</h1>
          <p className="text-label text-muted">
            {modo === 'executado'
              ? 'Histórico de execuções por equipe'
              : 'Agenda futura por equipe — clique numa célula para ver as OS'}
          </p>
        </div>
        <PlannerModeToggle modo={modo} onChange={setModo} />
      </div>

      {modo === 'executado' ? <PlannerExecutadoView /> : <PlannerPlanejadoView />}
    </div>
  )
}
```

- [ ] **Step 8: Redirect da rota antiga**

Em `src/App.tsx`, trocar:

```tsx
          <Route path="produtividade" element={<RequireModulo modulo="erp_produtividade"><ERPProdutividadePage /></RequireModulo>} />
```

por:

```tsx
          <Route path="produtividade" element={<Navigate to="/erp/planner" replace />} />
```

Em `src/pages/index.ts`, remover a linha:

```ts
export const ERPProdutividadePage = lazy(() => import('../features/erp/produtividade/ProdutividadePage'))
```

E remover `ERPProdutividadePage` da lista de imports agregados em `src/App.tsx` (mesmo padrão da Task 4, Step 2).

- [ ] **Step 9: Remover o diretório antigo (se restou vazio)**

Run: `ls src/features/erp/produtividade/ 2>&1 || echo "diretorio ja vazio/removido"`
Expected: vazio (o `git mv` do Step 5 já moveu o único arquivo) — se sobrar algo (ex.: `__snapshots__`), mover ou remover conforme o conteúdo.

- [ ] **Step 10: Rodar build, lint e typecheck**

Run: `npm run build && npm run lint && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 11: Rodar a suíte de testes completa**

Run: `npm test`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(erp): funde Produtividade em Planner com toggle Executado/Planejado"
```

---

### Task 9: Sidebar final — remover item "Produtividade"

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:** nenhuma.

**Contexto:** Última referência de sidebar pendente após a Task 8 fundir as rotas — "Planner" já cobre os dois modos, não precisa de label nova (o toggle interno já comunica o modo).

- [ ] **Step 1: Remover o item "Produtividade" e o ícone órfão**

Em `src/components/layout/Sidebar.tsx`, remover a linha:

```tsx
      { to: '/erp/produtividade', label: 'Produtividade',  icon: TrendingUp  },
```

Confirmar se `TrendingUp` fica órfão:

Run: `grep -n "TrendingUp" "src/components/layout/Sidebar.tsx"`
Expected: zero ocorrências (após a remoção da linha acima) — remover `TrendingUp` do import de ícones de `lucide-react` (linha 8).

- [ ] **Step 2: Rodar build, lint e typecheck**

Run: `npm run build && npm run lint && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "chore(sidebar): remove item Produtividade, Planner cobre os dois modos"
```

---

### Task 10: Checagem final de regressão

**Files:** nenhum arquivo modificado — só validação.

**Contexto:** Última task do plano — roda a checklist completa de Global Constraints numa passada só, cobrindo tudo que as 9 tasks anteriores tocaram (backend + frontend).

- [ ] **Step 1: Suíte de testes completa (frontend e backend)**

Run: `npm test`
Expected: PASS — 100% verde.

Run: `pytest tests/python`
Expected: PASS — 100% verde.

- [ ] **Step 2: Build, lint, typecheck e auditoria de design system**

Run: `npm run build`
Expected: PASS.

Run: `npm run lint`
Expected: PASS — zero warning/erro.

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run audit:ds`
Expected: PASS — nenhum hex fora da baseline aprovada (achado da Onda 2: esse comando ficou de fora das checagens locais e só foi pego pelo CI).

- [ ] **Step 2: Confirmar que nenhuma referência às rotas/módulos removidos sobrou**

Run: `grep -rn "erp_produtividade\|erp_acao\|CentralAcaoPage\|ERPCentralAcaoPage\|ERPProdutividadePage" src/ cabonnet/`
Expected: nenhuma ocorrência.

- [ ] **Step 3: Confirmar visualmente as 3 mudanças no app rodando**

Run: `npm run dev`

No navegador:
1. Navegar para `/erp/acao` → confirmar redirect para `/`.
2. Navegar para `/erp/produtividade` → confirmar redirect para `/erp/planner`, com o toggle "Executado" ativo por padrão e a grade histórica visível.
3. Clicar em "Planejado" → confirmar troca para a grade semanal com navegação por seta e o botão "Definir Metas" (se logado como gestor).
4. Navegar para `/erp/ranking` → confirmar as 6 colunas novas (Exec. Instalação/Manutenção/Serviço, OS na Fila, SLA Vencido, Aging Médio) preenchidas.
5. Navegar para `/erp/relatorios` → confirmar que a seção "Ranking de Equipes" não aparece mais, mas "Produção Consolidada" continua.
6. Navegar para `/erp/qualidade` → confirmar que a seção de ranking por equipe não aparece mais, mas o gráfico diário/causa-raiz/crônicos continuam.
7. Checar a sidebar → grupo ERP deve ter 6 itens (Relatórios, Alertas, Ranking Técnicos, Qualidade, Planner, Fila de Prioridade), sem "Central de Ação" nem "Produtividade".

- [ ] **Step 4: Commit final (se algum ajuste foi necessário nesta task)**

```bash
git add -A
git commit -m "chore(erp): checagem final de regressao da Onda 3a"
```

(Se nada precisou de ajuste, não há commit nesta task — ela é só validação.)
