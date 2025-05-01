FROM node:20-alpine AS builder

WORKDIR /app


COPY package.json package-lock.json* ./


COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/


RUN npm ci

COPY packages/backend/src ./packages/backend/src
COPY packages/backend/tsconfig.json ./packages/backend/

RUN npm run build --workspace=@nexus-terminal/backend


FROM node:20-alpine


RUN apk add --no-cache --virtual .build-deps python3 make g++

WORKDIR /app


COPY --from=builder /app/packages/backend/dist ./dist

COPY --from=builder /app/packages/backend/src/locales ./dist/locales

COPY packages/backend/package.json ./package.json
COPY package-lock.json ./package-lock.json
RUN npm install --omit=dev --prefer-offline


RUN apk del .build-deps


EXPOSE 3001


CMD ["node", "dist/index.js"]
