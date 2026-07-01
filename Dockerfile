# ── Stage 1: Build React frontend ─────────────────────────────────────────────
FROM node:24-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Runtime (Python + Node) ──────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app

# Fuso horário do processo: relatórios diários (executadas/produção/KPI) usam
# date.today()/datetime.now() naive. Sem isto, a imagem slim roda em UTC e o
# "hoje" vira o dia seguinte às 21h de Brasília, zerando os relatórios à noite.
ENV TZ=America/Sao_Paulo

# Install Node.js 24 (for servidor.js — only built-ins needed, no npm packages)
# tzdata é obrigatório: a imagem slim não traz /usr/share/zoneinfo, então o
# glibc cairia silenciosamente em UTC mesmo com TZ definido.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates tzdata && \
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get purge -y curl && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY servidor.js cabonnet_server.py ./
COPY cabonnet/ ./cabonnet/

# React build output from Stage 1
COPY --from=builder /app/dist ./dist

# Backup dir must exist so _all_snapshots() doesn't error on first run
RUN mkdir -p /app/Backup

EXPOSE 3000

# servidor.js spawns cabonnet_server.py automatically in prod mode
CMD ["node", "servidor.js"]
