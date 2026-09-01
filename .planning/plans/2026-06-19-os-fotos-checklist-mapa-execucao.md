# OS Completa (Fotos/Checklist/Motivo) + Pin de Execução no Mapa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/detalhes` with fotos/checklist/motivo de inconclusão (Bloco A) and add a "pin de execução" layer to the Mapa (Bloco B), while fixing a pre-existing silent permission bug in the `mobile` schema queries.

**Architecture:** Backend (`cabonnet/grafana.py` + `cabonnet/app.py`) gains 3 new SQL templates and extends `/detalhes`, plus two new endpoints (`/detalhes/foto` for binary images, `/erp/os-execucao-geo` for map pins). Frontend extends `useOSDetails` with pure, testable mapping functions, adds 3 conditional sections to `OSDetailModal`, and adds a togglable Leaflet layer to `MapaPage` that reuses the existing `OSDrawer`.

**Tech Stack:** FastAPI (Python), Grafana Postgres datasource proxy, React + TanStack Query, react-leaflet, Vitest, pytest.

**Spec:** `.planning/specs/2026-06-19-os-fotos-checklist-mapa-execucao-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `cabonnet/grafana.py` (modify) | New SQL templates: `SQL_FOTOS_TEMPLATE`, `SQL_FOTO_BLOB_TEMPLATE`, `SQL_CHECKLIST_TEMPLATE`, `SQL_OS_EXECUCAO_GEO`; extend `SQL_DETALHES_TEMPLATE` |
| `cabonnet/app.py` (modify) | Fix silent `except`, extend `/detalhes`, new `/detalhes/foto`, new `/erp/os-execucao-geo` |
| `servidor.js` (modify) | Add `/erp` to `API_PREFIXES` so the new endpoint is proxied |
| `tests/python/test_query.py` (modify) | Tests for extended `/detalhes`, new `/detalhes/foto`, new `/erp/os-execucao-geo` |
| `tests/python/test_grafana_sql.py` (create) | Pure string tests for the new SQL templates |
| `src/lib/api.ts` (modify) | New endpoint paths + `osFotoUrl()` helper |
| `src/hooks/useOSDetails.ts` (modify) | Add `fotos`, `checklist`, `motivoInconclusivo` via new exported pure mapping functions |
| `src/hooks/useOSDetails.test.ts` (create) | Tests for the new pure mapping functions |
| `src/hooks/useOSExecucaoGeo.ts` (create) | React Query hook for the map pins |
| `src/hooks/useOSExecucaoGeo.test.ts` (create) | Tests for the pure row-parsing function |
| `src/features/ordens/OSDetailModal.tsx` (modify) | 3 new conditional sections + `FotoLightbox` sub-component |
| `src/features/ordens/OSDetailModal.test.tsx` (create) | Conditional-rendering tests (no pollution regression) |
| `src/features/mapa/MapaPage.tsx` (modify) | New toggle + marker layer + `OSDrawer` reuse |

---

## Task 1: Verificação pós-GRANT (gate manual — bloqueia Tasks 3-6 e 10-11 em produção)

Esta tarefa não é código — é uma verificação que só pode ser feita **depois** que o GRANT documentado na spec for aplicado pelo DBA do Interfocus. Os Tasks 2 a 11 abaixo podem ser implementados e commitados independentemente (o código já trata a ausência do GRANT como estado vazio, não erro), mas **não devem ser considerados "funcionando em produção" até este gate passar**.

**Arquivos:** nenhum (verificação via script ad-hoc, não versionado)

- [ ] **Step 1: Confirmar que o GRANT foi aplicado**

Rode (substituindo pelas credenciais reais do `.env`):

```bash
cd "C:\Cabonnet React" && python -c "
import sys
sys.path.insert(0, '.')
from cabonnet.grafana import grafana_post, frames_to_dict_list
data = grafana_post('SELECT count(*) AS n FROM mobile.vis_os_fotos')
print(frames_to_dict_list(data))
"
```

Esperado: uma lista com `{'n': '<algum número>'}`, sem `permission denied`.

- [ ] **Step 2: Validar a suposição de join `mo.codcidade = tablocal.codigo`**

A query `SQL_OS_EXECUCAO_GEO` (Task 6) assume que `mobile.vis_os_ordemservico.codcidade` é o mesmo código usado em `public.tablocal.codigo` (mesmo padrão de `public.ordemservico.cidade`). Confirme com:

```bash
cd "C:\Cabonnet React" && python -c "
import sys
sys.path.insert(0, '.')
from cabonnet.grafana import grafana_post, frames_to_dict_list
sql = '''
SELECT mo.codcidade, t.nome, count(*) AS n
FROM mobile.vis_os_ordemservico mo
JOIN public.tablocal t ON t.codigo = mo.codcidade
GROUP BY mo.codcidade, t.nome
ORDER BY n DESC
LIMIT 10
'''
print(frames_to_dict_list(grafana_post(sql)))
"
```

Esperado: nomes de cidade reconhecíveis (ex: `SAO JOSE DOS CAMPOS`) com contagens plausíveis. Se a saída vier vazia ou com nomes sem sentido, o join está errado — pare e ajuste `SQL_OS_EXECUCAO_GEO` (Task 6) para filtrar por `mo.nomecidade` (texto) em vez de `codcidade`, usando o valor exato observado em `mo.nomecidade` nesta mesma query (troque `t.nome` por `mo.nomecidade` no SELECT acima para inspecionar).

- [ ] **Step 3: Validar a suposição de `situacaoos = 2` para Atendimento**

```bash
cd "C:\Cabonnet React" && python -c "
import sys
sys.path.insert(0, '.')
from cabonnet.grafana import grafana_post, frames_to_dict_list
sql = '''
SELECT mo.situacaoos, count(*) AS n,
       count(mo.latitudeinicio) AS com_lat
FROM mobile.vis_os_ordemservico mo
GROUP BY mo.situacaoos
ORDER BY mo.situacaoos
'''
print(frames_to_dict_list(grafana_post(sql)))
"
```

Esperado: `situacaoos=2` deve ter uma fração razoável de linhas com `com_lat > 0` (OS em atendimento com ponto de início registrado). Se `situacaoos=2` tiver `com_lat=0` sempre, o pin de execução não terá dados — documente esse achado e ajuste a expectativa com o usuário antes de prosseguir para o Task 11.

- [ ] **Step 4: Documentar o resultado**

Adicione uma nota de rodapé no arquivo de spec (`.planning/specs/2026-06-19-os-fotos-checklist-mapa-execucao-design.md`) sob uma nova seção `## Verificação pós-GRANT (preenchido em <data>)` com os resultados dos Steps 1-3. Commit:

```bash
git add .planning/specs/2026-06-19-os-fotos-checklist-mapa-execucao-design.md
git commit -m "docs: registra verificação pós-GRANT do schema mobile"
```

---

## Task 2: Fix do log silencioso em `/detalhes`

**Files:**
- Modify: `cabonnet/app.py:726-739`
- Test: `tests/python/test_query.py`

- [ ] **Step 1: Escrever o teste que falha (verifica que o warning é logado quando a query de ocorrências falha)**

Adicione ao final de `tests/python/test_query.py`:

