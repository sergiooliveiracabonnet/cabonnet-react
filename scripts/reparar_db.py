# -*- coding: utf-8 -*-
"""Reconstroi o cabonnet_data.db descartando a tabela corrompida.

DROP TABLE e VACUUM falham porque ambos precisam percorrer a arvore da tabela
quebrada. A saida e criar um banco novo e copiar so o que le — o query_cache e
cache puro, regenerado pelo warmup, entao descarta-lo nao perde nada.

Uso:  python3 reparar_db.py cabonnet_data.db
Nao substitui o original: escreve cabonnet_data.db.novo e mostra o que fazer.
"""
import os
import sqlite3
import sys

DESCARTAR = {"query_cache"}

origem = sys.argv[1] if len(sys.argv) > 1 else "cabonnet_data.db"
destino = origem + ".novo"

if not os.path.exists(origem):
    sys.exit("nao encontrei %s" % origem)
if os.path.exists(destino):
    sys.exit("%s ja existe — remova antes de rodar de novo" % destino)

src = sqlite3.connect("file:%s?mode=ro" % origem.replace("\\", "/"), uri=True)
dst = sqlite3.connect(destino)

objetos = src.execute(
    "SELECT type, name, tbl_name, sql FROM sqlite_master "
    "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC"
).fetchall()

tabelas = [o for o in objetos if o[0] == "table"]
resto = [o for o in objetos if o[0] != "table"]

print("%-26s %10s  %s" % ("TABELA", "LINHAS", "RESULTADO"))
print("-" * 60)

copiadas, descartadas, perdidas = 0, [], []
for _tipo, nome, _tbl, sql in tabelas:
    if nome in DESCARTAR:
        descartadas.append(nome)
        print("%-26s %10s  DESCARTADA (cache, sera regenerada)" % (nome, "-"))
        continue
    dst.execute(sql)
    try:
        linhas = src.execute('SELECT * FROM "%s"' % nome).fetchall()
    except sqlite3.DatabaseError as ex:
        perdidas.append((nome, str(ex)))
        print("%-26s %10s  ILEGIVEL: %s" % (nome, "?", str(ex)[:28]))
        continue
    if linhas:
        marcas = ",".join("?" * len(linhas[0]))
        dst.executemany('INSERT INTO "%s" VALUES (%s)' % (nome, marcas), linhas)
    copiadas += 1
    print("%-26s %10d  ok" % (nome, len(linhas)))

for _tipo, nome, _tbl, sql in resto:
    try:
        dst.execute(sql)
    except sqlite3.Error as ex:
        print("  (indice/trigger %s nao recriado: %s)" % (nome, str(ex)[:40]))

dst.commit()

integridade = dst.execute("PRAGMA integrity_check").fetchone()[0]
print()
print("integrity_check do banco novo:", integridade[:120])

# confere contagem tabela a tabela
print()
divergencias = []
for _t, nome, _tb, _s in tabelas:
    if nome in DESCARTAR:
        continue
    try:
        a = src.execute('SELECT COUNT(*) FROM "%s"' % nome).fetchone()[0]
        b = dst.execute('SELECT COUNT(*) FROM "%s"' % nome).fetchone()[0]
        if a != b:
            divergencias.append((nome, a, b))
    except sqlite3.DatabaseError:
        pass

src.close()
dst.close()

tam_a = os.path.getsize(origem) / 1024 / 1024
tam_b = os.path.getsize(destino) / 1024 / 1024
print("tamanho: %.1f MB -> %.1f MB" % (tam_a, tam_b))
print("tabelas copiadas: %d | descartadas: %s" % (copiadas, ", ".join(descartadas) or "nenhuma"))
if divergencias:
    print("DIVERGENCIA DE CONTAGEM:", divergencias)
if perdidas:
    print("TABELAS ILEGIVEIS:", [p[0] for p in perdidas])

ok = integridade == "ok" and not divergencias and not perdidas
print()
print("RESULTADO:", "banco novo integro" if ok else "NAO CONFIAR — revisar acima")
sys.exit(0 if ok else 1)
