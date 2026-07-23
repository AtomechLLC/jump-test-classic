/* Anatomy of a Successful Attack — rebuilt from Ben Ruiz's actual 2015
   "Impact Effects" demo build (decompiled scripts + serialized scene data).

   The authored timeline on Z, straight from Impact Effects.unity:
     t+0.00  attack animation ("Sword - Forehand Stationary Hiccup")
     t+0.10  sword swing audio (whoosh)
     t+0.20  sword swing FX, foot fall dust, camera shake, blood
     t+0.22  struck animation + Damage Color Flash, impact sfx + grunt
     t+0.23  hit effect burst
     t+0.25  sword impact sparks
   The "animation stop" is baked into the clips as a hold ("Hiccup") —
   the characters freeze for a beat while particles and shake keep moving.

   Camera shake (CameraShake.cs): smooth noise, sine-eased decay,
   duration 0.2*0.8 = 0.16s, strength 5*0.52 = 2.6, speed 5*0.9 = 4.5,
   offset clamped to a max. */

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const W = cv.width, H = cv.height;

const FPS = 60;
const GROUND = 452;
const ATK_X = 430;
const VIC_X = 700;                       // the struck commoner
const SHOULDER_Y = GROUND - 108;
const SWORD_LEN = 82;
const CONTACT_X = VIC_X - 34, CONTACT_Y = GROUND - 92;

/* ---- the nine layers, numbered as in the demo scene ---- */
const LAYERS = [
  { id: 'anim',   name: 'Attack animation', desc: '"Sword — Forehand Stationary": 12 frames of anticipation before the blade arrives' },
  { id: 'struck', name: 'Struck animation', desc: 'The victim snaps back + "Damage Color Flash" white tint (t+0.22s)' },
  { id: 'swing',  name: 'Sword swing effect', desc: 'Slash-arc mesh born at t+0.20s, gone 0.18s later' },
  { id: 'hit',    name: 'Hit effect',       desc: 'Radial burst at t+0.23s — a frame after the struck reaction' },
  { id: 'impact', name: 'Sword impact',     desc: 'Sparks at t+0.25s — the last thing to fire' },
  { id: 'blood',  name: 'Blood',            desc: 'Gooey metaball blood (t+0.20s) that pools on the floor' },
  { id: 'dust',   name: 'Foot fall dust',   desc: 'Kicked up at the plant foot as weight transfers (t+0.20s)' },
  { id: 'shake',  name: 'Camera shake',     desc: '0.16s of smooth noise, sine-eased decay, clamped max offset' },
  { id: 'stop',   name: 'Animation stop',   desc: 'The "Hiccup": both clips hold a few frames while FX keep moving' },
];
const on = {};
LAYERS.forEach(l => on[l.id] = true);
let soundOn = true;
let autoDemo = false;

/* ---- authored event schedule, seconds → frames ---- */
const EV = {
  whoosh:      Math.round(0.10 * FPS),   //  6
  swing:       Math.round(0.20 * FPS),   // 12
  dust:        Math.round(0.20 * FPS),   // 12
  shake:       Math.round(0.20 * FPS),   // 12
  blood:       Math.round(0.20 * FPS),   // 12
  struck:      Math.round(0.22 * FPS),   // 13
  impactSfx:   Math.round(0.22 * FPS),   // 13
  hit:         Math.round(0.23 * FPS),   // 14
  sparks:      Math.round(0.25 * FPS),   // 15
};
const T_CONTACT = EV.swing;              // blade meets victim
const HICCUP = 4;                        // frames each character holds
const T_SWING_END = T_CONTACT + 6;       // "actual weapon motion: 6 frames max"
const T_END = T_SWING_END + 34;

/* ---- state ---- */
let t = -1;                  // attack timeline frame; -1 = idle
let mask = null;             // which layers fire this run (null = idle)
let fired = {};              // events already dispatched this run
let autoTimer = 90;

let atkHold = 0;             // hiccup hold, attacker
let vicT = -1;               // victim struck timeline; -1 = idle
let vicHold = 0;
let vicFlash = 0;            // Damage Color Flash frames left