```python
from unittest.mock import patch


def _grafana_frame(fields_values):
    """Monta um payload Grafana válido a partir de {nome_coluna: [valores]}."""
    fields = [{"name": k} for k in fields_values]
    values = list(fields_values.values())
    return {"results": {"A": {"frames": [{"schema": {"fields": fields}, "data": {"values": values}}]}}}


def test_detalhes_loga_warning_quando_mobile_falha(client, caplog):
    """Quando as queries do schema mobile falham (ex: permission denied),
    o erro deve ser logado, não silenciado."""
    main_row = _grafana_frame({"numos": [9999999], "nomecliente": ["Cliente Teste"]})
    with patch(
        "cabonnet.app.grafana_post",
        side_effect=[
            main_row,
            Exception("permission denied for schema mobile"),  # ocorrencias
            Exception("permission denied for schema mobile"),  # equipe_reagendou
            Exception("permission denied for schema mobile"),  # materiais_utilizados
            Exception("permission denied for schema mobile"),  # materiais_retirados
            Exception("permission denied for schema mobile"),  # fotos
            Exception("permission denied for schema mobile"),  # checklist
        ],
    ):
        with caplog.at_level("WARNING"):
            r = client.get("/detalhes?numos=9999999")
    assert r.status_code == 200
    assert "permission denied" in caplog.text
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
cd "C:\Cabonnet React" && pytest tests/python/test_query.py::test_detalhes_loga_warning_quando_mobile_falha -v
```

Esperado: FAIL — `assert "permission denied" in caplog.text` falha porque hoje o `except Exception: pass` não loga nada.

- [ ] **Step 3: Corrigir `cabonnet/app.py`**

Leia o trecho atual antes de editar:

```python
        ocorrencias = []
        try: ocorrencias = frames_to_dict_list(grafana_post(SQL_OCORRENCIAS_TEMPLATE.format(numos=numos_int)))
        except Exception: pass
        equipe_reagendou = ""
        try:
            rows_er = frames_to_dict_list(grafana_post(SQL_EQUIPE_REAGENDOU_TEMPLATE.format(numos=numos_int)))
            if rows_er: equipe_reagendou = rows_er[0].get("descricao", "")
        except Exception: pass
        materiais_utilizados = []
        try: materiais_utilizados = frames_to_dict_list(grafana_post(SQL_MATERIAIS_UTILIZADOS_TEMPLATE.format(numos=numos_int)))
        except Exception: pass
        materiais_retirados = []
        try: materiais_retirados = frames_to_dict_list(grafana_post(SQL_MATERIAIS_RETIRADOS_TEMPLATE.format(numos=numos_int)))
        except Exception: pass
```

Substitua por (cada `except` agora loga):

```python
        ocorrencias = []
        try: ocorrencias = frames_to_dict_list(grafana_post(SQL_OCORRENCIAS_TEMPLATE.format(numos=numos_int)))
        except Exception: log.warning("Falha ao buscar ocorrências numos=%s", numos_int, exc_info=True)
        equipe_reagendou = ""
        try:
            rows_er = frames_to_dict_list(grafana_post(SQL_EQUIPE_REAGENDOU_TEMPLATE.format(numos=numos_int)))
            if rows_er: equipe_reagendou = rows_er[0].get("descricao", "")
        except Exception: log.warning("Falha ao buscar equipe_reagendou numos=%s", numos_int, exc_info=True)
        materiais_utilizados = []
        try: materiais_utilizados = frames_to_dict_list(grafana_post(SQL_MATERIAIS_UTILIZADOS_TEMPLATE.format(numos=numos_int)))
        except Exception: log.warning("Falha ao buscar materiais_utilizados numos=%s", numos_int, exc_info=True)
        materiais_retirados = []
        try: materiais_retirados = frames_to_dict_list(grafana_post(SQL_MATERIAIS_RETIRADOS_TEMPLATE.format(numos=numos_int)))
        except Exception: log.warning("Falha ao buscar materiais_retirados numos=%s", numos_int, exc_info=True)
```

- [ ] **Step 4: Rodar o teste de novo (ainda deve falhar — fotos/checklist ainda não existem, mas o `side_effect` do teste já assume 7 chamadas)**

```bash
cd "C:\Cabonnet React" && pytest tests/python/test_query.py::test_detalhes_loga_warning_quando_mobile_falha -v
```

Esperado: ainda FAIL, mas agora por `StopIteration` do `side_effect` (só 4 chamadas reais existem hoje, o mock previu 7). Isso é esperado — o teste só passará de verdade ao final do Task 4, quando as 7 chamadas existirem. **Não reverta o teste**, ele guia o Task 4.

- [ ] **Step 5: Commit parcial**

```bash
git add cabonnet/app.py tests/python/test_query.py
git commit -m "fix: loga warnings em vez de silenciar falhas de schema mobile em /detalhes"
```

---

## Task 3: Novos templates SQL (fotos, checklist, motivo, geo)

**Files:**
- Modify: `cabonnet/grafana.py`
- Create: `tests/python/test_grafana_sql.py`

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/python/test_grafana_sql.py`:

```python
# -*- coding: utf-8 -*-
"""Testes das novas SQL templates (Bloco A: fotos/checklist/motivo; Bloco B: geo)."""

from cabonnet.grafana import (
    SQL_CHECKLIST_TEMPLATE,
    SQL_DETALHES_TEMPLATE,
    SQL_FOTO_BLOB_TEMPLATE,
    SQL_FOTOS_TEMPLATE,
    SQL_OS_EXECUCAO_GEO,
)


def test_sql_fotos_template_referencia_tabela_e_numos():
    sql = SQL_FOTOS_TEMPLATE.format(numos=9999999)
    assert "mobile.vis_os_fotos" in sql
    assert "WHERE numos = 9999999" in sql
    assert "imagem" not in sql  # bytea nunca entra na listagem de metadados


def test_sql_foto_blob_template_referencia_numos_e_codfoto():
    sql = SQL_FOTO_BLOB_TEMPLATE.format(numos=9999999, codfoto=3)
    assert "mobile.vis_os_fotos" in sql
    assert "numos = 9999999" in sql
    assert "codfoto = 3" in sql
    assert "encode(imagem, 'base64')" in sql


def test_sql_checklist_template_referencia_tabela_e_numos():
    sql = SQL_CHECKLIST_TEMPLATE.format(numos=9999999)
    assert "mobile.vis_os_checklist_status" in sql
    assert "WHERE numos = 9999999" in sql


def test_sql_detalhes_template_inclui_join_motivo_inconclusivo():
    sql = SQL_DETALHES_TEMPLATE.format(numos=9999999)
    assert "mobile.vis_os_ordemservico" in sql
    assert "mobile.vis_os_motivosinconclusivos" in sql
    assert "motivoinconclusivo" in sql


def test_sql_os_execucao_geo_filtra_atendimento_e_cidades_vale():
    sql = SQL_OS_EXECUCAO_GEO
    assert "situacaoos = 2" in sql
    assert "TAUBATE" in sql and "SAO JOSE DOS CAMPOS" in sql
    assert "latitudeinicio" in sql and "longitudeinicio" in sql
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```bash
cd "C:\Cabonnet React" && pytest tests/python/test_grafana_sql.py -v
```

Esperado: FAIL com `ImportError: cannot import name 'SQL_FOTOS_TEMPLATE'` (os templates não existem ainda).

- [ ] **Step 3: Adicionar os novos templates em `cabonnet/grafana.py`**

