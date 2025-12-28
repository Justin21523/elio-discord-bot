# Dockerfile (for bot)

FROM node:20-slim AS build

WORKDIR /app

ENV NODE_ENV=development \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi \
  && npm cache clean --force

COPY . .
RUN npm run build

FROM node:20-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
  && npm cache clean --force

COPY --from=build /app/dist ./dist

CMD ["node","dist/src/index.js"]
