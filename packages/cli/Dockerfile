FROM ghcr.io/puppeteer/puppeteer:21.0.1@sha256:c44ad27912641963db3368de8c362d98758916b3e2452807aec7ee0646736703

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
