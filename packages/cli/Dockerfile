FROM ghcr.io/puppeteer/puppeteer:25.8.0@sha256:f3a51ec3cf472044c99c8c48ab9b850ac94652ac541966205985d1afa2c794e8

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
