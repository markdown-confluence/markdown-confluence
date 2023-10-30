FROM ghcr.io/puppeteer/puppeteer:21.4.1@sha256:ef55d88f7fe0576d78f1275634a5f96ee97f5dc60ac0f13eb7f7f2d5ab6ff1c2

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
