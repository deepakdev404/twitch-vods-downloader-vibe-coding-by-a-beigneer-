/* =====================================================================
   VODLY — frontend demo.
   Everything under "BACKEND LAYER" is MOCKED. A browser cannot reliably
   fetch/process Twitch VOD media, so real retrieval belongs in a backend
   service that complies with Twitch's terms, copyright and permissions.
   ===================================================================== */
'use strict';

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');
const fmt = s => `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(Math.floor(s % 60))}`;
const fmtDur = s => {
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return [h && h + 'h', (h || m) && m + 'm', s % 60 + 's'].filter(Boolean).join(' ');
};
const fmtSize = mb => mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb / 10) * 10 + ' MB';
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
};
function parseTime(str) {            // "HH:MM:SS" or "MM:SS" -> seconds, NaN if invalid
  const p = str.trim().split(':');
  if (p.length < 2 || p.length > 3 || p.some(x => !/^\d{1,2}$/.test(x))) return NaN;
  const n = p.map(Number); if (n.length === 2) n.unshift(0);
  return n[1] > 59 || n[2] > 59 ? NaN : n[0] * 3600 + n[1] * 60 + n[2];
}
function ago(ts) {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  const f = (n, u) => `${n} ${u}${n > 1 ? 's' : ''} ago`;
  return m < 60 ? f(m, 'minute') : m < 1440 ? f(Math.floor(m / 60), 'hour') : f(Math.floor(m / 1440), 'day');
}
function toast(msg, type = '') {
  const t = Object.assign(document.createElement('div'), { className: 'toast ' + type, textContent: msg });
  $('#toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2800);
}
const setErr = (el, msg, field) => { el.textContent = msg || ''; field && field.classList.toggle('bad', !!msg); };
const setLoading = (btn, on) => { btn.classList.toggle('loading', on); btn.disabled = on; };

/* ---------- Config & state ---------- */
const CONFIG = { API_BASE: '/api', MOCK_DELAY: 1100, FAIL_RATE: 0 };   // FAIL_RATE: try 0.5 to test the error state
const RATES = { 1080: 6.8, 720: 3.6, 480: 1.9, 360: 1.0 };             // demo bitrates in Mbps
const TWITCH_RE = /^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/videos\/(\d+)(?:[/?#].*)?$/i;
const state = { vod: null, url: '', start: 0, end: 0, cur: 0, quality: '720', format: 'mp4', playing: false, timer: null, busy: false };

/* =====================================================================
   BACKEND LAYER (mock) — replace these two functions with real API calls
   ===================================================================== */
function makeThumb(seed) {           // placeholder thumbnail (SVG data URI)
  const h = (parseInt(seed, 10) || 7) % 60 + 250;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${h},70%,32%)'/><stop offset='1' stop-color='hsl(${h + 30},60%,12%)'/></linearGradient></defs><rect width='320' height='180' fill='url(#g)'/><circle cx='160' cy='90' r='26' fill='#fff' fill-opacity='.18'/><path d='M152 77l24 13-24 13z' fill='#fff'/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

async function analyzeVOD(url) {
  // BACKEND HOOK — real request would look like:
  //   const res = await fetch(`${CONFIG.API_BASE}/vod?url=${encodeURIComponent(url)}`);
  //   if (!res.ok) throw new Error('VOD lookup failed');
  //   return res.json();   // { id, streamer, title, duration, thumbnail, views, date }
  await sleep(CONFIG.MOCK_DELAY);
  const id = url.trim().match(TWITCH_RE)[1];
  return { id, streamer: 'ExampleStreamer', title: 'Epic Gaming Session', duration: 16641, views: 128000, date: new Date().toISOString(), thumbnail: makeThumb(id) };
}

// Size estimate: DEMO maths. Replace with the size your backend reports for the chosen options.
const estimateSizeMB = (q, secs, format) => RATES[q] * secs / 8 * (format === 'webm' ? 0.9 : 1);

async function processDownload(opts, onProgress) {
  // BACKEND HOOK — real flow: POST {url,startTime,endTime,quality,format} to create a job,
  // then poll or subscribe (SSE/WebSocket) for progress, and finally receive a file URL:
  //   const job = await fetch(`${CONFIG.API_BASE}/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts) }).then(r => r.json());
  // Everything below is SIMULATED. No Twitch media is fetched or produced.
  await sleep(1200);
  const willFail = Math.random() < CONFIG.FAIL_RATE;
  let p = 0;
  while (p < 100) {
    await sleep(120);
    p = Math.min(100, p + 2 + Math.random() * 6);
    if (willFail && p > 55) throw new Error('Mock processing failed');
    onProgress(Math.round(p));
  }
  return { demo: true };
}

/* =====================================================================
   Analyze flow
   ===================================================================== */
async function onAnalyze() {
  const url = $('#url').value.trim(), f = $('#urlField'), e = $('#urlErr');
  if (!url) return setErr(e, 'Please paste a Twitch VOD URL.', f);
  if (!TWITCH_RE.test(url)) return setErr(e, 'Please enter a valid Twitch VOD URL.', f);
  setErr(e, '', f); setLoading($('#analyzeBtn'), true); toast('Analyzing VOD...');
  try {
    state.vod = await analyzeVOD(url); state.url = url;
    showVOD(); toast('VOD ready', 'ok');
  } catch { setErr(e, 'Could not analyze this VOD. Check the link and try again.', f); toast('Analysis failed', 'error'); }
  finally { setLoading($('#analyzeBtn'), false); }
}

function showVOD() {
  const v = state.vod, w = $('#work');
  setPlaying(false);
  $('#vThumb').src = v.thumbnail; $('#vTitle').textContent = v.title; $('#vStreamer').textContent = v.streamer;
  $('#vDur').textContent = fmt(v.duration); $('#tlEnd').textContent = fmt(v.duration);
  $('#vDate').textContent = new Date(v.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  $('#vViews').textContent = new Intl.NumberFormat('en', { notation: 'compact' }).format(v.views);
  $('#player').style.backgroundImage = `url("${v.thumbnail}")`;
  $$('.handle').forEach(h => h.setAttribute('aria-valuemax', v.duration));
  Object.assign(state, { start: Math.min(2535, Math.max(0, v.duration - 60)), end: Math.min(4650, v.duration), cur: Math.min(5075, v.duration) });
  $('#status').hidden = true;
  $('#empty').hidden = true;
  w.hidden = true; void w.offsetWidth; w.hidden = false;   // restart the reveal animation
  renderTimeline(); renderPlayer();
}

/* =====================================================================
   Timeline (drag + keyboard + manual inputs, always in sync)
   ===================================================================== */
function setTimeError(msg) {
  $('#timeErr').textContent = msg;
  [$('#tS'), $('#tE')].forEach(i => i.classList.toggle('bad', !!msg));
  $('#dlBtn').disabled = !!msg || state.busy;
}

function renderTimeline() {
  const { start, end, vod } = state, d = vod.duration, pc = s => s / d * 100 + '%';
  $('#hS').style.left = pc(start); $('#hE').style.left = pc(end);
  $('#dimL').style.width = pc(start); $('#dimR').style.width = 100 - end / d * 100 + '%';
  $('#range').style.left = pc(start); $('#range').style.width = (end - start) / d * 100 + '%';
  for (const [sel, val] of [['#hS', start], ['#hE', end]]) {
    const el = $(sel);
    el.dataset.t = fmt(val); el.setAttribute('aria-valuenow', val); el.setAttribute('aria-valuetext', fmt(val));
  }
  $('#tS').value = fmt(start); $('#tE').value = fmt(end);
  setTimeError('');
  renderSummary();
}

function renderSummary() {           // selected duration + size estimates
  const secs = state.end - state.start;
  $('#selDur').textContent = fmtDur(secs);
  $$('.q').forEach(q => { $('.qs', q).textContent = '~' + fmtSize(estimateSizeMB($('input', q).value, secs, state.format)); });
  $('#estSize').textContent = '~' + fmtSize(estimateSizeMB(state.quality, secs, state.format));
  $('#estNote').textContent = `Based on ${state.quality}p quality and selected duration`;
}

function applyTimeInputs() {         // manual timestamps -> validate -> update handles
  const s = parseTime($('#tS').value), e = parseTime($('#tE').value), d = state.vod.duration;
  const msg = isNaN(s) || isNaN(e) ? 'Use the format HH:MM:SS, for example 00:42:15.'
    : s > d ? `Start time is beyond the VOD duration (${fmt(d)}).`
    : e > d ? `End time is beyond the VOD duration (${fmt(d)}).`
    : e < s ? 'End time must be after the start time.'
    : e === s ? 'The selection can’t be zero-length.' : '';
  if (msg) return setTimeError(msg);
  state.start = s; state.end = e; renderTimeline();
}

function initTimeline() {
  const track = $('#track'); let active = null;
  const secAt = e => {
    const r = track.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * state.vod.duration);
  };
  const move = (h, s) => {           // handles can't cross: min 1s selection while dragging
    if (h.id === 'hS') state.start = Math.max(0, Math.min(s, state.end - 1));
    else state.end = Math.min(state.vod.duration, Math.max(s, state.start + 1));
    renderTimeline();
  };
  track.addEventListener('pointerdown', e => {
    const s = secAt(e), onHandle = e.target.closest('.handle');
    active = onHandle || (Math.abs(s - state.start) <= Math.abs(s - state.end) ? $('#hS') : $('#hE'));
    active.classList.add('drag'); active.focus({ preventScroll: true });
    track.setPointerCapture(e.pointerId);
    if (!onHandle) move(active, s);
  });
  track.addEventListener('pointermove', e => active && move(active, secAt(e)));
  const stop = () => { active && active.classList.remove('drag'); active = null; };
  track.addEventListener('pointerup', stop); track.addEventListener('pointercancel', stop);

  $$('.handle').forEach(h => h.addEventListener('keydown', e => {   // keyboard support
    const step = e.shiftKey ? 60 : 1, cur = h.id === 'hS' ? state.start : state.end;
    const delta = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -600, PageUp: 600 }[e.key];
    if (e.key === 'Home') move(h, 0);
    else if (e.key === 'End') move(h, state.vod.duration);
    else if (delta) move(h, cur + delta);
    else return;
    e.preventDefault();
  }));
  $('#tS').addEventListener('change', applyTimeInputs);
  $('#tE').addEventListener('change', applyTimeInputs);
}

/* =====================================================================
   Preview player (simulated playback — no real video source)
   ===================================================================== */
function renderPlayer() {
  const d = state.vod.duration;
  $('#ptime').textContent = `${fmt(state.cur)} / ${fmt(d)}`;
  Object.assign($('#seek'), { max: d, value: state.cur });
  $('#seek').setAttribute('aria-valuetext', fmt(state.cur));
}
function setPlaying(on) {
  state.playing = on; clearInterval(state.timer);
  $('#player').classList.toggle('playing', on);
  $('#playBtn').textContent = on ? '❚❚' : '▶';
  $('#playBtn').setAttribute('aria-label', on ? 'Pause' : 'Play');
  if (on) state.timer = setInterval(() => {
    state.cur = Math.min(state.cur + 1, state.vod.duration); renderPlayer();
    if (state.cur >= state.vod.duration) setPlaying(false);
  }, 1000);
}
function initPlayer() {
  const toggle = () => setPlaying(!state.playing);
  $('#playBtn').onclick = toggle; $('#bigPlay').onclick = toggle;
  $('#seek').addEventListener('input', e => { state.cur = +e.target.value; renderPlayer(); });
  $('#fsBtn').onclick = () => document.fullscreenElement ? document.exitFullscreen() : $('#player').requestFullscreen?.();
}

/* =====================================================================
   Download workflow (simulated)
   ===================================================================== */
async function onDownload() {
  if (state.busy) return;
  const { vod } = state, st = $('#status');
  const opts = { url: state.url, startTime: state.start, endTime: state.end, quality: state.quality, format: state.format };
  state.busy = true; setLoading($('#dlBtn'), true); toast('Preparing your clip...');
  st.hidden = false; st.innerHTML = '<span class="spin"></span><strong>Preparing your download...</strong>';
  try {
    await processDownload(opts, p => {
      if (!$('.bar', st)) st.innerHTML = '<strong></strong><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div>';
      $('strong', st).textContent = `Downloading... ${p}%`;
      $('.bar i', st).style.width = p + '%'; $('.bar', st).setAttribute('aria-valuenow', p);
    });
    const entry = { id: Date.now(), vodId: vod.id, title: vod.title, quality: opts.quality, format: opts.format, secs: opts.endTime - opts.startTime, ts: Date.now() };
    st.innerHTML = '<span class="okdot">✓</span><strong>Download Ready</strong><button class="btn primary small" id="fileBtn" type="button">Download File</button>';
    $('#fileBtn').onclick = () => saveDemoFile(entry);
    addHistory(entry); toast('Your clip is ready', 'ok');
  } catch {
    st.innerHTML = '<strong class="fail">Processing failed. Please try again.</strong>';
    toast('Processing failed', 'error');
  } finally { state.busy = false; setLoading($('#dlBtn'), false); }
}

function saveDemoFile(entry) {       // DEMO: a real backend would return a file URL to open instead
  const text = `VODLY demo: no video was downloaded.\n${JSON.stringify(entry, null, 2)}\n`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: `vodly-demo-${entry.vodId}.txt` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Demo mode: saved a placeholder file (no video)');
}

/* =====================================================================
   History (localStorage)
   ===================================================================== */
const HKEY = 'vodly_history';
function loadHistory() {
  try { const raw = store.get(HKEY); if (raw !== null) return JSON.parse(raw); } catch { /* fall through to seed data */ }
  const now = Date.now();
  return [
    { id: 1, vodId: '101', title: 'Epic Gaming Session', quality: '720', format: 'mp4', secs: 2115, ts: now - 5 * 60e3 },
    { id: 2, vodId: '202', title: 'Ranked Gameplay', quality: '1080', format: 'mp4', secs: 763, ts: now - 26 * 36e5 }
  ];
}
const saveHistory = h => store.set(HKEY, JSON.stringify(h));
function addHistory(entry) { saveHistory([entry, ...loadHistory()].slice(0, 12)); renderHistory(); }
function renderHistory() {
  const h = loadHistory(), box = $('#histList');
  $('#clearBtn').hidden = !h.length;
  box.innerHTML = h.length ? '' : '<p class="muted">No downloads yet. Completed clips will appear here.</p>';
  h.forEach(e => {
    const li = document.createElement('article'); li.className = 'card hi';
    li.innerHTML = `<img alt="" src="${makeThumb(e.vodId)}"><div><h3></h3><p class="muted"></p><small></small></div><button class="btn small" type="button">Download Again</button>`;
    $('h3', li).textContent = e.title;                                   // textContent: never inject stored strings as HTML
    $('p', li).textContent = `${e.quality}p • ${String(e.format).toUpperCase()} • ${fmtDur(e.secs)}`;
    $('small', li).textContent = `Downloaded ${ago(e.ts)}`;
    $('button', li).onclick = () => saveDemoFile(e);
    box.append(li);
  });
}

/* =====================================================================
   Site UI: theme, nav, FAQ, reveal, paste
   ===================================================================== */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
  store.set('vodly_theme', t);
}
async function onPaste() {
  try {
    const t = (await navigator.clipboard.readText()).trim(); if (!t) throw 0;
    $('#url').value = t; setErr($('#urlErr'), '', $('#urlField')); toast('URL pasted successfully', 'ok');
  } catch { toast('Clipboard unavailable. Press Ctrl/⌘+V in the field instead.', 'error'); $('#url').focus(); }
}
function initUI() {
  document.documentElement.classList.add('js');
  applyTheme(store.get('vodly_theme') || 'dark');
  $('#themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

  const menu = $('#menu'), burger = $('#burger');
  const setMenu = open => { menu.classList.toggle('open', open); burger.setAttribute('aria-expanded', open); burger.textContent = open ? '✕' : '☰'; };
  burger.onclick = () => setMenu(!menu.classList.contains('open'));
  menu.addEventListener('click', e => e.target.closest('a') && setMenu(false));

  $$('.qa button').forEach(b => b.addEventListener('click', () => {
    const open = b.getAttribute('aria-expanded') === 'true';
    $$('.qa button').forEach(x => x.setAttribute('aria-expanded', 'false'));
    b.setAttribute('aria-expanded', String(!open));
  }));

  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .1 });
  $$('.reveal').forEach(el => io.observe(el));

  $('#pasteBtn').onclick = onPaste;
  $('#analyzeBtn').onclick = onAnalyze;
  $('#url').addEventListener('keydown', e => e.key === 'Enter' && onAnalyze());
  $('#url').addEventListener('input', () => setErr($('#urlErr'), '', $('#urlField')));
  $$('input[name=q]').forEach(i => i.addEventListener('change', () => { state.quality = i.value; renderSummary(); }));
  $$('input[name=f]').forEach(i => i.addEventListener('change', () => { state.format = i.value; renderSummary(); }));
  $('#dlBtn').onclick = onDownload;
  $('#clearBtn').onclick = () => { saveHistory([]); renderHistory(); toast('History cleared'); };
}

initUI(); initTimeline(); initPlayer(); renderHistory();