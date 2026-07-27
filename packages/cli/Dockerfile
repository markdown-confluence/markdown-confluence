FROM ghcr.io/puppeteer/puppeteer:25.4.0@sha256:d93009ac8e1b8f307d59847b82404b51fd1672ddd6bdd5a4016a1cd9b5afd94d

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
