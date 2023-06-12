FROM ghcr.io/puppeteer/puppeteer:20.6.0@sha256:7246ec3f857d34d45cbe9e0581af7dead6ca771efda985ee2817fd24c104ae60

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
