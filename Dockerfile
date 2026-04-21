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
# Shared types are needed by the server build
COPY shared/ /shared
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Production server dependencies only
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Compiled server (output goes to dist/server/src/ because rootDir is implicit)
COPY --from=server-builder /app/server/dist ./dist

# DB migration SQL (must be alongside compiled JS)
COPY server/src/db/migrations ./dist/server/src/db/migrations

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
