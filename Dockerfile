# syntax=docker/dockerfile:1
#
# Monorepo image for the SIH26242 backend (API + optional BullMQ worker).
# Build from the repo root:  docker build -t sih-rpl-backend .
#
# Layout mirrors the workspace: contracts/dist is built first, then the backend
# compiles against it via the @sih/contracts workspace symlink.

# --- install (with dev deps, for the TypeScript build) -----------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY contracts/package.json contracts/package.json
COPY backend/package.json backend/package.json
RUN npm ci

# --- build -------------------------------------------------------------------
FROM deps AS build
COPY contracts ./contracts
COPY backend ./backend
RUN npm run build

# --- runtime -----------------------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# ffmpeg powers the practical-video keyframe/ASR analysis path.
RUN apk add --no-cache ffmpeg

COPY package.json package-lock.json ./
COPY contracts/package.json contracts/package.json
COPY backend/package.json backend/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/contracts/dist ./contracts/dist
COPY --from=build /app/backend/dist ./backend/dist

# Writable local storage for tus uploads + rendered files.
RUN mkdir -p /app/backend/data && chown -R node:node /app
USER node

ENV PORT=4000
ENV FFMPEG_PATH=/usr/bin/ffmpeg
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || exit 1

CMD ["node", "backend/dist/server.js"]
