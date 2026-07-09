FROM node:24-bookworm-slim AS deps

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./

RUN npm ci

# -------------------------------------------------------

FROM node:24-bookworm-slim AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules

COPY package.json package-lock.json ./
COPY nest-cli.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate

RUN npm run build

# -------------------------------------------------------

FROM node:24-bookworm-slim AS runner

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production \
    PORT=4000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

COPY --from=builder /app/node_modules ./node_modules

COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x ./docker/entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./docker/entrypoint.sh"]

CMD ["node", "dist/src/main.js"]