# ---- deps ----------------------------------------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build ---------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime -------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# System ffmpeg/ffprobe (used via FFMPEG_PATH/FFPROBE_PATH), yt-dlp for
# YouTube/Twitch/Kick link ingest, fontconfig + a color-emoji font so libass
# renders emoji reactions and auto-emoji captions.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
     fontconfig fonts-noto-color-emoji \
  && pip3 install --break-system-packages --no-cache-dir yt-dlp \
  && apt-get clean && rm -rf /var/lib/apt/lists/*
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

# Next.js standalone server bundle + static assets.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Register the bundled caption fonts with fontconfig too (belt-and-suspenders
# alongside the exporter's libass fontsdir), so any tool on the box finds them.
RUN mkdir -p /usr/share/fonts/truetype/clipforge \
  && cp /app/public/fonts/*.ttf /usr/share/fonts/truetype/clipforge/ \
  && fc-cache -f
ENV FONTS_DIR=/app/public/fonts

# Persist uploads, exports, projects, and derived caches across restarts by
# mounting a volume at /app/.data.
RUN mkdir -p /app/.data
VOLUME ["/app/.data"]

EXPOSE 3000
CMD ["node", "server.js"]
