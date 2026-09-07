FROM node:26.8.1-bookworm-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates chromium fonts-liberation \
	&& rm -rf /var/lib/apt/lists/*

RUN groupadd --system pptruser \
	&& useradd --system --gid pptruser --groups audio,video --create-home pptruser \
	&& mkdir -p /home/pptruser/.cache/puppeteer /content \
	&& chown -R pptruser:pptruser /home/pptruser /content

COPY --chown=pptruser:pptruser ./dist /app

ENV NODE_OPTIONS=--enable-source-maps \
	PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer" \
	PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium" \
	PUPPETEER_SKIP_DOWNLOAD="true"

WORKDIR "/content"

USER pptruser

ENTRYPOINT ["node", "/app/index.js"]
CMD []
