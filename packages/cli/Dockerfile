FROM ghcr.io/puppeteer/puppeteer:21.5.0@sha256:a7d11282d6eb2e02b3a5f424b24f137055706dee67981bdcc31c0622ae53b80c

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
