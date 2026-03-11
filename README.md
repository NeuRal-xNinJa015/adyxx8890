# 🛡️ ADYX — Zero-Knowledge Communication Platform

**End-to-end encrypted, zero-trace messaging. No login. No stored data. Just secure conversations.**

> No phone number. No email. No identity. Rooms that vanish.

---

## Quick Start

```bash
# 1. Install everything
npm run install:all

# 2. Build frontend + start server (production)
npm start
```

Open **<http://localhost:8443>** → Create a room → Share the code → Chat with E2E encryption.

---

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Build frontend and start unified server |
| `npm run serve` | Start server only (requires prior build) |
| `npm run dev` | Development mode (hot-reload frontend + backend) |
| `npm run build` | Build frontend only |
| `npm run clean` | Remove frontend build artifacts |
| `npm run health` | Check if server is running |
| `npm run install:all` | Install all dependencies |

---

## Project Structure

```
adyx/
├── backend/
│   ├── server.js          # Unified server (WebSocket + Static)
│   ├── secureServer.js    # Security middleware wrapper
│   ├── security/          # Rate limiter, headers, threat detection
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main application
│   │   ├── components/    # React components (20)
│   │   ├── lib/
│   │   │   ├── ws.js      # WebSocket client
│   │   │   ├── crypto.js  # E2E encryption (ECDH + AES-GCM)
│   │   │   └── security/  # Client-side security modules
│   │   └── index.css      # Design system
│   ├── index.html         # Entry point
│   └── vite.config.js     # Vite configuration
├── integration/
│   ├── PRD.md             # Product Requirements
│   ├── docker-compose.yml # Infrastructure services
│   └── docs/              # Architecture docs
├── Dockerfile             # Multi-stage production build
├── package.json           # Root orchestration
├── .env.example           # Environment template
└── README.md
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  ADYX Server                     │
│                 (Node.js)                        │
│                                                  │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ HTTP Server   │  │ WebSocket Server        │  │
│  │              │  │                         │  │
│  │ • /health    │  │ • Auth                  │  │
│  │ • /api/info  │  │ • Room Create/Join      │  │
│  │ • Static     │  │ • ECDH Key Exchange     │  │
│  │   Files      │  │ • Encrypted Messages    │  │
│  │   (SPA)      │  │ • File Transfer         │  │
│  │              │  │ • Typing Indicators     │  │
│  └──────────────┘  └─────────────────────────┘  │
│                                                  │
│  Rate Limiting • Heartbeat • Room TTL Cleanup    │
│  Gzip Compression • Cache Headers • CORS         │
└─────────────────────────────────────────────────┘
          ↑                        ↑
    HTTP Requests           WebSocket Frames
          ↑                        ↑
┌─────────────────────────────────────────────────┐
│              ADYX Frontend                       │
│           (React + Vite)                         │
│                                                  │
│  Web Crypto API (ECDH P-256 + AES-256-GCM)      │
│  Framer Motion • GSAP • Glassmorphism UI         │
└─────────────────────────────────────────────────┘
```

---

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8443` | Server port |
| `NODE_ENV` | `production` | `production` = caching, gzip, minimal logs. `development` = verbose |

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

---

## Docker

```bash
# Build image
docker build -t adyx .

# Run container
docker run -d -p 8443:8443 --name adyx adyx

# Check health
docker exec adyx wget -qO- http://localhost:8443/health
```

---

## Development

For active development with hot-reload:

```bash
npm run dev
```

This runs:

- **Backend** on port `8443` (WebSocket relay + health check)
- **Frontend** on port `5173` (Vite dev server, proxies WS to backend)

Open **<http://localhost:5173>** for development with hot module replacement.

---

## Security

- **E2E Encryption** — ECDH P-256 key exchange + AES-256-GCM message encryption
- **Zero Knowledge** — Server never sees plaintext; acts only as an encrypted relay
- **Zero Storage** — No messages, no logs, no user data persisted
- **Rate Limiting** — 5 rooms/min, 60 messages/min per device
- **Room TTL** — Rooms auto-expire after 10 minutes of inactivity
- **Secure File Transfer** — Files encrypted client-side, chunked, with separate key channel

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 19 + Vite 6 + Framer Motion |
| Backend | Node.js + native `ws` library |
| Encryption | Web Crypto API (ECDH P-256 + AES-256-GCM) |
| Protocol | JSON over WebSocket |
| Styling | Vanilla CSS with glassmorphism + animations |

---

## License

**Proprietary** — All Rights Reserved.
