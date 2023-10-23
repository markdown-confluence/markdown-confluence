FROM ghcr.io/puppeteer/puppeteer:21.4.0@sha256:09806828ac7caf2338e413236da856a4b746b8451262111e1da41f2a8b2bb29f

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
