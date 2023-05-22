FROM ghcr.io/puppeteer/puppeteer:20.3.0@sha256:ae2f88f0051e74c392df69ab80d2e1456da9046a3508974f0366464fabd479ad

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
