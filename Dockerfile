# Frontend Dockerfile for CPAAutomation
FROM node:20-alpine AS base
WORKDIR /app
# glibc compatibility for some native modules (sharp, etc.)
RUN apk add --no-cache libc6-compat

# --- deps: install ALL deps (incl. dev) to build ---
FROM base AS deps
# copy only manifests to leverage build cache
COPY package.json package-lock.json ./
# lockfile-respecting install; must include dev deps for the build step
RUN npm ci

# --- builder: compile Next.js app ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner: minimal runtime using Next.js standalone output ---
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Runtime env
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# App artifacts
COPY --from=builder /app/public ./public

# Ensure prerender cache dir exists and is writable
RUN mkdir -p .next && chown -R nextjs:nodejs .next

# Copy standalone server + static assets
# `.next/standalone` already includes the minimal node_modules needed to run
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Next.js standalone exposes server.js at repo root inside the standalone tree
CMD ["node", "server.js"]