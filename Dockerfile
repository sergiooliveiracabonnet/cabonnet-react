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

# Install Node.js 24 (for servidor.js — only built-ins needed, no npm packages)
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
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
