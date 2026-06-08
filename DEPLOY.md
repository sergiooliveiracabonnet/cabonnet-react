# Deploy em Debian

Guia para colocar o Cabonnet em produção em um servidor Debian. Existem dois caminhos —
**Docker Compose** (recomendado, usa o `Dockerfile`/`docker-compose.yml` já presentes no repo)
ou **instalação nativa** (Node + Python direto no sistema, com systemd).

> Stack: servidor unificado `servidor.js` (Node) que sobe `cabonnet_server.py` (Python/FastAPI)
> como subprocesso e serve tudo na porta **3000**. Veja `CLAUDE.md` para detalhes de arquitetura.

---

## Pré-requisitos comuns

- Acesso root/sudo no servidor Debian (12 "bookworm" ou superior)
- DNS apontando para o servidor, se for usar HTTPS com domínio próprio
- O `.env` preenchido (não está no repo — copie de `.env.example` e preencha com as
  credenciais reais: Grafana, Telegram, login, Anthropic, etc.)
- Conectividade de saída liberada para:
  - `cabonnet-monitoramento.interfocus.com.br:3000` (Grafana)
  - `api.telegram.org` (bot Telegram)
  - `api.anthropic.com` (recursos de IA, se `ANTHROPIC_API_KEY` configurada)

```bash
git clone <url-do-repo> /opt/cabonnet
cd /opt/cabonnet
cp .env.example .env
nano .env   # preencher com os valores reais
```

---

## Opção A — Docker Compose (recomendado)

**1. Instalar Docker Engine + Compose**

```bash
sudo apt update && sudo apt install -y ca-certificates curl gnupg
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"   # relogar (ou newgrp docker) para o grupo valer
```

**2. Subir o serviço**

```bash
cd /opt/cabonnet
docker compose up -d --build
```

O `docker-compose.yml` já cuida de:
- build multi-stage (frontend React + runtime Python+Node)
- expor a porta `3000`
- carregar variáveis do `.env`
- volume persistente para `Backup/` (snapshots do Grafana sobrevivem a `docker compose down`)
- healthcheck em `/health` e `restart: unless-stopped`

**3. Verificar**

```bash
docker compose logs -f
curl http://localhost:3000/health
```

**Atualizar para uma nova versão:**

```bash
cd /opt/cabonnet
git pull
docker compose up -d --build
```

---

## Opção B — Instalação nativa (systemd, sem Docker)

**1. Dependências do sistema**

```bash
sudo apt update && sudo apt install -y curl git build-essential python3 python3-venv python3-pip
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

**2. Código + dependências**

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin cabonnet
sudo git clone <url-do-repo> /opt/cabonnet
cd /opt/cabonnet
sudo cp .env.example .env && sudo nano .env   # preencher valores reais

npm ci
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate

npm run build               # gera dist/
sudo chown -R cabonnet:cabonnet /opt/cabonnet
```

**3. Serviço systemd**

Use o template pronto em [`deploy/cabonnet.service`](deploy/cabonnet.service):

```bash
sudo cp deploy/cabonnet.service /etc/systemd/system/cabonnet.service
sudo systemctl daemon-reload
sudo systemctl enable --now cabonnet
sudo journalctl -u cabonnet -f
```

> O `servidor.js` detecta o Python procurando `python`/`python3`/`py` no `PATH`
> (`servidor.js:83`) — por isso a unit aponta `Environment=PATH=.../venv/bin:...`,
> garantindo que ele use o venv com `requirements.txt` instalado.

**Atualizar para uma nova versão:**

```bash
cd /opt/cabonnet
sudo systemctl stop cabonnet
sudo -u cabonnet git pull
sudo -u cabonnet npm ci
sudo -u cabonnet bash -c "source venv/bin/activate && pip install -r requirements.txt"
sudo -u cabonnet npm run build
sudo systemctl start cabonnet
```

---

## Reverse proxy + HTTPS (Nginx + Certbot)

Comum às duas opções — o app escuta em `127.0.0.1:3000`, o Nginx expõe 80/443.

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/cabonnet
sudo ln -s /etc/nginx/sites-available/cabonnet /etc/nginx/sites-enabled/
```

Edite `/etc/nginx/sites-available/cabonnet` e troque `seu-dominio.com.br` pelo domínio real
(veja o template em [`deploy/nginx.conf`](deploy/nginx.conf)). Depois:

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d seu-dominio.com.br   # configura HTTPS automaticamente
```

---

## Firewall

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # libera 80 e 443
sudo ufw enable
```

As portas internas (3000 do Node, 5000/5001 do Python) **não** precisam ficar expostas
externamente — apenas o Nginx fala com o mundo.

---

## Notas operacionais

- **Lockfile**: se o processo for encerrado à força, pode sobrar `cabonnet_server.lock`
  na raiz do projeto — é seguro apagar antes de reiniciar o serviço.
- **Logs**: tudo vai para `cabonnet_server.log` na raiz do projeto e para stdout
  (`docker compose logs` ou `journalctl -u cabonnet`, conforme a opção escolhida).
- **Banco/cache**: `cabonnet_data.db` (SQLite) guarda o cache de OS para sobreviver a
  quedas do Grafana — não precisa ser versionado nem copiado manualmente entre ambientes.
- **Backups**: a pasta `Backup/` guarda snapshots do Grafana; no Docker já é um volume
  persistente, na instalação nativa garanta que ela exista e tenha permissão de escrita
  para o usuário `cabonnet`.
