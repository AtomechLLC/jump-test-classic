/* Anatomy of a Successful Attack — the original art & audio.
   Sprites captured frame-by-frame from Ben Ruiz's 2015 "Impact Effects"
   demo build (Team Colorblind / Aztez); audio clips extracted from the same
   build. Layer timings decompiled from the scene data:
     t+0.00 attack anim · t+0.10 whoosh · t+0.20 swing FX/dust/shake/blood
     t+0.22 struck + impact sfx + grunt · t+0.23 hit burst · t+0.25 sparks
   The hit-freeze ("Hiccup") is baked into variant animation clips; the
   camera shake is smooth noise with sine-eased decay (CameraShake.cs). */

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const W = cv.width, H = cv.height;          // 960 x 540
const SPLIT = 503;                          // whitespace column between the two actors

/* ---- the nine layers, numbered as in the demo scene ---- */
const LAYERS = [
  { id: 'anim',   name: 'Attack animation', desc: '"Sword — Forehand Stationary": the real 12-frame wind-up' },
  { id: 'struck', name: 'Struck animation', desc: 'The victim snaps back + Damage Color Flash (t+0.22s)' },
  { id: 'swing',  name: 'Sword swing effect', desc: 'Ink-brush slash arc born at t+0.20s' },
  { id: 'hit',    name: 'Hit effect',       desc: 'The flower-burst + white flash at t+0.23s' },
  { id: 'impact', name: 'Sword impact',     desc: 'Ring sparks at t+0.25s — the last thing to fire' },
  { id: 'blood',  name: 'Blood',            desc: 'Metaball blood that splatters and pools (t+0.20s)' },
  { id: 'dust',   name: 'Foot fall dust',   desc: 'Kicked up at the plant foot as weight transfers (t+0.20s)' },
  { id: 'shake',  name: 'Camera shake',     desc: '0.16s smooth noise, sine-eased decay, clamped offset' },
  { id: 'stop',   name: 'Animation stop',   desc: 'The "Hiccup": both actors hold while the world keeps moving' },
];
const on = {};
LAYERS.forEach(l => on[l.id] = true);
let soundOn = true;
let autoDemo = false;

/* ---- authored schedule (seconds after Z) ---- */
const SCHED = { whoosh: 0.10, fx: 0.20, struck: 0.22, sndHit: 0.22, hit: 0.23, impact: 0.25 };

/* ---- asset loading ---- */
const A = 'assets/aztez/';
let MAN = null;
const IMG = {};
let ready = false, loadErr = null;

fetch(A + 'clips.json').then(r => r.json()).then(m => {
  MAN = m;
  const names = Object.keys(m.clips);
  let left = names.length;
  names.forEach(n => {
    const im = new Image();
    im.onload = () => { if (--left === 0) ready = true; };
    im.onerror = () => { loadErr = m.clips[n].file; };
    im.src = A + m.clips[n].file;
    IMG[n] = im;
  });
}).catch(e => loadErr = String(e));

/* ---- audio: the actual clips from the build ---- */
let actx = null;
const BUF = {};
function wakeAudio() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    for (const n of ['impact', 'swing', 'grunt']) {
      fetch(A + 'sfx_' + n + '.wav').then(r => r.arrayBuffer())
        .then(b => actx.decodeAudioData(b)).then(d => BUF[n] = d);
    }
  }
  if (actx.state === 'suspended') actx.resume();
}
function sfx(name, delay = 0) {
  if (!soundOn || !actx || !BUF[name]) return;
  const s = actx.createBufferSource();
  s.buffer = BUF[name];
  s.connect(actx.destination);
  s.start(actx.currentTime + Math.max(0, delay));
}

/* ---- playback state ---- */
const now = () => performance.now() / 1000;
let base = null;     // {mode:'full'|'solo', clip} or {mode:'composite', atkClip, vicClip, atkStart, vicStart}
let baseStart = 0;
const fx = [];       // active effect layers: {name, start}
let shakeAt = -9, shakeOn = false;
let attackT0 = -9;   // wall time of the last Z press (for phase cards)
let autoTimer = 0;

function clip(n) { return MAN.clips[n]; }
function idxOf(c, start, t) { return Math.floor((t - start) * c.fps) + c.press; }

