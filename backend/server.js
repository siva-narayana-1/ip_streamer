'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // set HOST=0.0.0.0 to expose on your LAN
const db = require('./db');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const ffmpegAvailable = !spawnSync(FFMPEG, ['-version']).error;

// ---------- storage ----------
// PostgreSQL is the source of truth; `cameras` is an in-memory copy used by the stream code.
let cameras = [];

const PROTOCOLS = { rtsp: 554, rtsps: 322, http: 80, https: 443 };

function validate(body) {
  const name = String(body.name || '').trim();
  const protocol = String(body.protocol || 'rtsp').toLowerCase();
  const ip = String(body.ip || '').trim();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const path = String(body.path || '').trim().replace(/^\/+/, '');
  const location = String(body.location || '').trim();
  const quality = ['low', 'medium', 'high'].includes(body.quality) ? body.quality : 'medium';
  if (!(protocol in PROTOCOLS)) return { error: 'Protocol must be rtsp, rtsps, http or https.' };
  const port = body.port === '' || body.port == null ? PROTOCOLS[protocol] : Number(body.port);
  if (!name || name.length > 60) return { error: 'Name is required (max 60 characters).' };
  if (!/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(ip) || ip.length > 253) return { error: 'Enter a valid IP address or hostname.' };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'Port must be between 1 and 65535.' };
  if (username.length > 100 || password.length > 200) return { error: 'Username or password is too long.' };
  if (/\s/.test(path) || path.length > 300) return { error: 'Stream path must not contain spaces.' };
  if (location.length > 80) return { error: 'Location is too long.' };
  return { value: { name, protocol, ip, port, username, password, path, location, quality } };
}

// Builds the stream URL from the separate fields (credentials are URL-encoded).
function streamUrl(c, mask = false) {
  const pass = c.password ? ':' + (mask ? '****' : encodeURIComponent(c.password)) : '';
  const auth = c.username ? encodeURIComponent(c.username) + pass + '@' : '';
  return c.protocol + '://' + auth + c.ip + ':' + c.port + '/' + c.path;
}

// ---------- ffmpeg helpers ----------
const QUALITY = {
  low: { width: 640, bitrate: '600k', fps: 15 },
  medium: { width: 960, bitrate: '1200k', fps: 25 },
  high: { width: 1920, bitrate: '3500k', fps: 25 },
};

function inputArgs(url) {
  const args = ['-hide_banner', '-loglevel', 'error'];
  if (/^rtsps?:/i.test(url)) args.push('-rtsp_transport', 'tcp', '-timeout', '8000000');
  else args.push('-rw_timeout', '8000000');
  args.push('-i', url);
  return args;
}

// One ffmpeg process per camera, shared by every viewer.
const streams = new Map(); // id -> { proc, clients:Set, state, restartTimer, lastError }

function startStream(cam) {
  let s = streams.get(cam.id);
  if (!s) {
    s = { proc: null, clients: new Set(), state: 'connecting', restartTimer: null, lastError: '' };
    streams.set(cam.id, s);
  }
  if (s.proc || s.restartTimer) return s;
  const q = QUALITY[cam.quality] || QUALITY.medium;
  const args = [
    ...inputArgs(streamUrl(cam)),
    '-an',
    '-f', 'mpegts',
    '-codec:v', 'mpeg1video',
    '-vf', `scale='min(${q.width},iw)':-2`,
    '-b:v', q.bitrate,
    '-r', String(q.fps),
    '-bf', '0',
    '-muxdelay', '0.001',
    'pipe:1',
  ];
  s.state = 'connecting';
  const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  s.proc = proc;
  let gotData = false;
  proc.stdout.on('data', (chunk) => {
    if (!gotData) { gotData = true; s.state = 'live'; s.lastError = ''; }
    for (const ws of s.clients) if (ws.readyState === 1) ws.send(chunk, { binary: true });
  });
  proc.stderr.on('data', (d) => { s.lastError = d.toString().trim().split('\n').pop().slice(0, 300); });
  proc.on('error', (e) => { s.lastError = e.message; });
  proc.on('close', () => {
    s.proc = null;
    if (s.clients.size > 0) {
      s.state = 'error';
      s.restartTimer = setTimeout(() => {
        s.restartTimer = null;
        const c = cameras.find((x) => x.id === cam.id);
        if (c && s.clients.size > 0) startStream(c);
      }, 3000);
    } else {
      streams.delete(cam.id);
    }
  });
  return s;
}

function stopStream(id) {
  const s = streams.get(id);
  if (!s) return;
  clearTimeout(s.restartTimer);
  s.restartTimer = null;
  for (const ws of s.clients) ws.close(1000, 'stream stopped');
  s.clients.clear();
  if (s.proc) s.proc.kill('SIGKILL');
  streams.delete(id);
}

