FROM node:20-slim AS base
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 3000

# ---- dev: hot-reload for local development
FROM base AS dev
CMD ["npm", "run", "dev"]

# ---- prod: pre-built Next.js app, just start
FROM base AS prod
RUN npm run build
CMD ["npm", "run", "start"]
