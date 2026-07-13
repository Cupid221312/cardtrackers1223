# syntax=docker/dockerfile:1.7
# Multi-stage build. One image, two entrypoints:
#   web:       node server.js                          (Next.js standalone)
#   scheduler: node --enable-source-maps node_modules/.bin/tsx scripts/scheduler.ts
# docker-compose.yml runs both from the same image so `docker build` happens once.

# --- deps: install with cache ---
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
RUN npm ci

# --- builder: prisma generate + next build with the postgres schema ---
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Use the production schema for the Prisma client baked into the image.
RUN cp prisma/schema.postgres.prisma prisma/schema.prisma
RUN npx prisma generate
# Next needs a DATABASE_URL to satisfy type-check even at build time; the
# real value is injected at runtime by the platform.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runner: minimal image, non-root user ---
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl tini \
 && addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Runtime bits — includes Prisma client + schema + engines.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
# tsx + its deps for the scheduler entrypoint
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/get-tsconfig ./node_modules/get-tsconfig
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/resolve-pkg-maps ./node_modules/resolve-pkg-maps
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

USER nextjs
EXPOSE 3000
# tini is PID 1 so SIGTERM from the platform is forwarded to node correctly
# (that's what makes the graceful-shutdown lifecycle actually fire).
ENTRYPOINT ["/sbin/tini", "--"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
