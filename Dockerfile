# ── Stage 1: Install dependencies & build ──
FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ gcc

# Copy package files and install
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code
COPY . .

# Build the Next.js production bundle
RUN npm run build

# ── Stage 2: Production image ──
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install runtime dependencies for native modules
RUN apk add --no-cache libc6-compat

# Copy built app from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

# Copy the Linux PicoBot binary and make it executable
COPY public/bin/picobot-linux-amd64 /app/bin/picobot
RUN chmod +x /app/bin/picobot

# Create data directory for SQLite DB and PicoBot config
RUN mkdir -p /app/data

# The app stores its SQLite DB and PicoBot config here
# Mount a volume to persist data across container restarts
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["npm", "start"]
