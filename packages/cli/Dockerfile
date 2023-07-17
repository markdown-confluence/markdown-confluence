FROM ghcr.io/puppeteer/puppeteer:20.8.2@sha256:f3bd7c858d6ba5e8759917b6bf5504837e7ffab74971bac7789c5349177d1aa6

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
