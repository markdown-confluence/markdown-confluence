FROM ghcr.io/puppeteer/puppeteer:20.4.0@sha256:6118658cee1b4cea19baa454436e2e1e0e74b527f648bea3b2224d777a4ca873

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
