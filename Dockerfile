# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Install app deps first (leverage Docker layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# The bot reads .env at runtime. You can also use env_file in compose.
CMD ["node", "src/index.js"]
