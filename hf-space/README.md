---
title: Living World Server
emoji: 🌍
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Living World Server

Backend untuk AI Agent Living World — kampus virtual 3D tempat AI agent bekerja seperti karyawan.

- Node.js + TypeScript + Express
- Job queue + LLM adapter (Gemini `gemini-3-flash-preview`, free tier)
- SSE live updates, tools, audit log
- Health check: `GET /api/health`

## Environment variables (Space Settings → Variables and secrets)

- `GEMINI_API_KEY` — wajib, key gratis dari Google AI Studio
- `NODE_ENV` — `production`

Repo utama: https://github.com/robertcaniago7/ai-agent-living-world
