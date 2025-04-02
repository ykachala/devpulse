FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY prisma/ ./prisma/

RUN npm run build
RUN npm run db:generate

# --- Production image ---
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["node", "dist/index.js"]
