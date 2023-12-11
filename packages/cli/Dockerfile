FROM ghcr.io/puppeteer/puppeteer:21.6.0@sha256:48721c27221cb3bb73ac84f02d019a601c4ec9b91f547ba85c3f36adee2efccf

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
