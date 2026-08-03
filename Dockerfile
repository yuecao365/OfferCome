FROM node:22-bookworm-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/tmp/offerlai-build.db
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates g++ make openssl python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV APP_MODE=local
ENV DATABASE_URL=file:/data/dev.db

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data /app/.local \
  && chown -R node:node /data /app/.local

COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts

USER node
EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && npm run start -- -H 0.0.0.0"]
