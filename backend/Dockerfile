# Dockerfile for Combat Designer Backend & API Server
FROM node:22-alpine

WORKDIR /app

# Copy package descriptors for workspace resolution
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY mcp/package*.json ./mcp/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci --ignore-scripts --workspace=@combat-designer/backend

# Copy backend source and shared files
COPY backend ./backend
COPY shared ./shared

# Build TypeScript to dist
RUN npm --workspace=@combat-designer/backend run build

ENV PORT=3001
ENV NODE_ENV=production
EXPOSE 3001
USER node

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/health || exit 1

WORKDIR /app/backend
CMD ["node", "dist/main.js"]