Adicione após `SQL_DETALHES_TEMPLATE` (depois da linha `"""` que fecha o template, antes de `SQL_DIAG_TEMPLATE`):

```python
# ══════════════════════════════════════════════════════════════════════════════
#  SQL — FOTOS, CHECKLIST E MOTIVO DE INCONCLUSÃO (mobile schema)
# ══════════════════════════════════════════════════════════════════════════════
SQL_FOTOS_TEMPLATE = """
SELECT id, codfoto, nomearquivo, descricao, usuario, extensaoarquivo
FROM mobile.vis_os_fotos
WHERE numos = {numos}
ORDER BY id
"""

SQL_FOTO_BLOB_TEMPLATE = """
SELECT encode(imagem, 'base64') AS imagem_b64, extensaoarquivo
FROM mobile.vis_os_fotos
WHERE numos = {numos} AND codfoto = {codfoto}
LIMIT 1
"""

SQL_CHECKLIST_TEMPLATE = """
SELECT descricaoservico, descricaochecklist, checked
FROM mobile.vis_os_checklist_status
WHERE numos = {numos}
ORDER BY codigoservico, codigochecklist
"""

# ══════════════════════════════════════════════════════════════════════════════
#  SQL — PIN DE EXECUÇÃO (Bloco B: OS em Atendimento com ponto de início)
#  Suposições validadas no Task 1 da plan de implementação (mo.codcidade ==
#  tablocal.codigo; situacaoos=2 == Atendimento). Ajustar se a verificação
#  pós-GRANT indicar o contrário.
# ══════════════════════════════════════════════════════════════════════════════
SQL_OS_EXECUCAO_GEO = """
SELECT
  mo.numos,
  mo.latitudeinicio,
  mo.longitudeinicio,
  mo.equipeagendada
FROM mobile.vis_os_ordemservico mo
JOIN public.tablocal t ON t.codigo = mo.codcidade
WHERE mo.situacaoos = 2
  AND mo.latitudeinicio IS NOT NULL
  AND mo.longitudeinicio IS NOT NULL
  AND t.estado = 'SP'
  AND t.nome IN ('TAUBATE','TREMEMBE','SAO JOSE DOS CAMPOS','PINDAMONHANGABA','CACAPAVA')
"""
"""
```

Agora abra `SQL_DETALHES_TEMPLATE` (linha ~342-407) e modifique exatamente estas duas partes:

1. No `SELECT`, depois da linha `valordocontrato as valorcontrato` adicione (antes do fechamento de linha, mantendo a vírgula anterior):

```python
  ct.valordocontrato                                                     as valorcontrato,
  mi.descricao                                                           as motivoinconclusivo
```

2. No `FROM`, depois da linha `LEFT JOIN enderecos ende ...` adicione:

```python
  LEFT JOIN enderecos ende   ON ende.codigodacidade = ct.cidade AND ende.codigodologradouro = ct.enderecoconexao
  LEFT JOIN mobile.vis_os_ordemservico mo ON mo.numos = o.numos
  LEFT JOIN mobile.vis_os_motivosinconclusivos mi ON mi.id = mo.idmotivoinconclusivo
```

- [ ] **Step 4: Rodar os testes de novo**

```bash
cd "C:\Cabonnet React" && pytest tests/python/test_grafana_sql.py -v
```

Esperado: 5 PASSED.

- [ ] **Step 5: Rodar a suíte completa de Python para garantir que nada quebrou**

```bash
cd "C:\Cabonnet React" && pytest -v
```

Esperado: todos os testes existentes continuam passando (a query `SQL_DETALHES_TEMPLATE` mudou, mas `test_detalhes_numeric_numos_not_found` usa o mock `{}` e não depende do conteúdo da SQL).

- [ ] **Step 6: Commit**

```bash
git add cabonnet/grafana.py tests/python/test_grafana_sql.py
git commit -m "feat: adiciona templates SQL para fotos, checklist, motivo de inconclusão e pin de execução"
```

---

## Task 4: Estender `/detalhes` com fotos, checklist e motivo

**Files:**
- Modify: `cabonnet/app.py`
- Test: `tests/python/test_query.py`

- [ ] **Step 1: Atualizar o teste do Task 2 para refletir o payload final**

O teste `test_detalhes_loga_warning_quando_mobile_falha` (Task 2) já prevê 7 chamadas via `side_effect`. Adicione um novo teste ao lado dele em `tests/python/test_query.py` que confirma as 3 novas chaves no sucesso:

Reaproveite a fixture `client` já existente (ela é `scope="session"`, então o `with patch(...)` local sobrepõe o mock da fixture apenas durante o teste):

```python
def test_detalhes_inclui_fotos_checklist_e_motivo(client):
    main_row = _grafana_frame({
        "numos": [9999999],
        "nomecliente": ["Cliente Teste"],
        "motivoinconclusivo": ["Cliente ausente no local"],
    })
    fotos_frame = _grafana_frame({
        "id": [1], "codfoto": [10], "nomearquivo": ["foto1.jpg"],
        "descricao": ["Fachada"], "usuario": ["tecnico1"], "extensaoarquivo": ["jpg"],
    })
    checklist_frame = _grafana_frame({
        "descricaoservico": ["Instalação"],
        "descricaochecklist": ["Testou sinal de internet"],
        "checked": [True],
    })
    with patch(
        "cabonnet.app.grafana_post",
        side_effect=[
            main_row,
            Exception("sem ocorrencias"),
            Exception("sem equipe_reagendou"),
            Exception("sem materiais_utilizados"),
            Exception("sem materiais_retirados"),
            fotos_frame,
            checklist_frame,
        ],
    ):
        r = client.get("/detalhes?numos=9999999")
    assert r.status_code == 200
    data = r.json()
    assert data["motivoinconclusivo"] == "Cliente ausente no local"
    assert data["fotos"] == [
        {"id": 1, "codfoto": 10, "nomearquivo": "foto1.jpg", "descricao": "Fachada", "usuario": "tecnico1", "extensaoarquivo": "jpg"}
    ]
    assert data["checklist"] == [
        {"servico": "Instalação", "descricao": "Testou sinal de internet", "checked": True}
    ]


def test_detalhes_motivo_inconclusivo_null_quando_vazio(client):
    """frames_to_dict_list converte NULL em '' — o endpoint deve normalizar para None."""
    main_row = _grafana_frame({"numos": [8888888], "nomecliente": ["Outro Cliente"]})
    with patch(
        "cabonnet.app.grafana_post",
        side_effect=[main_row, Exception(), Exception(), Exception(), Exception(), {}, {}],
    ):
        r = client.get("/detalhes?numos=8888888")
    assert r.status_code == 200
    assert r.json()["motivoinconclusivo"] is None
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```bash
cd "C:\Cabonnet React" && pytest tests/python/test_query.py -k "fotos_checklist_e_motivo or motivo_inconclusivo_null or loga_warning" -v
```

Esperado: 3 FAILED — `KeyError: 'fotos'` (ainda não existe no retorno do endpoint).

- [ ] **Step 3: Editar `cabonnet/app.py` — adicionar import dos novos templates**

No bloco de import de `cabonnet.grafana` (linha ~60-81), adicione `SQL_CHECKLIST_TEMPLATE`, `SQL_FOTOS_TEMPLATE`, `SQL_FOTO_BLOB_TEMPLATE`, `SQL_OS_EXECUCAO_GEO` em ordem alfabética junto aos demais:

```python
from cabonnet.grafana import (
    SQL_AGENDADO,
    SQL_ATENDIMENTO,
    SQL_BACKLOG_TEMPLATE,
    SQL_CHECKLIST_TEMPLATE,
    SQL_DETALHES_TEMPLATE,
    SQL_EQUIPE_REAGENDOU_TEMPLATE,
    SQL_ERP_OS_CIDADES,
    SQL_ERP_OS_TOTAIS,
    SQL_FOTO_BLOB_TEMPLATE,
    SQL_FOTOS_TEMPLATE,
    SQL_FUTURO,
    SQL_MATERIAIS_RETIRADOS_TEMPLATE,
    SQL_MATERIAIS_UTILIZADOS_TEMPLATE,
    SQL_OCORRENCIAS_TEMPLATE,
    SQL_OS_EXECUCAO_GEO,
    SQL_PENDENTE,
    SQL_REVISITAS,
    SQL_REVISITAS_COM_OBS,
    build_atendimento_json,
    build_backlog_json,
    build_pares_revisita,
    frames_to_csv,
    frames_to_dict_list,
    grafana_post,
)
```

- [ ] **Step 4: Editar a função `/detalhes` em `cabonnet/app.py`**

Logo após o bloco de `materiais_retirados` (que já tem o `log.warning` do Task 2), adicione:

```python
        fotos = []
        try: fotos = frames_to_dict_list(grafana_post(SQL_FOTOS_TEMPLATE.format(numos=numos_int)))
        except Exception: log.warning("Falha ao buscar fotos numos=%s", numos_int, exc_info=True)
        checklist = []
        try: checklist = frames_to_dict_list(grafana_post(SQL_CHECKLIST_TEMPLATE.format(numos=numos_int)))
        except Exception: log.warning("Falha ao buscar checklist numos=%s", numos_int, exc_info=True)
        motivo_inconclusivo = os_data.get("motivoinconclusivo") or None