const trail = [];            // blade-tip history (swing FX)
let soloArc = null;          // replayed arc for firing swing FX alone
const bursts = [];           // hit effect
const sparks = [];
const dusts = [];
const bloods = [];           // airborne blood blobs
const pools = [];            // landed blood pools

/* shake — Aztez values, mapped to pixels */
let shakeT = 0, shakeDur = 0;
const SHAKE_DUR = 0.16 * FPS;            // ~10 frames
const SHAKE_STR = 78;                    // strength 2.6 in px (pre-clamp)
const SHAKE_SPD = 4.5;
const SHAKE_MAX = 13;                    // maxOffset clamp in px

/* ---------- audio: three layered sources, clean & bassy ---------- */
let actx = null;
function initAudio() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); }
function master(g) { const m = actx.createGain(); m.gain.value = g; m.connect(actx.destination); return m; }

function sndWhoosh() {                   // Audio Source - Sword Swing
  if (!soundOn || !actx) return;
  const now = actx.currentTime, m = master(0.5);
  const dur = 0.18;
  const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length);
  const src = actx.createBufferSource(); src.buffer = buf;
  const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(1400, now);
  bp.frequency.exponentialRampToValueAtTime(320, now + dur);
  src.connect(bp).connect(m);
  src.start(now); src.stop(now + dur);
}
function sndImpact() {                   // Audio Source - Sword Impact
  if (!soundOn || !actx) return;
  const now = actx.currentTime, m = master(0.9);
  const o = actx.createOscillator(), og = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, now);
  o.frequency.exponentialRampToValueAtTime(45, now + 0.14);
  og.gain.setValueAtTime(0.9, now);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  o.connect(og).connect(m); o.start(now); o.stop(now + 0.24);
  const dur = 0.2;
  const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const src = actx.createBufferSource(); src.buffer = buf;
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1800, now);
  lp.frequency.exponentialRampToValueAtTime(300, now + 0.15);
  const ng = actx.createGain(); ng.gain.value = 0.7;
  src.connect(lp).connect(ng).connect(m);
  src.start(now); src.stop(now + dur);
}
function sndGrunt() {                    // Audio Source - Struck Grunt
  if (!soundOn || !actx) return;
  const now = actx.currentTime, m = master(0.28);
  const o = actx.createOscillator(), og = actx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(170, now);
  o.frequency.exponentialRampToValueAtTime(80, now + 0.12);
  og.gain.setValueAtTime(0.6, now);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
  o.connect(lp).connect(og).connect(m); o.start(now); o.stop(now + 0.15);
}

/* ---------- triggers ---------- */
function fullAttack() {
  wakeAudio();
  if (t >= 0) return;
  mask = { ...on };
  begin();
}
function begin() {
  t = 0; fired = {}; trail.length = 0; soloArc = null;
}
function wakeAudio() { initAudio(); if (actx && actx.state === 'suspended') actx.resume(); }

/* keys 1–9 fire one ingredient in isolation, like the original demo */
function fireSolo(i) {
  wakeAudio();
  const id = LAYERS[i].id;
  if (id === 'anim') {                      // swing + whoosh, nothing else
    if (t >= 0) return;
    mask = { anim: true, _whoosh: true }; begin();
  } else if (id === 'stop') {               // key 9: both Hiccup clips, no FX
    if (t >= 0) return;
    mask = { anim: true, struck: true, stop: true }; begin();
  } else if (id === 'struck') { victimHit(true); sndGrunt(); }
  else if (id === 'swing') { soloArc = { t: 0 }; }
  else if (id === 'hit') { spawnHit(); sndImpact(); }
  else if (id === 'impact') { spawnSparks(); }
  else if (id === 'blood') { spawnBlood(); }
  else if (id === 'dust') { spawnDust(); }
  else if (id === 'shake') { startShake(); }
}

