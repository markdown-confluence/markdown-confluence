FROM ghcr.io/puppeteer/puppeteer:20.7.4@sha256:064a97427755507cbfba8347d1700f2c13b4f831d6a7b17a5fea9f9671ae6871

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
