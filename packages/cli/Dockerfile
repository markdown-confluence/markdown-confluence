FROM ghcr.io/puppeteer/puppeteer:21.3.8@sha256:a199d1974033b0864243fa866b2e35392c0a6d363e5434d6557eb5070d9f3777

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
