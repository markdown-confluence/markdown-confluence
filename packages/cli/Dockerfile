FROM ghcr.io/puppeteer/puppeteer:21.3.4@sha256:a544aedd2b457c634413b86e7b82f7c2e01d55c9a1f6d92b090b05a7205d547d

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
