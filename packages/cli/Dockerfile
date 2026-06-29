FROM ghcr.io/puppeteer/puppeteer:25.2.1@sha256:087665e07702508ef5d2135af06b4fcc1add252ae54a529fcc3638c11b931f3a

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