/* ---------- effect spawners ---------- */
function startShake() { shakeT = SHAKE_DUR; shakeDur = SHAKE_DUR; }
function spawnHit() {
  bursts.push({ x: CONTACT_X, y: CONTACT_Y, r: 6, max: 76, life: 1 });
  bursts.push({ x: CONTACT_X, y: CONTACT_Y, r: 2, max: 46, life: 1, spin: 0.7 });
}
function spawnSparks() {
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI * 0.5 + (Math.random() - 0.5) * 2.4;
    const s = 3 + Math.random() * 5;
    sparks.push({ x: CONTACT_X, y: CONTACT_Y, vx: Math.cos(a) * s * 1.6, vy: Math.sin(a) * s, life: 1 });
  }
}
function spawnBlood() {
  for (let i = 0; i < 15; i++) {
    const a = (Math.random() - 0.5) * 2.0;
    const s = 1.5 + Math.random() * 5.5;
    bloods.push({ x: CONTACT_X, y: CONTACT_Y, vx: Math.cos(a) * s + 2.2, vy: Math.sin(a) * s - 2.5,
                  r: 3.5 + Math.random() * 4 });
  }
}
function spawnDust() {
  for (let i = 0; i < 12; i++) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    dusts.push({ x: ATK_X + dir * 8, y: GROUND, vx: dir * (0.6 + Math.random() * 1.8),
                 vy: -(0.4 + Math.random() * 1.6), life: 1, r: 3 + Math.random() * 4 });
  }
}
function victimHit(withFlash) {
  vicT = 0;
  vicHold = (mask && mask.stop) ? HICCUP : 0;
  if (withFlash) vicFlash = 9;           // Damage Color Flash
}

/* ---------- attacker pose ---------- */
function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
function easeIn(x) { return x * x; }
const REST = -0.35, COCKED = -2.5, FINISH = 1.15;

function pose() {
  if (t < 0) return { sword: REST, lean: 0 };
  const anim = mask.anim;
  if (t < T_CONTACT) {
    const p = t / T_CONTACT;
    if (anim) { const e = easeOut(p); return { sword: REST + (COCKED - REST) * e, lean: -10 * e }; }
    return { sword: REST, lean: 0 };
  }
  if (t < T_SWING_END) {
    const p = (t - T_CONTACT) / (T_SWING_END - T_CONTACT);
    const start = anim ? COCKED : REST;
    // blade reaches the victim at the start of this 6-frame window
    const e = anim ? 0.62 + 0.38 * easeIn(p) : p;
    return { sword: start + (FINISH - start) * e, lean: anim ? 14 * e : 0 };
  }
  const p = (t - T_SWING_END) / (T_END - T_SWING_END);
  if (anim) { const e = easeOut(p); return { sword: FINISH + (REST - FINISH) * e, lean: 14 * (1 - e) }; }
  return { sword: p < 0.5 ? FINISH : REST, lean: 0 };
}

/* smooth noise for the shake — layered sines stand in for SmoothRandom */
function snoise(x) {
  return (Math.sin(x * 1.7) * 0.5 + Math.sin(x * 2.9 + 1.3) * 0.3 + Math.sin(x * 4.7 + 4.1) * 0.2);
}

