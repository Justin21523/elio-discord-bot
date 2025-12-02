# Dockerfile (for bot) # FROM node:20-alpine
FROM node:20-slim

WORKDIR /app

# faster installs
ENV NODE_ENV=production \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

# Install app deps first (leverage Docker layer cache)
COPY package*.json ./
# Use npm ci when lockfile exists; otherwise fall back to npm install (no dev deps)
RUN if [ -f package-lock.json ]; then npm ci --only=production; else npm install --omit=dev; fi \
  && npm cache clean --force

# Copy source
COPY . .

# The app uses ESM and dotenv in config.js, so .env must be provided at runtime.
CMD ["node","src/index.js"]
