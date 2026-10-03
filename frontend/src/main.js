import JSMpeg from '@cycjimmy/jsmpeg-player';
import './styles.css';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ICON = {
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="m6 4 14 8-14 8z"/></svg>',
  expand: '<svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>',
};

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // only used with static ICON strings
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}

async function api(path, opts = {}) {
  const res = await fetch(API + '/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg, err) {
  const t = h('div', { class: 'toast' + (err ? ' err' : '') }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3500);
}

// ---------- state ----------
let cameras = [];
let allPaused = false;
const tiles = new Map(); // id -> tile controller
let focusPlayer = null;
let focusCam = null;

// ---------- players ----------
function wsUrl(id) {
  return `${API.replace(/^http/, 'ws')}/ws/${id}`;
}

function createPlayer(cam, canvas, hooks) {
  let lastFrame = 0;
  let timer = null;
  const player = new JSMpeg.Player(wsUrl(cam.id), {
    canvas, audio: false, autoplay: true, loop: false,
    preserveDrawingBuffer: true, videoBufferSize: 1024 * 1024, reconnectInterval: 3,
    onVideoDecode: () => {
      if (!lastFrame) hooks.onState('live');
      lastFrame = Date.now();
    },
  });
  timer = setInterval(() => {
    if (!lastFrame) return;
    if (Date.now() - lastFrame > 6000) { lastFrame = 0; hooks.onState('connecting'); }
  }, 2000);
  const failTimer = setTimeout(() => { if (!lastFrame) hooks.onState('error'); }, 15000);
  return {
    player,
    destroy() {
      clearInterval(timer); clearTimeout(failTimer);
      try { player.destroy(); } catch { /* already closed */ }
    },
  };
}

// ---------- live grid ----------
function buildTile(cam) {
  const canvas = h('canvas');
  const spinner = h('div', { class: 'spinner' });
  const msg = h('span', {}, 'Connecting…');
  const overlay = h('div', { class: 'overlay' }, spinner, msg);
  const badge = h('div', { class: 'badge connecting' }, h('i', { class: 'dot' }), h('span', {}, 'CONNECTING'));
  const screen = h('div', { class: 'screen', title: 'Click to enlarge' }, canvas, overlay, badge);
  const name = h('strong', {}, cam.name);
  const sub = h('small', {}, cam.location || 'No location');
  const toggle = h('button', { class: 'icon-btn', title: 'Pause / resume', 'aria-label': 'Pause or resume', html: ICON.pause });
  const expand = h('button', { class: 'icon-btn', title: 'Enlarge', 'aria-label': 'Enlarge', html: ICON.expand });
  const el = h('article', { class: 'tile', 'data-id': cam.id },
    screen,
    h('div', { class: 'tile-foot' }, h('div', { class: 'tile-info' }, name, sub), h('div', { class: 'tile-actions' }, toggle, expand)));

  const ctl = { el, cam, running: null, paused: false, name, sub };

  function setState(s) {
    badge.className = 'badge ' + s;
    badge.lastChild.textContent = s === 'live' ? 'LIVE' : s === 'error' ? 'OFFLINE' : 'CONNECTING';
    overlay.hidden = s === 'live';
    spinner.hidden = s === 'error';
    msg.textContent = s === 'error' ? 'Camera unreachable. Retrying…' : 'Connecting…';
  }
  ctl.start = () => {
    if (ctl.running) return;
    ctl.paused = false;
    setState('connecting');
    ctl.running = createPlayer(ctl.cam, canvas, { onState: setState });
    toggle.innerHTML = ICON.pause;
  };
  ctl.stop = () => {
    if (ctl.running) { ctl.running.destroy(); ctl.running = null; }
    ctl.paused = true;
    badge.className = 'badge'; badge.lastChild.textContent = 'PAUSED';
    spinner.hidden = true; msg.textContent = 'Paused'; overlay.hidden = false;
    toggle.innerHTML = ICON.play;
  };
  ctl.restart = () => { if (ctl.running) { ctl.running.destroy(); ctl.running = null; } if (!ctl.paused) ctl.start(); };
  toggle.onclick = () => (ctl.running ? ctl.stop() : ctl.start());
  expand.onclick = screen.onclick = () => openViewer(ctl.cam);
  return ctl;
}

function renderLive() {
  const grid = $('#grid');
  const ids = new Set(cameras.map((c) => c.id));
  for (const [id, t] of tiles) if (!ids.has(id)) { t.stop(); t.el.remove(); tiles.delete(id); }
  for (const cam of cameras) {
    let t = tiles.get(cam.id);
    if (!t) {
      t = buildTile(cam);
      tiles.set(cam.id, t);
      grid.append(t.el);
      if (!allPaused && currentView === 'live') t.start(); else t.stop();
    } else {
      const key = (c) => [c.protocol, c.ip, c.port, c.username, c.password, c.path, c.quality].join('|');
      const urlChanged = key(t.cam) !== key(cam);
      t.cam = cam;
      t.name.textContent = cam.name;
      t.sub.textContent = cam.location || 'No location';
      if (urlChanged) t.restart();
    }
  }
  // keep DOM order equal to camera order
  for (const cam of cameras) grid.append(tiles.get(cam.id).el);
  $('#liveEmpty').hidden = cameras.length > 0;
}

// ---------- camera management ----------
function renderCameras() {
  const q = $('#search').value.trim().toLowerCase();
  const list = cameras.filter((c) => !q || `${c.name} ${c.location}`.toLowerCase().includes(q));
  const root = $('#camList');
  root.replaceChildren(...list.map((cam) => {
    const thumb = h('div', { class: 'thumb', html: ICON.cam });
    const img = new Image();
    img.onload = () => { thumb.style.backgroundImage = `url(${img.src})`; thumb.replaceChildren(); };
    img.src = `${API}/api/cameras/${cam.id}/snapshot?t=${Math.floor(Date.now() / 30000)}`;
    const live = cam.state === 'live';
    return h('article', { class: 'cam-card' },
      thumb,
      h('div', { class: 'cam-body' },
        h('h3', {}, cam.name),
        h('span', { class: 'loc' }, cam.location || 'No location'),
        h('span', { class: 'url' }, maskUrl(cam.url)),
        h('div', { class: 'chips' },
          h('span', { class: 'chip' + (live ? ' live' : '') }, live ? `Live · ${cam.viewers} viewing` : 'Idle'),
          h('span', { class: 'chip' }, cam.quality))),
      h('div', { class: 'cam-actions' },
        h('button', { class: 'btn ghost', onclick: () => openViewer(cam) }, 'Watch'),
        h('button', { class: 'btn ghost', onclick: () => openForm(cam) }, 'Edit'),
        h('button', { class: 'btn ghost danger', onclick: () => removeCam(cam) }, 'Delete')));
  }));
  $('#camEmpty').hidden = list.length > 0;
}

function maskUrl(u) { return u.replace(/\/\/([^:@/]+):[^@/]*@/, '//$1:••••@'); }

async function removeCam(cam) {
  if (!confirm(`Delete "${cam.name}"?`)) return;
  try { await api(`/cameras/${cam.id}`, { method: 'DELETE' }); toast('Camera deleted'); await refresh(); }
  catch (e) { toast(e.message, true); }
}

// form
const dlg = $('#camDialog');
const form = $('#camForm');
let editingId = null;
const DEFAULT_PORT = { rtsp: 554, rtsps: 322, http: 80, https: 443 };
function updatePortHint() {
  const p = DEFAULT_PORT[form.elements.protocol.value];
  form.elements.port.placeholder = String(p);
  const hint = form.elements.protocol.value.startsWith('rtsp') ? 'stream1' : 'video.mjpg';
  form.elements.path.placeholder = hint + ' (optional)';
}
$('#protocol').addEventListener('change', updatePortHint);

// Builds the URL from the form fields as you type (password is masked in the preview).
const urlField = $('#urlPreview');
function buildUrl(maskPass) {
  const f = form.elements;
  const ip = f.ip.value.trim();
  if (!ip) return '';
  const proto = f.protocol.value;
  const port = f.port.value.trim() || DEFAULT_PORT[proto];
  const user = f.username.value.trim();
  const pass = f.password.value;
  const auth = user ? encodeURIComponent(user) + (pass ? ':' + (maskPass ? '••••' : encodeURIComponent(pass)) : '') + '@' : '';
  return `${proto}://${auth}${ip}:${port}/${f.path.value.trim().replace(/^\/+/, '')}`;
}
// Pasting "192.168.1.10:8554" (or a full rtsp://… URL) into the IP box splits it into the separate fields.
form.elements.ip.addEventListener('change', () => {
  const f = form.elements;
  let v = f.ip.value.trim();
  const full = /^(rtsps?|https?):\/\/(?:([^:@/]*)(?::([^@/]*))?@)?([^:/]+)(?::(\d+))?(?:\/(.*))?$/i.exec(v);
  if (full) {
    f.protocol.value = full[1].toLowerCase();
    if (full[2]) f.username.value = decodeURIComponent(full[2]);
    if (full[3]) f.password.value = decodeURIComponent(full[3]);
    if (full[5]) f.port.value = full[5];
    if (full[6]) f.path.value = full[6];
    f.ip.value = full[4];
  } else {
    const hp = /^([^:/]+):(\d{1,5})$/.exec(v);
    if (hp) { f.ip.value = hp[1]; f.port.value = hp[2]; }
  }
  updatePortHint();
  refreshUrl();
});
const refreshUrl = () => (urlField.value = buildUrl(true));
form.addEventListener('input', refreshUrl);
form.addEventListener('change', refreshUrl);
$('#copyUrl').onclick = async () => {
  const url = buildUrl(false);
  if (!url) return;
  try { await navigator.clipboard.writeText(url); toast('URL copied'); } catch { toast('Copy not available', true); }
};

function openForm(cam) {
  editingId = cam ? cam.id : null;
  $('#dlgTitle').textContent = cam ? 'Edit camera' : 'Add camera';
  form.reset();
  if (cam) for (const k of ['name', 'protocol', 'ip', 'port', 'username', 'password', 'path', 'location', 'quality']) form.elements[k].value = cam[k] ?? '';
  updatePortHint();
  refreshUrl();
  $('#testMsg').textContent = ''; $('#formErr').textContent = '';
  dlg.showModal();
  form.elements.name.focus();
}

$('#testBtn').onclick = async (e) => {
  const btn = e.currentTarget, msg = $('#testMsg');
  if (!form.elements.ip.value.trim()) {
    msg.className = 'test-msg bad'; msg.textContent = '✗ Enter the IP address first';
    form.elements.ip.focus();
    return;
  }
  const label = btn.textContent;
  msg.className = 'test-msg'; msg.textContent = 'Connecting… (up to 12s)';
  btn.disabled = true; btn.textContent = 'Testing…';
  const t0 = performance.now();
  try {
    const r = await api('/test', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    msg.className = 'test-msg ' + (r.ok ? 'ok' : 'bad');
    msg.textContent = r.ok ? `✓ Connected, video received (${secs}s)` : '✗ ' + (r.error || 'Failed');
  } catch (err) { msg.className = 'test-msg bad'; msg.textContent = '✗ ' + err.message; }
  btn.disabled = false; btn.textContent = label;
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(form));
  const btn = $('#saveBtn'); btn.disabled = true; $('#formErr').textContent = '';
  try {
    await api(editingId ? `/cameras/${editingId}` : '/cameras', { method: editingId ? 'PUT' : 'POST', body });
    dlg.close();
    toast(editingId ? 'Camera updated' : 'Camera added');
    await refresh();
  } catch (err) { $('#formErr').textContent = err.message; }
  btn.disabled = false;
});

