FROM ghcr.io/puppeteer/puppeteer:21.0.3@sha256:fbcfbc5e04b2bb8816ef57e9c30e43d32484cfcd2ee0c26b3b75cc2c48809bc1

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
