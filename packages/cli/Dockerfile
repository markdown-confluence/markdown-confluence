FROM ghcr.io/puppeteer/puppeteer:20.1.2@sha256:6b2577355e4cd7453be1a60a1b0ab00307faf2a918ad2ce67ad1128f77fb41e7

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps

WORKDIR "/content"

CMD ["node", "/app/index.js"]
