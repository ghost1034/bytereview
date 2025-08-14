# Frontend Dockerfile (bypass npm ci)
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# deps: install ALL deps for build (not deterministic)
FROM base AS deps
COPY package.json package-lock.json ./
# Loosen checks; add legacy peer dep if needed
# You can drop --legacy-peer-deps if your tree installs cleanly
RUN npm install --include=dev --no-audit --no-fund --legacy-peer-deps

# builder: compile Next.js
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# runner: Next.js standalone runtime (no install here)
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
RUN mkdir -p .next && chown -R nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]