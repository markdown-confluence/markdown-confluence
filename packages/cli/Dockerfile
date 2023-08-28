FROM ghcr.io/puppeteer/puppeteer:21.1.1@sha256:26ffbf56e7d196924c7dde869d683f482e20787ff24c0117dc6c806956c23902

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
