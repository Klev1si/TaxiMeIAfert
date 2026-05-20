# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Builder
#   Installs ALL dependencies (including devDependencies) and compiles
#   TypeScript to dist/.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first — Docker layer cache skips npm install if unchanged
COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Production image
#   Only copies compiled output + prod dependencies; no source files or
#   dev tools.  Runs as a non-root user for security.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Security: run as a dedicated low-privilege user
RUN addgroup -S taxiapp && adduser -S taxiapp -G taxiapp

WORKDIR /app

# Copy prod deps manifest and install without devDependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder stage
COPY --from=builder /app/dist ./dist

# Copy the uploads dir skeleton (empty — real uploads go to a volume or S3)
RUN mkdir -p uploads/avatars uploads/documents && \
    chown -R taxiapp:taxiapp /app

USER taxiapp

# Healthcheck — relies on the /health endpoint added in Step 98
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/health || exit 1

EXPOSE ${PORT:-3000}

CMD ["node", "dist/main"]
