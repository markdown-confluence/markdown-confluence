FROM ghcr.io/puppeteer/puppeteer:20.0.0@sha256:2c7492147ab3cabcd948b6eb42032b6506103db8ca8a41e3f839c366b3f60f77

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps

WORKDIR "/content"

CMD ["node", "/app/index.js"]
