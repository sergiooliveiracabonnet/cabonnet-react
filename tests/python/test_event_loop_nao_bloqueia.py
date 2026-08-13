# -*- coding: utf-8 -*-
"""Um Grafana fora do ar não pode congelar a API inteira.

Os handlers que falam com o Grafana usam `requests` (bloqueante) com timeout de
30s. Declarados como `async def`, eles rodam no event loop e travam TODAS as
outras rotas enquanto esperam — inclusive as que só leem o SQLite local, como
/api/nivel-sinal/ocorrencias. Declarados como `def`, o Starlette os executa no
threadpool e o loop segue livre.
"""

import asyncio
import time
from unittest.mock import patch

import httpx


def _grafana_lento(*_args, **_kwargs):
    """Imita o Grafana pendurado: bloqueia a thread por 2s, como `requests` faz."""
    time.sleep(2)
    return {}


def test_rota_local_responde_enquanto_grafana_pendura(tmp_path):
    from cabonnet import db

    db_path = str(tmp_path / "cabonnet_loop.db")

    async def cenario():
        from httpx import ASGITransport, AsyncClient
        from cabonnet.app import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Cronometra desde o disparo da lenta: se ela travar o loop, o
            # próprio sleep abaixo fica preso e a rápida só começa 2s depois.
            inicio = time.monotonic()
            lenta = asyncio.create_task(ac.get("/revisitas", timeout=30))
            await asyncio.sleep(0.05)         # dá a chance de a lenta entrar

            rapida = await ac.get("/api/nivel-sinal/ocorrencias", timeout=30)
            decorrido = time.monotonic() - inicio

            await asyncio.gather(lenta, return_exceptions=True)
            return rapida, decorrido

    with (
        patch("cabonnet.app._cache_warmup"),
        patch("cabonnet.juniper._jun_poll_loop"),
        patch("cabonnet.app._auth_enabled", return_value=False),
        patch("cabonnet.app._check_api_rate_limit", return_value=True),
        patch("cabonnet.app.grafana_post", side_effect=_grafana_lento),
        patch("cabonnet.db._DB_PATH", db_path),
    ):
        db._db_init()
        rapida, decorrido = asyncio.run(cenario())

    assert rapida.status_code == 200
    assert decorrido < 1.0, (
        f"/api/nivel-sinal/ocorrencias levou {decorrido:.1f}s — ficou preso atrás "
        "do /revisitas, ou seja, o handler bloqueante está travando o event loop"
    )
