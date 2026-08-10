FROM ghcr.io/puppeteer/puppeteer:25.5.0@sha256:0077467f1faed3a37168c342bf6e454bc5424f57764e0f74e1ad2e34cccd341e

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
