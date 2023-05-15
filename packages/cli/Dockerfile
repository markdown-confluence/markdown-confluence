FROM ghcr.io/puppeteer/puppeteer:20.2.0@sha256:84958a4a347dc134416acc66f3b6214e4e83943322cc40ec8e70f7c053fed3ef

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
