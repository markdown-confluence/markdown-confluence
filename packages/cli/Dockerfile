FROM ghcr.io/puppeteer/puppeteer:20.9.0@sha256:23247f96e0384b2b8f12c9f59c4f3b44907b92dccfcf9dac31724f911d40e3fb

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