/* ---------- update ---------- */
let clock = 0;
function update() {
  clock++;

  /* attack timeline; hiccup holds the ATTACKER only — world keeps moving */
  if (t >= 0) {
    if (atkHold > 0) atkHold--;
    else {
      dispatch();
      // record blade tip during the active window
      if (mask.anim && t >= T_CONTACT - 1 && t <= T_SWING_END) {
        const ps = pose();
        trail.push({ x: ATK_X + ps.lean + 8 + Math.cos(ps.sword) * SWORD_LEN,
                     y: SHOULDER_Y + Math.sin(ps.sword) * SWORD_LEN, life: 1 });
      }
      t++;
      if (t === T_CONTACT + 1 && mask.stop) atkHold = HICCUP;   // the Hiccup
      if (t >= T_END) { t = -1; mask = null; }
    }
  }

  /* victim timeline */
  if (vicT >= 0) {
    if (vicHold > 0) vicHold--;
    else { vicT++; if (vicT > 40) vicT = -1; }
  }
  if (vicFlash > 0) vicFlash--;

  /* solo swing-FX replay: sweep the canonical arc with no character motion */
  if (soloArc) {
    const p = soloArc.t / 6;
    const a = COCKED * (1 - easeIn(p)) + FINISH * easeIn(p);
    trail.push({ x: ATK_X + 8 + Math.cos(a) * SWORD_LEN, y: SHOULDER_Y + Math.sin(a) * SWORD_LEN, life: 1 });
    if (++soloArc.t > 6) soloArc = null;
  }

  /* effects */
  if (shakeT > 0) shakeT--;
  for (const b of bursts) { b.r += (b.max - b.r) * 0.28; b.life -= 0.09; }
  cull(bursts);
  for (const s of sparks) { s.x += s.vx; s.y += s.vy; s.vy += 0.18; s.vx *= 0.98; s.life -= 0.05; }
  cull(sparks);
  for (const d of dusts) { d.x += d.vx; d.y += d.vy; d.vy += 0.05; d.r += 0.35; d.life -= 0.045; }
  cull(dusts);
  for (const tp of trail) tp.life -= 0.12;
  cull(trail);
  for (let i = bloods.length - 1; i >= 0; i--) {
    const b = bloods[i];
    b.x += b.vx; b.y += b.vy; b.vy += 0.34; b.vx *= 0.99;
    if (b.y + b.r >= GROUND + 2) {                    // land → join/spawn a pool
      let p = pools.find(p => Math.abs(p.x - b.x) < p.w * 0.7 + 8);
      if (p) { p.w = Math.min(p.w + b.r * 0.8, 90); }
      else pools.push({ x: b.x, w: b.r * 1.6, life: 1 });
      bloods.splice(i, 1);
    }
  }
  for (const p of pools) { p.w += 0.06; p.life -= 0.0016; }
  cull(pools);

  if (autoDemo && t < 0) { if (--autoTimer <= 0) { autoTimer = 105; fullAttack(); } }
  updatePhaseCards();
  updateFreezeBadge();
}
function cull(arr) { for (let i = arr.length - 1; i >= 0; i--) if (arr[i].life <= 0) arr.splice(i, 1); }

/* fire scheduled events for the current frame, gated by the run's mask */
function dispatch() {
  const go = (name, cond, fn) => { if (t >= EV[name] && !fired[name]) { fired[name] = true; if (cond) fn(); } };
  go('whoosh', (mask.anim && (mask._whoosh || Object.keys(on).some(k => mask[k]))) && !isStopSolo(), sndWhoosh);
  go('swing',  mask.swing, () => {});                       // trail gated in update
  go('dust',   mask.dust, spawnDust);
  go('shake',  mask.shake, startShake);
  go('blood',  mask.blood, spawnBlood);
  go('struck', mask.struck, () => victimHit(true));
  go('impactSfx', mask.struck && !isStopSolo(), () => { sndImpact(); sndGrunt(); });
  go('hit',    mask.hit, spawnHit);
  go('sparks', mask.impact, spawnSparks);
}
function isStopSolo() { return mask && mask.stop && !mask.swing && !mask.hit; }

/* ---------- draw ---------- */
function draw() {
  ctx.save();
  let ox = 0, oy = 0;
  if (shakeT > 0) {
    const rem = shakeT / shakeDur;
    const amp = SHAKE_STR * Math.sin(rem * Math.PI * 0.5);   // Sinerp decay
    const ph = clock / FPS * SHAKE_SPD * Math.PI * 2;
    ox = clamp(snoise(ph) * amp, SHAKE_MAX);
    oy = clamp(snoise(ph + 17.3) * amp, SHAKE_MAX);
  }
  ctx.translate(ox, oy);

  ctx.fillStyle = '#12100f'; ctx.fillRect(-20, -20, W + 40, H + 40);
  const g = ctx.createLinearGradient(0, GROUND, 0, H);
  g.addColorStop(0, '#241d17'); g.addColorStop(1, '#171310');
  ctx.fillStyle = g; ctx.fillRect(-20, GROUND, W + 40, H - GROUND + 20);
  ctx.strokeStyle = '#3a2f25'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-20, GROUND); ctx.lineTo(W + 20, GROUND); ctx.stroke();

  drawPools();
  drawVictim();
  drawDust();
  drawFighter(pose());
  drawTrail();
  drawBursts();
  drawSparks();
  drawBloodAir();

  ctx.restore();
}
function clamp(v, m) { return Math.max(-m, Math.min(m, v)); }

