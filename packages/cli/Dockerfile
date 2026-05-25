FROM ghcr.io/puppeteer/puppeteer:25.0.4@sha256:dd3ccf9c72cbaec14baea3f8fa8f9eb8b73ea069a57108366f2e5e8a80f7f661

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
