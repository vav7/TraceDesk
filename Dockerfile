# TraceDesk — production image: Express API serving the built React SPA.
# Runs with the zero-config in-memory database unless DATABASE_URL is provided.

# ── Stage 1: build the frontend ─────────────────────────────────────────
FROM node:22-alpine AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json tailwind.config.mjs postcss.config.mjs ./
COPY src ./src
RUN npm run build

# ── Stage 2: build the backend ──────────────────────────────────────────
FROM node:22-alpine AS api-build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --include=dev
COPY backend/ ./
RUN npm run build

# ── Stage 3: runtime ────────────────────────────────────────────────────
FROM node:22-alpine
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

# Production dependencies only (pg-mem is a runtime dep: powers the
# in-memory database mode).
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY --from=api-build /app/backend/dist ./backend/dist
COPY backend/db ./backend/db
COPY --from=web-build /app/dist ./dist

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/dist/app.js"]
