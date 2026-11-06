FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]
