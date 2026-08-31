FROM ghcr.io/puppeteer/puppeteer:25.9.0@sha256:5c341215d78353c3416b6c92aae9fac66e8f11c146c3753234980443d6792f8f

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
