# ═══════════════════════════════════════════════════
#  ADYX Platform — Multi-Stage Docker Build
#  Zero-Knowledge Communication Infrastructure
# ═══════════════════════════════════════════════════

# ── Stage 1: Build Frontend ──────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

# Copy package files for dependency caching
COPY frontend/package.json frontend/package-lock.json ./frontend/
COPY backend/package.json backend/package-lock.json* ./backend/

# Install all dependencies
RUN cd frontend && npm ci --silent \
    && cd ../backend && npm ci --silent

# Copy source
COPY frontend/ ./frontend/
COPY backend/ ./backend/

# Build frontend
RUN cd frontend && npm run build

# ── Stage 2: Production Image ────────────────────
FROM node:22-alpine AS production

LABEL maintainer="ADYX Team"
LABEL description="ADYX — Zero-Knowledge Encrypted Communication Platform"
LABEL version="1.0.0"

# Security: run as non-root
RUN addgroup -g 1001 -S adyx && adduser -S adyx -u 1001 -G adyx

WORKDIR /app

# Copy backend + dependencies
COPY --from=builder /build/backend/package.json ./backend/
COPY --from=builder /build/backend/node_modules ./backend/node_modules/
COPY --from=builder /build/backend/src ./backend/src/
COPY --from=builder /build/backend/security ./backend/security/
COPY --from=builder /build/backend/secureServer.js ./backend/

# Copy built frontend
COPY --from=builder /build/frontend/dist ./frontend/dist/

# Set ownership
RUN chown -R adyx:adyx /app

USER adyx

# Environment
ENV NODE_ENV=production
ENV PORT=8443

EXPOSE 8443

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8443/health | grep -q '"status":"ok"' || exit 1

# Start server
CMD ["node", "backend/src/index.js"]