/* ---- triggers ---- */
function fullAttack() {
  wakeAudio();
  if (!ready || base) return;
  const t = now();
  attackT0 = t;
  const all = LAYERS.every(l => on[l.id]);
  if (all) {
    base = { mode: 'full', clip: 'full' };
    baseStart = t;                      // frame 0 now; press frame ~2
  } else {
    const atkClip = on.anim ? (on.stop ? 'hiccup' : 'atk') : 'bg';
    const vicClip = on.struck ? (on.stop ? 'hiccup' : 'struck') : 'bg';
    base = { mode: 'composite', atkClip, vicClip,
             atkStart: t, vicStart: on.stop ? t : t + SCHED.struck };
    baseStart = t;
    if (on.swing)  fx.push({ name: 'swing',  start: t + SCHED.fx });
    if (on.dust)   fx.push({ name: 'dust',   start: t + SCHED.fx });
    if (on.blood)  fx.push({ name: 'blood',  start: t + SCHED.fx });
    if (on.hit)    fx.push({ name: 'hit',    start: t + SCHED.hit });
    if (on.impact) fx.push({ name: 'impact', start: t + SCHED.impact });
    if (on.shake)  { shakeAt = t + SCHED.fx; shakeOn = true; }
  }
  sfx('swing', SCHED.whoosh);
  sfx('impact', SCHED.sndHit);
  sfx('grunt', SCHED.sndHit);
}

/* keys 1–9 fire one ingredient alone — the original demo's bindings */
function fireSolo(i) {
  wakeAudio();
  if (!ready) return;
  const id = LAYERS[i].id;
  const t = now();
  if (id === 'anim' || id === 'struck' || id === 'stop') {
    if (base) return;
    attackT0 = t;
    base = { mode: 'solo', clip: id === 'anim' ? 'atk' : id === 'struck' ? 'struck' : 'hiccup' };
    baseStart = t;
    if (id === 'anim') sfx('swing', SCHED.whoosh);
    if (id === 'struck') sfx('grunt');
  }
  else if (id === 'shake') { shakeAt = t; shakeOn = true; }
  else {
    fx.push({ name: id, start: t });
    if (id === 'hit') sfx('impact');
  }
}

/* ---- drawing ---- */
function drawClipFrame(name, i, sx, sw) {
  const c = clip(name), im = IMG[name];
  i = Math.max(0, Math.min(c.frames - 1, i));
  const fw = c.kind === 'effect' ? c.fw : MAN.frameW;
  const fh = c.kind === 'effect' ? c.fh : MAN.frameH;
  const col = i % c.cols, row = Math.floor(i / c.cols);
  if (c.kind === 'effect') {
    ctx.drawImage(im, col * fw, row * fh, fw, fh, c.x, c.y, fw, fh);
  } else if (sx !== undefined) {   // vertical slice of an opaque frame
    ctx.drawImage(im, col * fw + sx, row * fh, sw, fh, sx, 0, sw, fh);
  } else {
    ctx.drawImage(im, col * fw, row * fh, fw, fh, 0, 0, fw, fh);
  }
}
function bgIndex(t) {
  const c = clip('bg');
  return Math.floor(t * c.fps) % c.frames;
}

/* Aztez camera shake: smooth noise, sine-eased decay, clamped */
const SHAKE_DUR = 0.16, SHAKE_MAX = 11;
function snoise(x) {
  return Math.sin(x * 11) * 0.5 + Math.sin(x * 19 + 1.3) * 0.3 + Math.sin(x * 31 + 4.1) * 0.2;
}
function shakeOffset(t) {
  const e = t - shakeAt;
  if (!shakeOn || e < 0 || e > SHAKE_DUR) return [0, 0];
  const amp = SHAKE_MAX * Math.sin((1 - e / SHAKE_DUR) * Math.PI * 0.5);
  return [snoise(e * 40) * amp, snoise(e * 40 + 17.3) * amp];
}

