# Living World backend — root Dockerfile for hosts that build from the repo root
# (Back4App Containers, Render Docker, etc.).
# Build context: repo root. The server lives in server/ (Node + TS + Express).
# The server listens on $PORT (default 8787); the host sets PORT.
# Env yang wajib diisi di dashboard host: GEMINI_API_KEY (gratis, dari
# Google AI Studio). NODE_ENV=production opsional.
FROM node:20-slim
WORKDIR /app
COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build
EXPOSE 8787
CMD ["npm", "start"]