/* attacker — white on black with a red sash, in the Aztez palette */
function drawFighter(ps) {
  const fx = ATK_X + ps.lean;
  ctx.save();
  ctx.translate(fx, 0);
  ctx.fillStyle = '#f2ede2'; ctx.strokeStyle = '#8d867a'; ctx.lineWidth = 2;
  ctx.fillRect(-16, GROUND - 44, 12, 44); ctx.strokeRect(-16, GROUND - 44, 12, 44);
  ctx.fillRect(4, GROUND - 44, 12, 44);  ctx.strokeRect(4, GROUND - 44, 12, 44);
  roundRect(-18, GROUND - 96, 36, 56, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c1121f'; ctx.fillRect(-18, GROUND - 74, 36, 8);   // red sash
  ctx.fillStyle = '#f2ede2';
  ctx.beginPath(); ctx.arc(0, GROUND - 110, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2b2019'; ctx.fillRect(-2, GROUND - 116, 14, 6);   // visor

  const sx = 8, sy = SHOULDER_Y;
  const gripX = sx + Math.cos(ps.sword) * 20, gripY = sy + Math.sin(ps.sword) * 20;
  const tipX = sx + Math.cos(ps.sword) * SWORD_LEN, tipY = sy + Math.sin(ps.sword) * SWORD_LEN;
  ctx.strokeStyle = '#f2ede2'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-6, GROUND - 84); ctx.lineTo(gripX, gripY); ctx.stroke();
  ctx.strokeStyle = '#eef2f7'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(gripX, gripY); ctx.lineTo(tipX, tipY); ctx.stroke();
  ctx.strokeStyle = '#9aa4b2'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(gripX, gripY); ctx.lineTo(tipX, tipY); ctx.stroke();
  ctx.strokeStyle = '#c1121f'; ctx.lineWidth = 5;
  const gx = Math.cos(ps.sword + Math.PI / 2) * 8, gy = Math.sin(ps.sword + Math.PI / 2) * 8;
  ctx.beginPath(); ctx.moveTo(gripX - gx, gripY - gy); ctx.lineTo(gripX + gx, gripY + gy); ctx.stroke();
  ctx.restore();
}

/* victim — a hunched grey commoner who staggers, flashes white, recovers */
function drawVictim() {
  let ang = 0, slide = 0;
  if (vicT >= 0) {
    const p = vicT / 40;
    const kick = Math.exp(-p * 5) ;                 // sharp snap, springy return
    ang = 0.5 * kick * Math.sin(Math.min(p * 6, Math.PI));
    slide = 26 * (1 - Math.pow(1 - Math.min(p * 2.4, 1), 3));
  }
  const flash = vicFlash > 0;
  ctx.save();
  ctx.translate(VIC_X + slide, GROUND);
  ctx.rotate(ang);
  const body = flash ? '#ffffff' : '#9b9186';
  const line = flash ? '#ffffff' : '#5c554b';
  ctx.fillStyle = body; ctx.strokeStyle = line; ctx.lineWidth = 2;
  ctx.fillRect(-14, -42, 11, 42); ctx.strokeRect(-14, -42, 11, 42);
  ctx.fillRect(3, -42, 11, 42);   ctx.strokeRect(3, -42, 11, 42);
  roundRect(-16, -94, 32, 54, 6); ctx.fill(); ctx.stroke();
  // slack arms
  ctx.strokeStyle = body; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-12, -82); ctx.lineTo(-20, -50 + (ang * 30)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, -82); ctx.lineTo(22, -48 - (ang * 40)); ctx.stroke();
  ctx.fillStyle = body; ctx.strokeStyle = line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -107, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawTrail() {
  if (trail.length < 2) return;
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i], b = trail[i - 1];
    ctx.strokeStyle = `rgba(240,240,255,${0.45 * a.life})`;
    ctx.lineWidth = 17 * a.life;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.85 * a.life})`;
    ctx.lineWidth = 5 * a.life;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke();
  }
  ctx.restore();
}

function drawBursts() {
  for (const b of bursts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, b.life);
    ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 5 * b.life;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * b.life;
    for (let i = 0; i < 8; i++) {
      const a = (b.spin || 0) + i / 8 * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(b.x + Math.cos(a) * b.r * 0.6, b.y + Math.sin(a) * b.r * 0.6);
      ctx.lineTo(b.x + Math.cos(a) * b.r * 1.15, b.y + Math.sin(a) * b.r * 1.15);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawSparks() {
  ctx.save(); ctx.lineCap = 'round';
  for (const s of sparks) {
    ctx.globalAlpha = Math.max(0, s.life);
    ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 1.4, s.y - s.vy * 1.4); ctx.stroke();
  }
  ctx.restore();
}

function drawDust() {
  for (const d of dusts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, d.life * 0.8);
    ctx.fillStyle = '#8f7d5f';
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/* metaball-ish blood: blobs draw fat, near pairs get a connecting capsule */
function drawBloodAir() {
  ctx.save();
  ctx.fillStyle = '#c1121f'; ctx.strokeStyle = '#c1121f';
  for (const b of bloods) {
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < bloods.length; i++) for (let j = i + 1; j < bloods.length; j++) {
    const a = bloods[i], c = bloods[j];
    const dx = a.x - c.x, dy = a.y - c.y, dd = dx * dx + dy * dy;
    const reach = (a.r + c.r) * 2.1;
    if (dd < reach * reach) {
      ctx.lineWidth = Math.min(a.r, c.r) * 1.1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
  }
  ctx.restore();
}
function drawPools() {
  for (const p of pools) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * 0.92;
    ctx.fillStyle = '#a30f1a';
    ctx.beginPath(); ctx.ellipse(p.x, GROUND + 2, p.w, p.w * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- phase cards / badge / code panel ---------- */
let lastPhase = '';
function currentPhase() {
  if (t < 0) return '';
  if (t < T_CONTACT) return 'windup';
  if (t <= EV.sparks + 2) return 'active';
  return 'recovery';
}
function updatePhaseCards() {
  const ph = currentPhase();
  if (ph === lastPhase) return;
  lastPhase = ph;
  document.querySelectorAll('.phase-card').forEach(c =>
    c.classList.toggle('active', c.dataset.phase === ph));
}
function updateFreezeBadge() {
  document.getElementById('freeze-badge')
    .classList.toggle('on', atkHold > 0 || vicHold > 0);
}

function renderCode() {
  const L = (id, txt) => `  <span class="${on[id] ? 'hl' : 'off'}">${txt}</span>`;
  document.getElementById('pseudocode').innerHTML =
    `<b>on Z:</b>  <i># from Impact Effects.unity</i>\n` +
    L('anim',   't+0.00  play(attack_anim)') + '\n' +
    (soundOn ? '  <span class="hl">t+0.10  play(whoosh)</span>' : '  <span class="off">t+0.10  play(whoosh)</span>') + '\n' +
    L('swing',  't+0.20  spawn(sword_swing_fx)') + '\n' +
    L('dust',   't+0.20  spawn(foot_dust)') + '\n' +
    L('shake',  't+0.20  shake(0.16s, sine_decay)') + '\n' +
    L('blood',  't+0.20  spawn(blood)') + '\n' +
    L('struck', 't+0.22  play(struck + color_flash)') + '\n' +
    (soundOn ? '  <span class="hl">t+0.22  play(impact_sfx + grunt)</span>' : '  <span class="off">t+0.22  play(impact_sfx + grunt)</span>') + '\n' +
    L('hit',    't+0.23  spawn(hit_burst)') + '\n' +
    L('impact', 't+0.25  spawn(impact_sparks)') + '\n' +
    L('stop',   '"Hiccup" clips hold both actors 4f');
}

/* ---------- layer list UI ---------- */
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

/* ---------- wiring ---------- */
document.getElementById('attack-btn').addEventListener('click', fullAttack);
cv.addEventListener('pointerdown', fullAttack);
document.getElementById('reset-btn').addEventListener('click', () => LAYERS.forEach(l => setLayer(l.id, true)));
document.getElementById('toggle-sound').addEventListener('change', e => {
  soundOn = e.target.checked; if (soundOn) wakeAudio(); renderCode();
});
document.getElementById('toggle-demo').addEventListener('change', e => {
  autoDemo = e.target.checked; autoTimer = 30;
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

/* ---------- loop ---------- */
function frame() { update(); draw(); requestAnimationFrame(frame); }
buildLayers();
renderCode();
frame();
