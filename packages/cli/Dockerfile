FROM ghcr.io/puppeteer/puppeteer:24.43.1@sha256:75e3404b1df87e39eec2af9fa95e4e0fdbc5c73fc924aafa1429c89a2a3e8654

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
