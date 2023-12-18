FROM ghcr.io/puppeteer/puppeteer:21.6.1@sha256:d41d0271c774019a9bf6a1bbec8071d067558815f047bc6f15c84ebab12f0391

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
