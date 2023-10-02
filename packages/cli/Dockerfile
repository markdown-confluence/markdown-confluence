FROM ghcr.io/puppeteer/puppeteer:21.3.6@sha256:e8789d21a24692e020a105f488155d249409473f3e1e619dbab463d678f72ed9

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
