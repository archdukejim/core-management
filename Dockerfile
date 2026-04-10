FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

FROM node:22-bookworm-slim

# Install bind9-dnsutils for dig/nsupdate (step-cli no longer needed — using Step-CA API)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        bind9-dnsutils \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /app/dist/ ./dist/
COPY public/ ./public/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER node

CMD ["node", "dist/index.js"]
