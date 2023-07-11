FROM ghcr.io/puppeteer/puppeteer:20.8.0@sha256:1a658134bfedf7a14c803664b8973365150c03d0a8fe7dcda41464529d6ecb1b

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
