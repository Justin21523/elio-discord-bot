# Dockerfile (for bot)
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++
# For some native deps

# Install app deps first (leverage Docker layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

ENV NODE_ENV=production

# The bot reads .env at runtime. You can also use env_file in compose.
CMD ["node", "src/index.js"]