// ---------- focus viewer ----------
const vDlg = $('#viewDialog');
function openViewer(cam) {
  closeViewer();
  focusCam = cam;
  $('#vTitle').textContent = cam.name;
  $('#vSub').textContent = cam.location || maskUrl(cam.url);
  const canvas = h('canvas');
  const overlay = h('div', { class: 'overlay' }, h('div', { class: 'spinner' }), h('span', {}, 'Connecting…'));
  $('#vStage').replaceChildren(canvas, overlay);
  // free the grid stream so the camera only gets one connection per viewer
  focusPlayer = createPlayer(cam, canvas, { onState: (s) => (overlay.hidden = s === 'live') });
  if (!vDlg.open) vDlg.showModal();
}
function closeViewer() {
  if (focusPlayer) { focusPlayer.destroy(); focusPlayer = null; }
  $('#vStage').replaceChildren();
}
vDlg.addEventListener('close', closeViewer);
$('#vFull').onclick = () => {
  const st = $('#vStage');
  document.fullscreenElement ? document.exitFullscreen() : st.requestFullscreen?.();
};
$('#vShot').onclick = () => {
  const c = $('#vStage canvas');
  if (!c) return;
  const a = h('a', { href: c.toDataURL('image/png'), download: `${focusCam.name.replace(/\W+/g, '_')}_${Date.now()}.png` });
  a.click();
};
$$('[data-close]').forEach((b) => (b.onclick = () => b.closest('dialog').close()));
// close on backdrop click
[dlg, vDlg].forEach((d) => d.addEventListener('mousedown', (e) => { if (e.target === d) d.close(); }));