function draw() {
  const t = now();
  ctx.fillStyle = '#0d0c0b';
  ctx.fillRect(0, 0, W, H);
  if (!ready) {
    ctx.fillStyle = '#8a7b6a';
    ctx.font = '20px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(loadErr ? 'failed to load ' + loadErr : 'loading the original 2015 demo assets…', W / 2, H / 2);
    return;
  }
  ctx.save();
  const [ox, oy] = shakeOffset(t);
  ctx.translate(ox, oy);

  /* base layer */
  if (!base) {
    drawClipFrame('bg', bgIndex(t));
  } else if (base.mode === 'full' || base.mode === 'solo') {
    const c = clip(base.clip);
    const i = Math.floor((t - baseStart) * c.fps);
    if (i >= c.frames) { base = null; drawClipFrame('bg', bgIndex(t)); }
    else {
      drawClipFrame(base.clip, i);
      if (i > c.frames - 9) {          // cross-fade the pools away
        ctx.globalAlpha = (i - (c.frames - 9)) / 8;
        drawClipFrame('bg', bgIndex(t));
        ctx.globalAlpha = 1;
      }
    }
  } else {                             // composite: attacker slice + victim slice
    const done = [];
    for (const [cn, start, sx, sw] of [[base.atkClip, base.atkStart, 0, SPLIT],
                                       [base.vicClip, base.vicStart, SPLIT, W - SPLIT]]) {
      if (cn === 'bg') { drawClipFrame('bg', bgIndex(t), sx, sw); done.push(true); continue; }
      const c = clip(cn);
      const i = idxOf(c, start, t);
      drawClipFrame(cn, i, sx, sw);
      done.push(i >= c.frames - 1);
    }
    if (done[0] && done[1] && t - baseStart > 1.2) base = null;
  }

  /* effect layers */
  for (let k = fx.length - 1; k >= 0; k--) {
    const e = fx[k];
    const c = clip(e.name);
    const i = idxOf(c, e.start, t);
    if (i >= c.frames) { fx.splice(k, 1); continue; }
    if (i >= 0) {
      if (i > c.frames - 9) ctx.globalAlpha = 1 - (i - (c.frames - 9)) / 8;
      drawClipFrame(e.name, i);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  updatePhaseCards(t);
  updateFreezeBadge(t);

  if (autoDemo && !base && t > autoTimer) { autoTimer = t + 3.2; fullAttack(); }
}

/* ---- phase cards / badge / code panel ---- */
let lastPhase = '';
function updatePhaseCards(t) {
  const e = t - attackT0;
  let ph = '';
  if (base && e >= 0) ph = e < 0.20 ? 'windup' : e < 0.50 ? 'active' : 'recovery';
  if (ph === lastPhase) return;
  lastPhase = ph;
  document.querySelectorAll('.phase-card').forEach(c =>
    c.classList.toggle('active', c.dataset.phase === ph));
}
let badgeState = false;
function updateFreezeBadge(t) {
  const e = t - attackT0;
  const holding = !!base && on.stop && (on.anim || on.struck) && e > 0.20 && e < 0.34;
  if (holding !== badgeState) {
    badgeState = holding;
    document.getElementById('freeze-badge').classList.toggle('on', holding);
  }
}

function renderCode() {
  const L = (id, txt) => `  <span class="${on[id] ? 'hl' : 'off'}">${txt}</span>`;
  const S = txt => soundOn ? `  <span class="hl">${txt}</span>` : `  <span class="off">${txt}</span>`;
  document.getElementById('pseudocode').innerHTML =
    `<b>on Z:</b>  <i># from Impact Effects.unity</i>\n` +
    L('anim',   't+0.00  play(attack_anim)') + '\n' +
    S('t+0.10  play(whoosh)') + '\n' +
    L('swing',  't+0.20  spawn(sword_swing_fx)') + '\n' +
    L('dust',   't+0.20  spawn(foot_dust)') + '\n' +
    L('shake',  't+0.20  shake(0.16s, sine_decay)') + '\n' +
    L('blood',  't+0.20  spawn(blood)') + '\n' +
    L('struck', 't+0.22  play(struck + color_flash)') + '\n' +
    S('t+0.22  play(impact_sfx + grunt)') + '\n' +
    L('hit',    't+0.23  spawn(hit_burst)') + '\n' +
    L('impact', 't+0.25  spawn(impact_sparks)') + '\n' +
    L('stop',   '"Hiccup" clips hold both actors');
}

/* ---- layer list UI ---- */
function buildLayers() {
  const host = document.getElementById('layer-list');
  LAYERS.forEach((l, i) => {
    const row = document.createElement('label');
    row.className = 'layer on';
    row.dataset.id = l.id;
    row.innerHTML =
      `<input type="checkbox" checked>` +
      `<span class="key">${i + 1}</span>` +
      `<span class="body"><span class="name">${l.name}</span>` +
      `<span class="desc">${l.desc}</span></span>`;
    const cb = row.querySelector('input');
    cb.addEventListener('change', () => setLayer(l.id, cb.checked));
    host.appendChild(row);
  });
}
function setLayer(id, val) {
  on[id] = val;
  const row = document.querySelector(`.layer[data-id="${id}"]`);
  row.classList.toggle('on', val); row.classList.toggle('off', !val);
  row.querySelector('input').checked = val;
  renderCode();
}

/* ---- wiring ---- */
document.getElementById('attack-btn').addEventListener('click', fullAttack);
cv.addEventListener('pointerdown', fullAttack);
document.getElementById('reset-btn').addEventListener('click', () => LAYERS.forEach(l => setLayer(l.id, true)));
document.getElementById('toggle-sound').addEventListener('change', e => {
  soundOn = e.target.checked; if (soundOn) wakeAudio(); renderCode();
});
document.getElementById('toggle-demo').addEventListener('change', e => {
  autoDemo = e.target.checked; autoTimer = 0;
});

window.addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'z' || k === ' ') { e.preventDefault(); fullAttack(); }
  else if (k === 'r') LAYERS.forEach(l => setLayer(l.id, true));
  else if (k === '0') {
    const cb = document.getElementById('toggle-sound');
    cb.checked = !cb.checked; cb.dispatchEvent(new Event('change'));
  }
  else if (k >= '1' && k <= '9') fireSolo(+k - 1);
});

/* ---- loop ---- */
function frame() { draw(); requestAnimationFrame(frame); }
buildLayers();
renderCode();
frame();
