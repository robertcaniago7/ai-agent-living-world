# Living World backend — Dockerfile for Koyeb (free tier, no card).
# Build context: server/ (set "Root directory" to `server` in Koyeb,
# or build from repo root with `-f server/Dockerfile`).
# Koyeb sets $PORT automatically; the server listens on process.env.PORT.
# Env yang wajib diisi di dashboard Koyeb: GEMINI_API_KEY (gratis, dari
# Google AI Studio). NODE_ENV=production opsional.
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 8787
CMD ["npm", "start"]
