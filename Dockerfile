FROM node:22-bookworm-slim

WORKDIR /app

# sqlite3 may need native compilation when a prebuilt binary is unavailable.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_FILE=/var/data/umar-seo-ai.sqlite

RUN mkdir -p /var/data /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl --fail http://127.0.0.1:3000/api/health || exit 1

CMD ["npm", "start"]
