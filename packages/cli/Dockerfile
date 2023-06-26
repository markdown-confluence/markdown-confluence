FROM ghcr.io/puppeteer/puppeteer:20.7.3@sha256:149b69a6889ecf1dd0f959f99f5eeb5854a908ef360cd23b2c4e3e756cddb600

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
