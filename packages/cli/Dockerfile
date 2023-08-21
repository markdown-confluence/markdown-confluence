FROM ghcr.io/puppeteer/puppeteer:21.1.0@sha256:98a25488adecc70f7d347c4fa771a18f1e14685e419045564fd5285eaea97453

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