```

E altere o `return` final de:

```python
        return {"os": os_data, "reagendada": reagendada, "equipe_reagendou": equipe_reagendou,
                "ocorrencias": ocorrencias, "materiais_utilizados": materiais_utilizados,
                "materiais_retirados": materiais_retirados}
```

para:

```python
        return {"os": os_data, "reagendada": reagendada, "equipe_reagendou": equipe_reagendou,
                "ocorrencias": ocorrencias, "materiais_utilizados": materiais_utilizados,
                "materiais_retirados": materiais_retirados,
                "fotos": [{"id": f.get("id"), "codfoto": f.get("codfoto"), "nomearquivo": f.get("nomearquivo"),
                           "descricao": f.get("descricao") or None, "usuario": f.get("usuario"),
                           "extensaoarquivo": f.get("extensaoarquivo")} for f in fotos],
                "checklist": [{"servico": c.get("descricaoservico"), "descricao": c.get("descricaochecklist"),
                               "checked": bool(c.get("checked"))} for c in checklist],
                "motivoinconclusivo": motivo_inconclusivo}
```

- [ ] **Step 5: Rodar os testes**

```bash
cd "C:\Cabonnet React" && pytest tests/python/test_query.py -v
```

Esperado: todos PASSED, incluindo `test_detalhes_loga_warning_quando_mobile_falha` (Task 2 — agora as 7 chamadas no `side_effect` batem com as 7 chamadas reais do endpoint).

- [ ] **Step 6: Rodar a suíte completa**

```bash
cd "C:\Cabonnet React" && pytest -v
```

Esperado: todos os testes PASSED.

- [ ] **Step 7: Commit**

```bash
git add cabonnet/app.py tests/python/test_query.py
git commit -m "feat: /detalhes retorna fotos, checklist e motivo de inconclusão"
```

---

## Task 5: Novo endpoint `GET /detalhes/foto`

**Files:**
- Modify: `cabonnet/app.py`
- Test: `tests/python/test_query.py`

- [ ] **Step 1: Escrever os testes que falham**

Adicione a `tests/python/test_query.py`:

```python
import base64 as _b64


def test_detalhes_foto_parametros_invalidos_retorna_400(client):
    assert client.get("/detalhes/foto?numos=abc&codfoto=1").status_code == 400
    assert client.get("/detalhes/foto?numos=123&codfoto=abc").status_code == 400


def test_detalhes_foto_nao_encontrada_retorna_404(client):
    with patch("cabonnet.app.grafana_post", return_value={}):
        r = client.get("/detalhes/foto?numos=9999999&codfoto=1")
    assert r.status_code == 404


def test_detalhes_foto_retorna_bytes_corretos(client):
    fake_bytes = b"FAKEJPEGDATA12345"
    b64 = _b64.b64encode(fake_bytes).decode("ascii")
    frame = _grafana_frame({"imagem_b64": [b64], "extensaoarquivo": ["jpg"]})
    with patch("cabonnet.app.grafana_post", return_value=frame):
        r = client.get("/detalhes/foto?numos=9999999&codfoto=10")
    assert r.status_code == 200
    assert r.content == fake_bytes
    assert r.headers["content-type"] == "image/jpg"
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```bash
cd "C:\Cabonnet React" && pytest tests/python/test_query.py -k "detalhes_foto" -v
```

Esperado: 3 FAILED — `404 Not Found` (rota não existe).

- [ ] **Step 3: Adicionar o endpoint em `cabonnet/app.py`**

Logo após a função `detalhes` (depois do bloco `except Exception as ex: ... raise HTTPException(502, str(ex))`), adicione:

```python
@router.get("/detalhes/foto")
async def detalhes_foto(numos: str = "", codfoto: str = ""):
    if not numos.strip().isdigit() or not codfoto.strip().isdigit():
        raise HTTPException(400, "Parâmetros 'numos'/'codfoto' inválidos.")
    numos_int   = int(numos.strip())
    codfoto_int = int(codfoto.strip())
    try:
        rows = frames_to_dict_list(grafana_post(SQL_FOTO_BLOB_TEMPLATE.format(numos=numos_int, codfoto=codfoto_int)))
    except Exception as ex:
        log.exception("Erro /detalhes/foto numos=%s codfoto=%s", numos, codfoto)
        raise HTTPException(502, str(ex))
    if not rows or not rows[0].get("imagem_b64"):
        raise HTTPException(404, f"Foto {codfoto} da OS {numos} não encontrada.")
    img_bytes = _base64.b64decode(rows[0]["imagem_b64"])
    ext = (rows[0].get("extensaoarquivo") or "jpg").strip().lower().lstrip(".")
    return RawResponse(content=img_bytes, media_type=f"image/{ext}")
```

- [ ] **Step 4: Rodar os testes**

```bash
cd "C:\Cabonnet React" && pytest tests/python/test_query.py -k "detalhes_foto" -v
```

Esperado: 3 PASSED.

- [ ] **Step 5: Commit**

```bash
git add cabonnet/app.py tests/python/test_query.py
git commit -m "feat: novo endpoint GET /detalhes/foto serve imagem binária da OS"
```

---

## Task 6: Novo endpoint `GET /erp/os-execucao-geo` + proxy no servidor.js

**Files:**
- Modify: `cabonnet/app.py`
- Modify: `servidor.js:70`
- Test: `tests/python/test_query.py`

