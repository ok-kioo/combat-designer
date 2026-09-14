# Dockerfile for Combat Designer MCP Server & Gateway
FROM node:22-alpine

WORKDIR /app

# Copy package descriptors for workspace resolution
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY mcp/package*.json ./mcp/
COPY frontend/package*.json ./frontend/

# Install dependencies for MCP and backend dependency
RUN npm ci --ignore-scripts --workspace=@combat-designer/backend --workspace=@combat-designer/mcp

# Copy backend and MCP sources
COPY backend ./backend
COPY mcp ./mcp
COPY shared ./shared

# Build backend and MCP
RUN npm --workspace=@combat-designer/backend run build
RUN npm --workspace=@combat-designer/mcp run build

ENV PORT=3002
ENV NODE_ENV=production
EXPOSE 3002
USER node

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3002/health || exit 1

WORKDIR /app/mcp
CMD ["node", "dist/server/src/main.js"]
