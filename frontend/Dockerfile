# Dockerfile for Combat Designer Frontend Web App
FROM node:22-alpine

WORKDIR /app

# Copy package descriptors for workspace resolution
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install frontend dependencies
RUN npm install --workspace=@combat-designer/frontend

# Copy frontend source
COPY frontend ./frontend

ENV PORT=3000
ENV NODE_ENV=production
ENV API_URL=http://api:3001
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

WORKDIR /app/frontend
CMD ["node", "--experimental-strip-types", "app/server.ts"]
