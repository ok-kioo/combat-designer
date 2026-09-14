# Dockerfile for Combat Designer Frontend Web App
FROM node:22-alpine

WORKDIR /app

# Copy package descriptors for workspace resolution
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install frontend dependencies
RUN npm ci --ignore-scripts --workspace=@combat-designer/frontend

# Copy frontend source
COPY frontend ./frontend
RUN npm --workspace=@combat-designer/frontend run build

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000
USER node

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

WORKDIR /app/frontend
CMD ["node", "--experimental-strip-types", "app/server.ts"]
