# Dockerfile (for bot) # FROM node:20-alpine
FROM node:20-slim

WORKDIR /app

# faster installs
ENV NODE_ENV=production

# Install app deps first (leverage Docker layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .


# The app uses ESM and dotenv in config.js, so .env must be provided at runtime.
CMD ["node","src/index.js"]