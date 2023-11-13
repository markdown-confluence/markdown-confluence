FROM ghcr.io/puppeteer/puppeteer:21.5.1@sha256:b166cc0bd4cc7ed377994224b94320ad9297931d2710f4d35fb90b7230451b4c

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
