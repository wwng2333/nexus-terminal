FROM node:20-alpine AS builder

WORKDIR /app


COPY package.json package-lock.json* ./


COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# 复制所有 packages 目录的内容，以便 npm ci 能够访问所有工作区
COPY packages ./packages

RUN npm ci

COPY packages/backend/src ./packages/backend/src
COPY packages/backend/tsconfig.json ./packages/backend/

RUN npm run build --workspace=@nexus-terminal/backend


FROM node:20-alpine


RUN apk add --no-cache --virtual .build-deps python3 make g++

WORKDIR /app


COPY --from=builder /app/packages/backend/dist ./dist
# --- 添加：复制 locales 目录 ---
COPY --from=builder /app/packages/backend/src/locales ./dist/locales
# --- 结束添加 ---
# --- 修改：从构建上下文复制 package 文件，以包含新依赖 ---
COPY packages/backend/package.json ./package.json
COPY package-lock.json ./package-lock.json
# --- 结束修改 ---

RUN npm install --omit=dev --prefer-offline


RUN apk del .build-deps


EXPOSE 3001


CMD ["node", "dist/index.js"]