// ---------- navigation & chrome ----------
let currentView = 'live';
function setView(v) {
  currentView = v;
  $$('.view').forEach((s) => (s.hidden = s.id !== 'view-' + v));
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  $('#pageTitle').textContent = v === 'live' ? 'Live View' : 'Cameras';
  document.body.dataset.view = v;
  const live = v === 'live';
  $('#layoutSeg').style.display = live ? '' : 'none';
  $('#pauseAll').style.display = live ? '' : 'none';
  // only stream tiles while the live view is visible
  for (const t of tiles.values()) live ? (!allPaused && t.start()) : t.stop();
  if (v === 'cameras') renderCameras();
}
$$('.nav-item').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$$('[data-open-add]').forEach((b) => (b.onclick = () => openForm()));
$('#addBtn').onclick = () => openForm();
$('#search').addEventListener('input', renderCameras);

$$('#layoutSeg button').forEach((b) => (b.onclick = () => {
  $$('#layoutSeg button').forEach((x) => x.classList.toggle('active', x === b));
  const cols = b.dataset.cols;
  cols === '0' ? $('#grid').removeAttribute('data-cols') : ($('#grid').dataset.cols = cols);
  try { localStorage.setItem('cols', cols); } catch { /* ignore */ }
}));
$('#pauseAll').onclick = () => {
  allPaused = !allPaused;
  for (const t of tiles.values()) allPaused ? t.stop() : t.start();
  $('#pauseAll').querySelector('span').textContent = allPaused ? 'Resume all' : 'Pause all';
  $('#pauseAll').querySelector('svg').outerHTML = allPaused ? ICON.play : ICON.pause;
};
$('#themeBtn').onclick = () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* ignore */ }
};

// ---------- data refresh ----------
let lastSig = '';
async function refresh() {
  try {
    cameras = await api('/cameras');
  } catch { return; }
  $('#statTotal').textContent = cameras.length;
  $('#statOnline').textContent = cameras.filter((c) => c.state === 'live').length;
  renderLive();
  const sig = JSON.stringify(cameras.map((c) => [c.id, c.name, c.url, c.location, c.quality, c.state, c.viewers]));
  if (currentView === 'cameras' && !dlg.open && sig !== lastSig) renderCameras();
  lastSig = sig;
}

(async function init() {
  try {
    const t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t;
    const c = localStorage.getItem('cols');
    if (c) $(`#layoutSeg button[data-cols="${c}"]`)?.click();
  } catch { /* ignore */ }
  try { const hc = await api('/health'); $('#ffBanner').hidden = hc.ffmpeg; } catch { /* ignore */ }
  setView('live');
  await refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 5000);
  // stop wasting bandwidth while the tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (currentView !== 'live' || allPaused) return;
    for (const t of tiles.values()) document.hidden ? t.stop() : t.start();
  });
})();