function runFfmpeg(args, timeoutMs, wantStdout) {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const out = [];
    let err = '';
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    if (wantStdout) proc.stdout.on('data', (d) => out.push(d));
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: e.message }); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, error: err.trim().split('\n').pop(), data: Buffer.concat(out) });
    });
  });
}

const snapCache = new Map(); // id -> { at, data }
async function snapshot(cam) {
  const hit = snapCache.get(cam.id);
  if (hit && Date.now() - hit.at < 20000) return hit.data;
  const r = await runFfmpeg(
    [...inputArgs(streamUrl(cam)), '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'],
    12000, true,
  );
  if (!r.ok || !r.data.length) return null;
  snapCache.set(cam.id, { at: Date.now(), data: r.data });
  return r.data;
}

// ---------- http api ----------
const app = express();
app.use(express.json({ limit: '50kb' }));
// CORS_ORIGIN: comma-separated frontend origins, or * for any (default: the local dev frontend)
const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((o) => o.trim());
app.use(cors({ origin: origins.includes('*') ? true : origins }));

const publicCam = (c) => {
  const s = streams.get(c.id);
  return { ...c, url: streamUrl(c, true), state: s ? s.state : 'idle', viewers: s ? s.clients.size : 0, error: s ? s.lastError : '' };
};

app.get('/api/health', (_req, res) => res.json({ ok: true, ffmpeg: ffmpegAvailable }));
app.get('/api/cameras', (_req, res) => res.json(cameras.map(publicCam)));

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Database error.' }); });

app.post('/api/cameras', wrap(async (req, res) => {
  const { error, value } = validate(req.body || {});
  if (error) return res.status(400).json({ error });
  const cam = await db.insertCamera({ id: crypto.randomUUID(), ...value });
  cameras.push(cam);
  res.status(201).json(publicCam(cam));
}));

app.put('/api/cameras/:id', wrap(async (req, res) => {
  const cam = cameras.find((c) => c.id === req.params.id);
  if (!cam) return res.status(404).json({ error: 'Camera not found.' });
  const { error, value } = validate(req.body || {});
  if (error) return res.status(400).json({ error });
  const changed = streamUrl(cam) !== streamUrl(value) || cam.quality !== value.quality;
  Object.assign(cam, await db.updateCamera(cam.id, value));
  snapCache.delete(cam.id);
  if (changed) stopStream(cam.id); // viewers auto-reconnect with the new settings
  res.json(publicCam(cam));
}));

app.delete('/api/cameras/:id', wrap(async (req, res) => {
  const i = cameras.findIndex((c) => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Camera not found.' });
  await db.deleteCamera(req.params.id);
  stopStream(req.params.id);
  snapCache.delete(req.params.id);
  cameras.splice(i, 1);
  res.status(204).end();
}));

app.post('/api/test', async (req, res) => {
  const { error, value } = validate({ ...(req.body || {}), name: 'test' });
  if (error) return res.status(400).json({ ok: false, error });
  const url = streamUrl(value);
  if (!ffmpegAvailable) return res.json({ ok: false, error: 'ffmpeg is not installed on the server.' });
  const r = await runFfmpeg([...inputArgs(url), '-frames:v', '1', '-f', 'null', '-'], 12000, false);
  res.json({ ok: r.ok, error: r.ok ? '' : r.error || 'Timed out connecting to the camera.' });
});

app.get('/api/cameras/:id/snapshot', async (req, res) => {
  const cam = cameras.find((c) => c.id === req.params.id);
  if (!cam) return res.status(404).end();
  const img = await snapshot(cam);
  if (!img) return res.status(502).end();
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }).send(img);
});

// ---------- websocket live streams ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const m = /^\/ws\/([\w-]+)/.exec(req.url || '');
  const cam = m && cameras.find((c) => c.id === m[1]);
  if (!cam) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const s = startStream(cam);
    s.clients.add(ws);
    ws.on('close', () => {
      s.clients.delete(ws);
      if (s.clients.size === 0) {
        clearTimeout(s.restartTimer);
        s.restartTimer = null;
        if (s.proc) s.proc.kill('SIGKILL');
        else streams.delete(cam.id);
      }
    });
    ws.on('error', () => ws.terminate());
  });
});

(async () => {
  try {
    await db.init();
    cameras = await db.listCameras();
  } catch (e) {
    console.error(`Cannot connect to PostgreSQL: ${e.message}
Check the DB_* / DATABASE_URL values in your .env file.`);
    process.exit(1);
  }
  server.listen(PORT, HOST, () => {
    console.log(`RTSP viewer running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    if (!ffmpegAvailable) console.warn('WARNING: ffmpeg not found. Install it or set FFMPEG_PATH.');
  });
})();

function shutdown() {
  for (const id of [...streams.keys()]) stopStream(id);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
