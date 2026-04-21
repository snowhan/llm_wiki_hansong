# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ── Stage 2: Build server ─────────────────────────────────────────────────────
FROM node:22-alpine AS server-builder

WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --ignore-scripts

COPY server/ .
# Shared types: copy relative to WORKDIR so ../../shared resolves correctly
COPY shared/ ../shared/
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Production server dependencies only
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Python runtime for file preprocessing (markitdown + embedded image extraction)
COPY server/requirements.txt ./requirements.txt
RUN apt-get update && \
  apt-get install -y --no-install-recommends python3 python3-venv python3-pip wget && \
  rm -rf /var/lib/apt/lists/* && \
  python3 -m venv /opt/venv && \
  /opt/venv/bin/pip install --upgrade pip && \
  /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
ENV PATH="/opt/venv/bin:${PATH}"

# Build-time dependency validation (fail fast if preprocessing stack is broken)
RUN python3 -c "import fitz, docx, pptx, PIL" && \
  markitdown --help >/dev/null

# Compiled server (output goes to dist/server/src/ because rootDir is implicit)
COPY --from=server-builder /app/server/dist ./dist

# DB migration SQL (must be alongside compiled JS)
COPY server/src/db/migrations ./dist/server/src/db/migrations

# Python helper scripts used at runtime by preprocess-service
COPY server/scripts ./dist/server/scripts
RUN test -f ./dist/server/scripts/extract_images.py

# Frontend static files
COPY --from=frontend-builder /app/dist /app/static

ENV NODE_ENV=production
ENV PORT=3001
# Point the server to the frontend static build
ENV STATIC_DIR=/app/static

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD wget -qO- http://localhost:3001/ || exit 1

# DB migration runs automatically on startup (in migrate.ts → called from index.ts)
CMD ["node", "dist/server/src/index.js"]
