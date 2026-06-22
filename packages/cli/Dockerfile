FROM ghcr.io/puppeteer/puppeteer:25.2.0@sha256:fbb10fd614ec0e97f707f86184127b8a4edce4797c9e5018d1ad334e3836c62f

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