- [ ] **Step 1: Escrever os testes que falham**

Adicione a `tests/python/test_query.py`:

```python
def test_os_execucao_geo_retorna_lista_vazia_quando_sem_dados(client):
    with patch("cabonnet.app.grafana_post", return_value={}):
        r = client.get("/erp/os-execucao-geo")
    assert r.status_code == 200
    assert r.json() == []


def test_os_execucao_geo_retorna_pontos(client):
    frame = _grafana_frame({
        "numos": [9999999],
        "latitudeinicio": ["-23.1896"],
        "longitudeinicio": ["-45.8841"],
        "equipeagendada": ["F01 - Equipe Teste"],
    })
    with patch("cabonnet.app.grafana_post", return_value=frame):
        r = client.get("/erp/os-execucao-geo")
    assert r.status_code == 200
    assert r.json() == [{
        "numos": 9999999,
        "latitudeinicio": "-23.1896",
        "longitudeinicio": "-45.8841",
        "equipeagendada": "F01 - Equipe Teste",
    }]


def test_os_execucao_geo_degrada_sem_erro_quando_falha(client):
    with patch("cabonnet.app.grafana_post", side_effect=Exception("permission denied for schema mobile")):
        r = client.get("/erp/os-execucao-geo")
    assert r.status_code == 200
    assert r.json() == []
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```bash
cd "C:\Cabonnet React" && pytest tests/python/test_query.py -k "os_execucao_geo" -v
```

Esperado: 3 FAILED — `404 Not Found`.

- [ ] **Step 3: Adicionar o endpoint em `cabonnet/app.py`**

Logo após a função `detalhes_foto` (Task 5), adicione:

```python
@router.get("/erp/os-execucao-geo")
async def os_execucao_geo():
    try:
        rows = frames_to_dict_list(grafana_post(SQL_OS_EXECUCAO_GEO))
    except Exception:
        log.warning("Falha ao buscar os-execucao-geo", exc_info=True)
        return []
    return [
        {
            "numos":           r.get("numos"),
            "latitudeinicio":  r.get("latitudeinicio"),
            "longitudeinicio": r.get("longitudeinicio"),
            "equipeagendada":  r.get("equipeagendada"),
        }
        for r in rows
    ]
```

- [ ] **Step 4: Rodar os testes**

```bash
cd "C:\Cabonnet React" && pytest tests/python/test_query.py -k "os_execucao_geo" -v
```

Esperado: 3 PASSED.

- [ ] **Step 5: Adicionar `/erp` ao proxy do servidor Node**

Leia `servidor.js` linha 70 antes de editar — hoje é:

```js
const API_PREFIXES = ['/api', '/query', '/revisitas', '/backlog', '/atendimento', '/juniper', '/notify', '/detalhes', '/health', '/ai', '/grafana']
```

Troque por:

```js
const API_PREFIXES = ['/api', '/query', '/revisitas', '/backlog', '/atendimento', '/juniper', '/notify', '/detalhes', '/health', '/ai', '/grafana', '/erp']
```

Sem essa mudança, `GET /erp/os-execucao-geo` cai no catch-all do SPA em vez de chegar no FastAPI — confirme rodando `npm run dev` e checando `curl http://localhost:3000/erp/os-execucao-geo` retorna JSON (não HTML).

- [ ] **Step 6: Rodar a suíte completa de Python**

```bash
cd "C:\Cabonnet React" && pytest -v
```

Esperado: todos PASSED.

- [ ] **Step 7: Commit**

```bash
git add cabonnet/app.py servidor.js tests/python/test_query.py
git commit -m "feat: novo endpoint GET /erp/os-execucao-geo + proxy /erp no servidor Node"
```

---

## Task 7: Frontend — endpoints e helper de URL de foto

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Adicionar os novos paths ao objeto `endpoints`**

Em `src/lib/api.ts`, altere o objeto `endpoints` (linha 73-84) de:

```ts
export const endpoints = {
  query:            '/query',
  revisitas:        '/revisitas',
  revisitasDetalhe: '/revisitas-detalhe',
  backlog:          '/backlog',
  atendimento:      '/atendimento',
  juniper:          '/juniper',
  juniperHist:      '/juniper/historico',
  detalhes:         '/detalhes',
  health:           '/health',
  stats:            '/stats',
} as const
```

para:

```ts
export const endpoints = {
  query:            '/query',
  revisitas:        '/revisitas',
  revisitasDetalhe: '/revisitas-detalhe',
  backlog:          '/backlog',
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
```

`BASE` já está definido no topo do arquivo (linha 3) — `osFotoUrl` precisa dele porque vai direto num `<img src=...>`, sem passar pelo `request()` que já prefixa `BASE` internamente.

- [ ] **Step 2: Verificar que o projeto ainda compila**

```bash
cd "C:\Cabonnet React" && npm run build
```

Esperado: build sem erros de TypeScript.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: adiciona endpoints de foto e os-execucao-geo + helper osFotoUrl"
```

---

## Task 8: Frontend — `useOSDetails` com fotos/checklist/motivo

**Files:**
- Modify: `src/hooks/useOSDetails.ts`
- Create: `src/hooks/useOSDetails.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/hooks/useOSDetails.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapFotos, mapChecklist } from './useOSDetails'

describe('mapFotos', () => {
  it('mapeia fotos válidas filtrando entradas sem nomearquivo', () => {
    const raw = [
      { id: 1, codfoto: 10, nomearquivo: 'foto1.jpg', descricao: 'Fachada', usuario: 'tec1', extensaoarquivo: 'jpg' },
      { id: 2, codfoto: 11, nomearquivo: '', descricao: null, usuario: 'tec1', extensaoarquivo: 'jpg' },
    ]
    const result = mapFotos(raw)
    expect(result).toEqual([
      { codfoto: 10, nomearquivo: 'foto1.jpg', descricao: 'Fachada' },
    ])
  })

  it('retorna lista vazia quando raw não é array', () => {
    expect(mapFotos(undefined)).toEqual([])
    expect(mapFotos(null)).toEqual([])
  })
})

