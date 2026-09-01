# Design: Custo e meta de fornecedor persistidos no servidor

**Data:** 2026-07-31
**Status:** Aguardando decisão — duas opções de persistência abaixo

## Contexto

O menu Fornecedor tem dois valores editáveis pelo gestor:

| Valor | Onde vive hoje | Chave |
|---|---|---|
| Custo mensal por operadora | `localStorage` do navegador | `cabonnet-erp-v1` (`erpStore.ts:80`) |
| Meta de SLA por operadora | `localStorage` do navegador | `cabonnet-alert-store` (`alertStore.ts:118`) |

Consequência prática: **a única métrica financeira do sistema não é compartilhada nem auditável.** Quem digitou o custo vê "R$ 3.000 / OS"; qualquer outro gestor abre a mesma tela e vê `—`. Trocar de navegador, limpar cache ou usar outra máquina apaga o dado. Não há histórico, não há autoria, não há como saber quando o valor mudou.

Isso já era problema antes. Passou a ser urgente porque o PR #15 corrigiu o cálculo do custo por OS e expôs a variação de SLA contra o período anterior — ou seja, o número ficou confiável e comparável, e agora vale a pena guardá-lo.

## Achado técnico: o backend já tem tudo

O `CLAUDE.md` descreve `cabonnet_server.py` como "arquivo único, ~6600 linhas". **Está desatualizado.** O arquivo hoje tem 89 linhas e é só entrypoint; o servidor foi quebrado no pacote `cabonnet/` (20 módulos). Isto precisa ser corrigido no `CLAUDE.md` junto com esta entrega.

O que já existe e deve ser reaproveitado:

- **SQLite** em `_DB_PATH` (`cabonnet/config.py`), com 9 tabelas criadas via `CREATE TABLE IF NOT EXISTS` no bootstrap de `cabonnet/db.py`.
- **Padrão de tabela de cadastro** — ver `tecnicos` (`db.py:139`): chave textual, campos com `DEFAULT`, `atualizado_em TEXT NOT NULL`.
- **Padrão de rota** — FastAPI em `cabonnet/app.py`, com autorização por módulo:
  ```python
  @router.get("/api/tecnicos")
  async def list_tecnicos(_role: str = Depends(_require_modulo("erp_ranking"))):
      from cabonnet.db import _db_list_tecnicos
      return {"ok": True, "items": _db_list_tecnicos()}
  ```
- **Módulo de permissão `fornecedor`** já existe em `ALL_MODULOS` (`db.py:23`). Não é preciso criar nenhum módulo novo.

Ou seja: não há decisão de infraestrutura a tomar. A única decisão real é **o formato da tabela**, e ela determina o que o sistema vai conseguir responder no futuro.

## A decisão: com ou sem vigência

### Opção A — valor corrente

```sql
CREATE TABLE IF NOT EXISTS fornecedor_config (
    forn_key      TEXT PRIMARY KEY,       -- WES, Instacable, THM, REDE, MANUTENCAO, INTERNO
    custo_mensal  REAL    NOT NULL DEFAULT 0,
    meta_sla      INTEGER,                -- NULL = sem meta definida
    atualizado_em TEXT    NOT NULL,
    atualizado_por TEXT   NOT NULL DEFAULT ''
)
```

Uma linha por operadora, sobrescrita a cada edição.

**Resolve:** compartilhamento entre gestores, autoria da última alteração, sobrevivência a troca de navegador.

**Não resolve:** custo histórico. Ao analisar março com o custo de julho, o custo por OS de março sai errado — e sai errado *silenciosamente*, que é o mesmo modo de falha do defeito de unidade corrigido no PR #15.

**Custo:** ~1 tabela, 2 rotas, ~80 linhas de Python.

### Opção B — vigência por período

```sql
CREATE TABLE IF NOT EXISTS fornecedor_config (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    forn_key      TEXT    NOT NULL,
    custo_mensal  REAL    NOT NULL DEFAULT 0,
    meta_sla      INTEGER,
    vigente_de    TEXT    NOT NULL,       -- YYYY-MM-DD
    vigente_ate   TEXT,                   -- NULL = vigência aberta
    atualizado_em TEXT    NOT NULL,
    atualizado_por TEXT   NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_forn_config_vigencia
    ON fornecedor_config(forn_key, vigente_de);
```

Editar não sobrescreve: fecha a vigência anterior (`vigente_ate = hoje - 1`) e abre uma nova.

**Resolve:** tudo da Opção A, mais custo correto para qualquer período do passado, mais a pergunta "o custo desse fornecedor subiu quanto no ano?".

**Habilita depois:** as duas inovações de maior valor levantadas na avaliação — *custo evitável por revisita* (quanto uma revisita custou de fato, com o custo vigente na data) e *série temporal de custo por OS*. Nenhuma das duas é possível com a Opção A sem refazer a tabela.

**Custo:** ~1 tabela, 3 rotas, ~160 linhas de Python. A consulta por período vira `WHERE forn_key = ? AND vigente_de <= ? AND (vigente_ate IS NULL OR vigente_ate >= ?)`.

### Recomendação

**Opção B.** A diferença de esforço é de meio dia; a diferença de capacidade é permanente. E há um argumento específico do domínio: contrato de fornecedor de ISP muda de preço por aditivo, com data. Um modelo sem vigência não representa o contrato real — representa só o último valor digitado.

O contra-argumento honesto à B: se ninguém for analisar período passado com rigor financeiro, a vigência é complexidade sem uso. Quem decide isso é você, não o código.

## Escopo

Independente da opção escolhida:

- Tabela nova no bootstrap de `cabonnet/db.py`.
- Rotas `GET`/`POST` em `cabonnet/app.py`, ambas com `Depends(_require_modulo("fornecedor"))`. Escrita restrita a gestor, espelhando o `isGestor` que a UI já aplica nos inputs.
- Cliente em `src/api/`, com `keysToSnake`/`keysToCamel` conforme `rules/frontend-react/FRONTEND.md`.
- `erpStore.custoFornecedor` e `alertStore.metaSla` deixam de ser fonte da verdade e passam a ser cache hidratado do servidor.
- **Migração dos valores atuais:** no primeiro carregamento, se o servidor não tem registro e o `localStorage` tem, subir o valor local uma única vez e marcar como migrado. Sem isso, o custo que o gestor já digitou desaparece na entrega — regressão visível para quem mais usa a tela.
- Corrigir a descrição desatualizada do `cabonnet_server.py` no `CLAUDE.md`.

## Fora de escopo

- Custo por equipe (só por operadora, como hoje).
- Reajuste automático ou indexação.
- Tela dedicada de gestão de contratos — a edição continua inline na página de Fornecedor.

## Riscos

| Risco | Mitigação |
|---|---|
| Perda dos valores já digitados | Migração one-shot do `localStorage`, descrita acima |
| Escrita concorrente de dois gestores | Último a gravar vence, com `atualizado_por` registrado. Trava otimista é exagero para dois ou três usuários |
| SQLite com escrita concorrente | Já é a realidade das 9 tabelas existentes; o padrão de conexão de `db.py` é o mesmo |

## Perguntas abertas

1. **Opção A ou B?** — bloqueia o plano de implementação.
2. Se B: a vigência é diária ou mensal? Contrato de ISP costuma virar no dia 1º, o que favorece granularidade mensal e simplifica a consulta.
3. Meta de SLA deve seguir a mesma tabela do custo, ou é conceito separado? Elas têm ciclos de vida diferentes — meta é decisão interna, custo é contrato.
