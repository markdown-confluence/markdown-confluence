FROM ghcr.io/puppeteer/puppeteer:21.5.2@sha256:2a447d8d685a370938b917af2745ea5ca33a8b26c657588e86918192b3c6a7bb

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