describe('mapChecklist', () => {
  it('mapeia itens de checklist com checked normalizado para boolean', () => {
    const raw = [
      { servico: 'Instalação', descricao: 'Testou sinal', checked: true },
      { servico: 'Instalação', descricao: 'Limpou local', checked: false },
    ]
    expect(mapChecklist(raw)).toEqual([
      { servico: 'Instalação', descricao: 'Testou sinal', checked: true },
      { servico: 'Instalação', descricao: 'Limpou local', checked: false },
    ])
  })

  it('retorna lista vazia quando raw não é array', () => {
    expect(mapChecklist(undefined)).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
cd "C:\Cabonnet React" && npx vitest run src/hooks/useOSDetails.test.ts
```

Esperado: FAIL — `mapFotos`/`mapChecklist` não são exportados ainda.

- [ ] **Step 3: Editar `src/hooks/useOSDetails.ts`**

Leia o arquivo atual (já carregado nesta sessão) antes de editar. Adicione, logo após a definição da interface `Material` (linha 64) e antes de `interface OSDetailsResult`:

```ts
export interface FotoMeta {
  codfoto:    number
  nomearquivo: string
  descricao:  string | null
}

export function mapFotos(raw: unknown): FotoMeta[] {
  if (!Array.isArray(raw)) return []
  return (raw as Record<string, unknown>[])
    .map(f => ({
      codfoto:     Number(f.codfoto ?? 0),
      nomearquivo: String(f.nomearquivo ?? '').trim(),
      descricao:   (f.descricao as string) || null,
    }))
    .filter(f => f.nomearquivo)
}

export interface ChecklistItem {
  servico:    string
  descricao:  string
  checked:    boolean
}

export function mapChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return []
  return (raw as Record<string, unknown>[]).map(c => ({
    servico:   String(c.servico ?? ''),
    descricao: String(c.descricao ?? ''),
    checked:   Boolean(c.checked),
  }))
}
```

Agora atualize a interface `OSDetailsResult` (linha 65-83), adicionando os 3 campos novos ao tipo de `details`:

```ts
interface OSDetailsResult {
  isLoading:          boolean
  error:              Error | null
  details: {
    historico:         HistoricoEntry[]
    obsTecnico:        string | null
    nomeTecnico:       string | null
    reagendada:        boolean
    equipeAgendada:    string | null
    equipeExecutou:    string | null
    equipeReagend:     string | null
    materiais:         Material[]
    materiaisRetirados:Material[]
    datacontratacao:   string | null
    datainstalacao:    string | null
    situacaocontrato:  number | null
    valorcontrato:     number | null
    fotos:              FotoMeta[]
    checklist:           ChecklistItem[]
    motivoInconclusivo:  string | null
  } | null
}
```

Por fim, no `return` final da função `useOSDetails` (linha 116-134), adicione os 3 campos ao objeto `details`:

```ts
  return {
    isLoading: false,
    error:     error as Error | null,
    details: {
      historico,
      obsTecnico,
      nomeTecnico,
      reagendada:        raw.reagendada === true || raw.reagendada === 'true',
      equipeAgendada:    (osObj.nomedaequipe   as string) || null,
      equipeExecutou:    (osObj.equipeexecutou as string) || null,
      equipeReagend:     (raw.equipe_reagendou as string) || null,
      materiais,
      materiaisRetirados,
      datacontratacao:   (osObj.datacontratacao as string) || null,
      datainstalacao:    (osObj.datainstalacao  as string) || null,
      situacaocontrato:  typeof osObj.situacaocontrato === 'number' ? osObj.situacaocontrato : null,
      valorcontrato:     typeof osObj.valorcontrato    === 'number' ? osObj.valorcontrato    : null,
      fotos:              mapFotos(raw.fotos),
      checklist:           mapChecklist(raw.checklist),
      motivoInconclusivo:  (raw.motivoinconclusivo as string) || null,
    },
  }
```

- [ ] **Step 4: Rodar o teste**

```bash
cd "C:\Cabonnet React" && npx vitest run src/hooks/useOSDetails.test.ts
```

Esperado: 4 PASSED.

- [ ] **Step 5: Build + suíte completa**

```bash
cd "C:\Cabonnet React" && npm run build && npm test
```

Esperado: build limpo, todos os testes passando.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useOSDetails.ts src/hooks/useOSDetails.test.ts
git commit -m "feat: useOSDetails mapeia fotos, checklist e motivo de inconclusão"
```

---

## Task 9: Frontend — `OSDetailModal` com 3 novas seções condicionais

**Files:**
- Modify: `src/features/ordens/OSDetailModal.tsx`
- Create: `src/features/ordens/OSDetailModal.test.tsx`

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/features/ordens/OSDetailModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OSDetailModal } from './OSDetailModal'
import type { OSRow } from '../../lib/types'

vi.mock('../../hooks/useOSDetails', () => ({ useOSDetails: vi.fn() }))
import { useOSDetails } from '../../hooks/useOSDetails'

const baseOS = { numos: '9999999', nomecliente: 'Cliente Teste', descsituacao: 'Concluída' } as unknown as OSRow

const emptyDetails = {
  fotos: [], checklist: [], motivoInconclusivo: null,
  historico: [], obsTecnico: null, nomeTecnico: null, reagendada: false,
  equipeAgendada: null, equipeExecutou: null, equipeReagend: null,
  materiais: [], materiaisRetirados: [], datacontratacao: null,
  datainstalacao: null, situacaocontrato: null, valorcontrato: null,
}

describe('OSDetailModal — seções condicionais novas', () => {
  it('não renderiza fotos/checklist/motivo quando vazios', () => {
    vi.mocked(useOSDetails).mockReturnValue({ isLoading: false, error: null, details: emptyDetails })
    render(<OSDetailModal os={baseOS} open onClose={() => {}} />)
    expect(screen.queryByText('Fotos da Execução')).not.toBeInTheDocument()
    expect(screen.queryByText('Checklist de Execução')).not.toBeInTheDocument()
    expect(screen.queryByText('Motivo de Inconclusão')).not.toBeInTheDocument()
  })

  it('renderiza motivo de inconclusão quando presente', () => {
    vi.mocked(useOSDetails).mockReturnValue({
      isLoading: false, error: null,
      details: { ...emptyDetails, motivoInconclusivo: 'Cliente ausente' },
    })
    render(<OSDetailModal os={baseOS} open onClose={() => {}} />)
    expect(screen.getByText('Motivo de Inconclusão')).toBeInTheDocument()
    expect(screen.getByText('Cliente ausente')).toBeInTheDocument()
  })

  it('renderiza checklist quando presente', () => {
    vi.mocked(useOSDetails).mockReturnValue({
      isLoading: false, error: null,
      details: { ...emptyDetails, checklist: [{ servico: 'Instalação', descricao: 'Testou sinal', checked: true }] },
    })
    render(<OSDetailModal os={baseOS} open onClose={() => {}} />)
    expect(screen.getByText('Checklist de Execução')).toBeInTheDocument()
    expect(screen.getByText('Testou sinal')).toBeInTheDocument()
  })

  it('renderiza grid de fotos quando presente e abre lightbox ao clicar', async () => {
    vi.mocked(useOSDetails).mockReturnValue({
      isLoading: false, error: null,
      details: { ...emptyDetails, fotos: [{ codfoto: 10, nomearquivo: 'foto1.jpg', descricao: 'Fachada' }] },
    })
    render(<OSDetailModal os={baseOS} open onClose={() => {}} />)
    expect(screen.getByText('Fotos da Execução')).toBeInTheDocument()
    expect(screen.getByAltText('Fachada')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```bash
cd "C:\Cabonnet React" && npx vitest run src/features/ordens/OSDetailModal.test.tsx
```

Esperado: FAIL — `screen.getByText('Motivo de Inconclusão')` não encontra nada (seções não existem ainda).

- [ ] **Step 3: Editar `src/features/ordens/OSDetailModal.tsx`**

Adicione os imports no topo do arquivo (após a linha `import type { OSRow } from '../../lib/types'`):

```tsx
import { useState } from 'react'
import { Image as ImageIcon, CheckSquare, Square, XCircle } from 'lucide-react'
import { useOSDetails } from '../../hooks/useOSDetails'
import { osFotoUrl } from '../../lib/api'
```

Adicione o componente `FotoLightbox` depois de `SectionDivider` (antes de `interface OSDetailModalProps`):

```tsx
function FotoLightbox({ numos, foto, onClose }: {
  numos: string | number
  foto:  { codfoto: number; nomearquivo: string; descricao: string | null } | null
  onClose: () => void
}) {
  if (!foto) return null
  return (
    <Modal open={!!foto} onClose={onClose} title={foto.descricao || foto.nomearquivo} maxWidth="900px">
      <div className="p-4 flex items-center justify-center bg-black/40">
        <img
          src={osFotoUrl(numos, foto.codfoto)}
          alt={foto.descricao || foto.nomearquivo}
          className="max-h-[70vh] max-w-full object-contain rounded-lg"
        />
      </div>
    </Modal>
  )
}
```

Altere a assinatura de `OSDetailModal` para usar `useOSDetails` e `useState`. Troque:

```tsx
export function OSDetailModal({ os: osRow, open, onClose }: OSDetailModalProps) {
  if (!osRow) return null
   
  const os: any = osRow
  const fornLabel = (FORN_LABEL as Record<string, string>)[os._fornecedor] ?? os._fornecedor ?? '—'

  return (
    <Modal open={open} onClose={onClose}
```

por:

```tsx
export function OSDetailModal({ os: osRow, open, onClose }: OSDetailModalProps) {
  const [lightboxFoto, setLightboxFoto] = useState<{ codfoto: number; nomearquivo: string; descricao: string | null } | null>(null)
  const { details } = useOSDetails(osRow?.numos)

  if (!osRow) return null

  const os: any = osRow
  const fornLabel = (FORN_LABEL as Record<string, string>)[os._fornecedor] ?? os._fornecedor ?? '—'
  const fotos              = details?.fotos              ?? []
  const checklist           = details?.checklist           ?? []
  const motivoInconclusivo  = details?.motivoInconclusivo  ?? null

  return (
    <>
    <Modal open={open} onClose={onClose}
```

Note que o hook é chamado **antes** do early-return `if (!osRow) return null` — isso respeita as Regras de Hooks do React (hooks nunca podem vir depois de um return condicional). `useOSDetails(undefined)` já é um caso tratado (`enabled: !!numos`).

Agora, no final do corpo do modal, **antes** do fechamento `</div>\n      </div>\n    </Modal>` (final do bloco de Observações, linha ~163-165), adicione as 3 novas seções:

```tsx
        {/* Motivo de Inconclusão */}
        {motivoInconclusivo && (
          <div>
            <SectionDivider>Motivo de Inconclusão</SectionDivider>
            <div className="bg-yellow/[0.07] border border-yellow/25 rounded-xl p-4 flex items-start gap-2.5">
              <XCircle size={15} className="text-yellow flex-shrink-0 mt-0.5" />
              <p className="text-[13px] text-yellow/90 leading-relaxed">{motivoInconclusivo}</p>
            </div>
          </div>
        )}

        {/* Checklist de Execução */}
        {checklist.length > 0 && (
          <div>
            <SectionDivider>Checklist de Execução</SectionDivider>
            <div className="space-y-1.5">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 bg-surface/30 border border-white/[0.08] rounded-lg px-3 py-2">
                  {item.checked
                    ? <CheckSquare size={13} className="text-green flex-shrink-0" />
                    : <Square size={13} className="text-muted/50 flex-shrink-0" />}
                  <span className="text-[12px] text-secondary flex-1">{item.descricao}</span>
                  <span className="text-[10px] text-muted">{item.servico}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fotos da Execução */}
        {fotos.length > 0 && (
          <div>
            <SectionDivider>Fotos da Execução</SectionDivider>
            <div className="grid grid-cols-4 gap-2">
              {fotos.map(foto => (
                <button
                  key={foto.codfoto}
                  onClick={() => setLightboxFoto(foto)}
                  className="aspect-square rounded-lg border border-white/[0.08] overflow-hidden bg-surface/30
                             hover:border-primary/40 transition-colors"
                >
                  <img
                    src={osFotoUrl(os.numos, foto.codfoto)}
                    alt={foto.descricao || foto.nomearquivo}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15' }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
```

E troque o fechamento final do componente de:

```tsx
      </div>
    </Modal>
  )
}
```

para:

```tsx
      </div>
    </Modal>
    <FotoLightbox numos={os.numos} foto={lightboxFoto} onClose={() => setLightboxFoto(null)} />
    </>
  )
}
```

`ImageIcon` foi importado mas não usado nas seções acima — remova-o do import (era um aceno a um ícone de cabeçalho de seção que não é necessário; `SectionDivider` já cobre o título). Import final:

```tsx
import { CheckSquare, Square, XCircle } from 'lucide-react'
```

- [ ] **Step 4: Rodar os testes**

```bash
cd "C:\Cabonnet React" && npx vitest run src/features/ordens/OSDetailModal.test.tsx
```

Esperado: 4 PASSED.

- [ ] **Step 5: Build + suíte completa**

```bash
cd "C:\Cabonnet React" && npm run build && npm test
```

Esperado: build limpo (sem `any` novos além do já existente no arquivo), todos os testes passando.

- [ ] **Step 6: Commit**

```bash
git add src/features/ordens/OSDetailModal.tsx src/features/ordens/OSDetailModal.test.tsx
git commit -m "feat: OSDetailModal exibe fotos, checklist e motivo de inconclusão"
```

---

## Task 10: Frontend — hook `useOSExecucaoGeo`

**Files:**
- Create: `src/hooks/useOSExecucaoGeo.ts`
- Create: `src/hooks/useOSExecucaoGeo.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/hooks/useOSExecucaoGeo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseExecucaoGeoRow } from './useOSExecucaoGeo'

describe('parseExecucaoGeoRow', () => {
  it('parseia uma linha válida', () => {
    const result = parseExecucaoGeoRow({
      numos: 9999999, latitudeinicio: '-23.1896', longitudeinicio: '-45.8841',
      equipeagendada: 'F01 - Equipe Teste',
    })
    expect(result).toEqual({ numos: '9999999', lat: -23.1896, lng: -45.8841, equipeagendada: 'F01 - Equipe Teste' })
  })

  it('retorna null quando latitude/longitude ausentes', () => {
    expect(parseExecucaoGeoRow({ numos: 1, latitudeinicio: null, longitudeinicio: null })).toBeNull()
  })

  it('retorna null quando latitude/longitude são zero (coordenada inválida)', () => {
    expect(parseExecucaoGeoRow({ numos: 1, latitudeinicio: '0', longitudeinicio: '0' })).toBeNull()
  })

  it('retorna null quando latitude/longitude não são numéricos', () => {
    expect(parseExecucaoGeoRow({ numos: 1, latitudeinicio: 'abc', longitudeinicio: '-45.8' })).toBeNull()
  })

  it('equipeagendada vira null quando ausente', () => {
    const result = parseExecucaoGeoRow({ numos: 1, latitudeinicio: '-23.1', longitudeinicio: '-45.8' })
    expect(result?.equipeagendada).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
cd "C:\Cabonnet React" && npx vitest run src/hooks/useOSExecucaoGeo.test.ts
```

Esperado: FAIL — módulo `./useOSExecucaoGeo` não existe.

- [ ] **Step 3: Criar `src/hooks/useOSExecucaoGeo.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { api, endpoints } from '../lib/api'

export interface OSExecucaoGeoPoint {
  numos:          string
  lat:            number
  lng:            number
  equipeagendada: string | null
}

export function parseExecucaoGeoRow(raw: Record<string, unknown>): OSExecucaoGeoPoint | null {
  const lat = parseFloat(String(raw.latitudeinicio ?? ''))
  const lng = parseFloat(String(raw.longitudeinicio ?? ''))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null
  return {
    numos:          String(raw.numos ?? ''),
    lat,
    lng,
    equipeagendada: (raw.equipeagendada as string) || null,
  }
}

export function useOSExecucaoGeo() {
  return useQuery({
    queryKey: ['os-execucao-geo'],
    queryFn: async () => {
      const raw = await api.get<Record<string, unknown>[]>(endpoints.osExecucaoGeo)
      return raw.map(parseExecucaoGeoRow).filter((p): p is OSExecucaoGeoPoint => p !== null)
    },
    staleTime:       1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  })
}
```

- [ ] **Step 4: Rodar o teste**

```bash
cd "C:\Cabonnet React" && npx vitest run src/hooks/useOSExecucaoGeo.test.ts
```

Esperado: 5 PASSED.

- [ ] **Step 5: Build**

```bash
cd "C:\Cabonnet React" && npm run build
```

Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useOSExecucaoGeo.ts src/hooks/useOSExecucaoGeo.test.ts
git commit -m "feat: hook useOSExecucaoGeo para pins de execução no Mapa"
```

---

## Task 11: Frontend — toggle e camada "Em atendimento agora" no `MapaPage`

**Files:**
- Modify: `src/features/mapa/MapaPage.tsx`

Sem teste automatizado dedicado (o arquivo já não tem testes hoje e a lógica nova é puramente declarativa/Leaflet — a lógica testável, `parseExecucaoGeoRow`, já foi coberta no Task 10). Verificação manual no Step 5.

- [ ] **Step 1: Adicionar imports**

No topo de `src/features/mapa/MapaPage.tsx`, troque a linha de import de ícones (linha 3-6):

```tsx
import {
  Map as MapIcon, Flame, Circle, TrendingUp, X, LayoutGrid, Layers, ChevronDown, ChevronUp,
  Search, Loader2, CheckCircle2, AlertTriangle, MapPin as PinIcon,
} from 'lucide-react'
```

por:

```tsx
import {
  Map as MapIcon, Flame, Circle, TrendingUp, X, LayoutGrid, Layers, ChevronDown, ChevronUp,
  Search, Loader2, CheckCircle2, AlertTriangle, MapPin as PinIcon, Wrench,
} from 'lucide-react'
```

E adicione, após `import OSDrawer from '../ordens/OSDrawer'` (linha 15):

```tsx
import { useOSExecucaoGeo } from '../../hooks/useOSExecucaoGeo'
```

- [ ] **Step 2: Adicionar o ícone do marcador de execução**

Depois da definição de `searchPinIcon` (linha 20-28), adicione:

```tsx
const execucaoIcon = L.divIcon({
  className: 'execucao-pin',
  html: `<div style="
    width:22px;height:22px;border-radius:50%;
    background:#facc15;border:2px solid #0d1117;box-shadow:0 2px 6px rgba(0,0,0,.5);
    display:flex;align-items:center;justify-content:center;
  "></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})
```

- [ ] **Step 3: Adicionar estado e hook no componente `MapaPage`**

Troque a linha `const { rows: globalRows } = useOSDerived()` (linha 329) por:

```tsx
  const { rows: globalRows, allRows } = useOSDerived()
  const { data: execucaoGeo = [] } = useOSExecucaoGeo()
  const [showExecucao, setShowExecucao] = useState(false)
```

- [ ] **Step 4: Adicionar o botão de toggle e a camada de marcadores**

No grupo "Toggle de visualização" (linha 579-600), adicione um separador e o novo botão imediatamente depois do `</div>` que fecha esse grupo:

```tsx
        <div className="w-px h-5 bg-surface" />

        {/* Toggle de execução em campo */}
        <button
          onClick={() => setShowExecucao(v => !v)}
          title="OS em atendimento agora (ponto de início da execução)"
          className={`flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-semibold
                      transition-all duration-fast border
                      ${showExecucao
                        ? 'bg-yellow/20 text-yellow border-yellow/30'
                        : 'text-muted border-white/[0.08] hover:text-text'}`}
        >
          <Wrench size={11} />
          Em atendimento agora{execucaoGeo.length > 0 ? ` (${execucaoGeo.length})` : ''}
        </button>
        {showExecucao && execucaoGeo.length === 0 && (
          <span className="text-[10.5px] text-muted italic">Nenhuma OS em campo agora</span>
        )}
```

Dentro do `<MapContainer>`, depois do bloco "Resultado da busca de endereço" (linha 676-689) e antes do fechamento `</MapContainer>` (linha 690), adicione:

```tsx
          {/* Pins de execução em campo */}
          {showExecucao && execucaoGeo.map(p => (
            <Marker
              key={p.numos}
              position={[p.lat, p.lng]}
              icon={execucaoIcon}
              eventHandlers={{
                click: () => {
                  const found = allRows.find(r => r.numos === p.numos)
                  if (found) setDrawerOS(found)
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -12]} className="map-tooltip">
                <span className="font-semibold">OS {p.numos}</span>
                {p.equipeagendada && <span className="block text-[10px]">{p.equipeagendada}</span>}
              </Tooltip>
            </Marker>
          ))}
```

- [ ] **Step 5: Verificação manual no browser**

```bash
cd "C:\Cabonnet React" && npm run dev
```

Abra `http://localhost:3000/mapa`, clique no botão "Em atendimento agora". Antes do GRANT (Task 1) estar aplicado, espere ver "Nenhuma OS em campo agora" (estado vazio, sem erro no console). Depois do GRANT aplicado, espere ver pins amarelos; clique em um pin e confirme que o `OSDrawer` abre com os dados da OS correta.

- [ ] **Step 6: Build + suíte completa**

```bash
cd "C:\Cabonnet React" && npm run build && npm test
```

Esperado: build limpo, todos os testes passando.

- [ ] **Step 7: Commit**

```bash
git add src/features/mapa/MapaPage.tsx
git commit -m "feat: Mapa ganha camada togglável de OS em atendimento agora"
```

---

## Task 12: Verificação final end-to-end

**Files:** nenhum (apenas verificação)

- [ ] **Step 1: Rodar toda a suíte de testes**

```bash
cd "C:\Cabonnet React" && pytest -v && npm test
```

Esperado: todos os testes Python e JS/TS passando.

- [ ] **Step 2: Build de produção**

```bash
cd "C:\Cabonnet React" && npm run build
```

Esperado: build sem erros nem warnings de tipo.

- [ ] **Step 3: Smoke test manual com o servidor rodando**

```bash
cd "C:\Cabonnet React" && npm run dev
```

No browser: abra qualquer OS concluída em `/ordens`, abra o Drawer, clique em "Detalhes" — confirme que o modal abre sem erro mesmo que as 3 seções novas não apareçam (schema `mobile` ainda sem GRANT é o estado esperado até o Task 1 ser confirmado em produção). Abra `/mapa` e confirme que o toggle "Em atendimento agora" não quebra a página.

- [ ] **Step 4: Revisar o diff completo antes do merge final**

```bash
cd "C:\Cabonnet React" && git log --oneline -13
```

Esperado: 11 commits desde o início deste plano (Tasks 1-11), cada um com escopo único e mensagem clara.
