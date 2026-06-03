FROM ghcr.io/puppeteer/puppeteer:25.1.0@sha256:e816d314227d2f2754b5b696f4734dcefc85fb3b1f92810a9fffc1570a27ce3e

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
