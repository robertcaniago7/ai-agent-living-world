# Living World backend — Dockerfile for Hugging Face Spaces (Docker SDK, free tier, no card).
# HF routes external traffic to port 7860, so the server listens on $PORT=7860.
# Secret yang wajib diisi di Space Settings -> Variables and secrets:
#   GEMINI_API_KEY (gratis, dari Google AI Studio)
#   NODE_ENV=production (opsional)
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV PORT=7860
EXPOSE 7860
CMD ["npm", "start"]
