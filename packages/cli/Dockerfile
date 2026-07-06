FROM ghcr.io/puppeteer/puppeteer:25.3.0@sha256:9665f5b57abc5cc7080a641878964018de219055a4d2c9d8d050ceb1161778ba

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
