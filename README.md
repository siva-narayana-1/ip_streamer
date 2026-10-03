# RTSP Live Viewer

A Node.js web app for managing IP cameras and watching their RTSP streams live in the browser.
Responsive UI (desktop, tablet, phone), light/dark theme, PostgreSQL storage.

## How it works

```
RTSP camera ──► ffmpeg (transcode to MPEG-TS) ──► Node.js ──WebSocket──► JSMpeg player (browser)
                                                     │
                                                 PostgreSQL (camera list)
```

Browsers cannot play RTSP, so the server runs one `ffmpeg` process per camera, converts the feed
to MPEG1 video and pushes it over a WebSocket. The process is shared by all viewers of that camera
and is stopped when the last viewer leaves. If a camera drops, it reconnects every 3 seconds.

## Requirements

- Node.js 18+
- [ffmpeg](https://ffmpeg.org/download.html) on your `PATH` (or set `FFMPEG_PATH`)
- PostgreSQL 12+

## Setup

The project has two separate apps: `backend/` (API + streaming, port 3000) and `frontend/` (Vite UI, port 5173).

**Backend**
```bash
cd backend
npm install
copy .env.example .env     # then edit DB_* values
npm run db:create          # creates the database if missing (first time)
npm start                  # or: npm run dev  (auto-restart)
```

**Frontend** (second terminal)
```bash
cd frontend
npm install
copy .env.example .env     # VITE_API_URL = backend address
npm run dev                # dev server with hot reload  -> http://localhost:5173
```

**Production build**
```bash
cd frontend
npm run build              # outputs frontend/dist (static files, host anywhere)
npm start                  # serves the build on :5173 (vite preview)
```
`VITE_API_URL` is baked in at build time, and the backend's `CORS_ORIGIN` must include the frontend's origin.

## Configuration

Backend `.env`:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | API port |
| `HOST` | `127.0.0.1` | Bind address (`0.0.0.0` exposes on your network) |
| `CORS_ORIGIN` | `http://localhost:5173,...` | Allowed frontend origins, comma separated (`*` = any) |
| `DATABASE_URL` | – | Full connection string; overrides `DB_*` |
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | Postgres server |
| `DB_USER` / `DB_PASSWORD` | `postgres` / – | Credentials |
| `DB_NAME` | `rtsp_viewer` | Database name |
| `FFMPEG_PATH` | `ffmpeg` | ffmpeg binary path |

Frontend `.env`: `VITE_API_URL` (default `http://localhost:3000`).
`.env` files are git-ignored; commit only `.env.example`.

## Using the app

- **Live View** – grid of all cameras. Pick 1–4 columns or Auto, pause/resume per camera or all,
  click a tile to enlarge (fullscreen and PNG snapshot available).
- **Cameras** – add, edit, delete and search cameras. Use **Test connection** before saving.
  Quality: Low (640px), Medium (960px), High (up to 1080p).

Each camera is entered as separate fields: **protocol** (RTSP, RTSPS, HTTP, HTTPS), **IP/host**, **port**
(defaults 554 / 322 / 80 / 443), optional **username** and **password**, and a **stream path**. The server builds
the URL (credentials are URL-encoded) and ffmpeg converts it, so HTTP sources such as MJPEG or HLS work too.

| Brand | Protocol | Port | Path |
|---|---|---|---|
| Hikvision | RTSP | 554 | `Streaming/Channels/101` |
| Dahua | RTSP | 554 | `cam/realmonitor?channel=1&subtype=0` |
| Generic RTSP | RTSP | 554 | `stream1` |
| Generic MJPEG | HTTP | 80 / 8080 | `video.mjpg` |

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/cameras` | List cameras with live state and viewer count |
| POST | `/api/cameras` | Add a camera `{name, protocol, ip, port?, username?, password?, path?, location?, quality?}` |
| PUT | `/api/cameras/:id` | Update a camera |
| DELETE | `/api/cameras/:id` | Delete a camera |
| POST | `/api/test` | Test a connection (same fields as add) |
| GET | `/api/cameras/:id/snapshot` | JPEG snapshot (cached 20s) |
| GET | `/api/health` | Server and ffmpeg status |
| WS | `/ws/:id` | MPEG-TS live stream |

## Security notes

- There is **no authentication**. Keep `HOST=127.0.0.1`, or put the app behind a reverse proxy with auth / VPN.
- RTSP URLs (including passwords) are stored in plain text in the database. Restrict DB access accordingly
  and use a dedicated low-privilege camera account.

## Troubleshooting

- **"Cannot connect to PostgreSQL"** – check `.env` credentials and that the Postgres service is running.
- **Tile stays on "Connecting…" / OFFLINE** – use *Test connection*; confirm the camera is reachable
  from the server and the URL, port (usually 554) and credentials are correct.
- **"ffmpeg was not found"** banner – install ffmpeg or set `FFMPEG_PATH`, then restart.
- High CPU with many cameras – use Low quality; each viewed camera is one ffmpeg transcode.

## Project layout

```
backend/
  server.js      Express API, WebSocket streaming, ffmpeg management
  db.js          PostgreSQL access (pg)
  scripts/       create-db.js helper
frontend/
  index.html     Page markup
  src/main.js    App logic (JSMpeg player, camera management)
  src/styles.css Responsive styles
  vite.config.js
```
