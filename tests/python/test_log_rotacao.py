# -*- coding: utf-8 -*-
"""Caminho do log configuravel.

O RotatingFileHandler RENOMEIA o arquivo ao girar. Com o compose montando um
arquivo unico (./cabonnet_server.log:/app/cabonnet_server.log), esse rename
falha dentro do container, logging.handleError engole a excecao e o log congela
sem aviso — foi o que aconteceu entre 23/07 e 09/09, com a aplicacao viva.

Apontar o log para dentro de um DIRETORIO montado faz a rotacao funcionar.
"""

import importlib
import io
import logging
import os
import re
from logging.handlers import RotatingFileHandler
from unittest.mock import patch



def _config_com_env(**env):
    with patch.dict(os.environ, env, clear=False):
        import cabonnet.config as cfg
        return importlib.reload(cfg)


def test_env_define_o_caminho_do_log(tmp_path):
    alvo = str(tmp_path / "logs" / "cabonnet_server.log")
    cfg = _config_com_env(CABONNET_LOG_FILE=alvo)
    try:
        assert cfg.CONFIG["log_file"] == alvo
    finally:
        _config_com_env()  # restaura


def test_sem_env_mantem_o_caminho_historico():
    env = dict(os.environ)
    env.pop("CABONNET_LOG_FILE", None)
    with patch.dict(os.environ, env, clear=True):
        import cabonnet.config as cfg
        cfg = importlib.reload(cfg)
        assert cfg.CONFIG["log_file"].endswith("cabonnet_server.log")
        assert os.path.dirname(cfg.CONFIG["log_file"]) == cfg._PROJECT_DIR
    _config_com_env()


def test_rotacao_funciona_em_diretorio(tmp_path):
    """O contrato que o bind-mount de arquivo quebrava: girar cria o .1."""
    destino = tmp_path / "logs"
    destino.mkdir()
    arquivo = destino / "cabonnet_server.log"

    handler = RotatingFileHandler(str(arquivo), maxBytes=200, backupCount=2, encoding="utf-8")
    logger = logging.getLogger("teste_rotacao")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    try:
        for i in range(40):
            logger.info("linha de log numero %d com texto suficiente para encher", i)
    finally:
        logger.removeHandler(handler)
        handler.close()

    assert arquivo.exists()
    assert (destino / "cabonnet_server.log.1").exists(), "nao girou"


def test_servidor_js_nao_descarta_a_saida_do_python():
    """Em producao o stdio era 'ignore' e os logs do Python sumiam do Docker."""
    js = io.open("servidor.js", encoding="utf-8").read()
    trecho = js[js.index("const pyProcess = spawn("):]
    stdio = re.search(r"stdio\s*:\s*(.+)", trecho).group(1)
    assert "'ignore'" not in stdio.split("//")[0] or "['ignore'," in stdio
    assert "inherit" in stdio


def test_compose_monta_diretorio_e_nao_o_arquivo_de_log():
    """Sem PyYAML de proposito: nao vale acrescentar dependencia ao projeto
    para conferir duas linhas de configuracao."""
    compose = io.open("docker-compose.yml", encoding="utf-8").read()

    assert ":/app/cabonnet_server.log" not in compose, (
        "voltou a montar o arquivo de log; a rotacao quebra de novo")
    assert ":/app/logs" in compose
    assert "CABONNET_LOG_FILE=/app/logs/" in compose
