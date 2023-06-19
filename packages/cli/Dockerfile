FROM ghcr.io/puppeteer/puppeteer:20.7.2@sha256:ebab14eb4e1b1e7033cdf1c99fd80b6a4eca57aa587f2b152ab44e228b1898ab

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
