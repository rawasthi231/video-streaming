# Multi-stage build for production optimization
FROM node:22-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY src ./src

# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine AS production

# Install runtime dependencies including FFmpeg
RUN apk add --no-cache \
    ffmpeg \
    tzdata \
    tini \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production --omit=dev && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy frontend assets
COPY public ./public

# Copy existing HLS content
COPY hls ./hls

# Create required directories and set permissions
RUN mkdir -p uploads logs videos && \
    chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Environment variables
ENV NODE_ENV=production \
    PORT=8080 \
    BURN_DEFAULT_MS=200 \
    BURN_MAX_MS=5000 \
    VIDEO_STORAGE_PATH=./videos \
    HLS_OUTPUT_PATH=./hls \
    LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

EXPOSE 8080

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "dist/server.js"]
