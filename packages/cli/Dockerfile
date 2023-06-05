FROM ghcr.io/puppeteer/puppeteer:20.5.0@sha256:c40e0fa5da89259dbd93e0421e7faec7c39efef36fd7cbb62b24ff7f7151602b

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
