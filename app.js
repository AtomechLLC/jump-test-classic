/* The Basics of Jumping — interactive edition
   Inspired by Celia Wagar's animated diagram (critpoints.net).

   Physics run at a fixed 60 Hz in world pixels (1 tile = 16 px), drawn at 3×.
   Values are taken from disassembly-based documentation where available:
   - SMB1: smbpedia (simplistic6502.github.io/smb1_tll) — accel/decel bytes and
     the 5-entry speed-indexed jump table; velocities are px/frame (16 subpx/px,
     forces in 1/4096 px).
   - Sonic 1: Sonic Physics Guide (info.sonicretro.org/SPG) — exact constants,
     update order (velocity added to position BEFORE gravity), air drag, and
     the "no movement on the jump frame" quirk. Sonic 1 has no fall speed cap.
   - Castlevania: TASVideos frame data (walk = 1 px/frame; flat jump = 40
     frames; lands 2 blocks up at 29f / 1 up at 36f). The original uses a
     preset trajectory table; v0=4.0 g=0.2 reproduces the documented rise
     timings and 40-frame airtime to within a frame. */

'use strict';

const SCALE = 3;
const VIEW_W = 1152, VIEW_H = 576;
const W = VIEW_W / SCALE, H = VIEW_H / SCALE;   // 384 × 192 world px
const TILE = 16;
const GROUND = 168;                              // world y of the ground top
const STEP_MS = 1000 / 60;

const S = v => v * SCALE;

/* ------------------------------------------------------------------ blocks */

const BLOCKS = [
  { x: 0, w: 4, h: 64, wall: true },  // thin left wall, 4 tiles, drawn behind
  { x: 262, w: 36, h: 32 },           // 2 tiles
  { x: 302, w: 36, h: 48 },           // 3 tiles
  { x: 342, w: 42, h: 64 },           // 4 tiles
].map(b => ({ ...b, y: GROUND - b.h }));

/* -------------------------------------------------------------- characters */

const CHARS = {
  castlevania: {
    name: 'Simon', game: 'Castlevania', accent: '#b5432a',
    hitboxW: 12,
    defaults: { walkSpeed: 1.0, jumpForce: 4.0, gravity: 0.2, terminal: 8 },
    sliders: [
      { key: 'jumpForce', label: 'Initial jump force', min: 2, max: 8, step: 0.1 },
      { key: 'gravity',   label: 'Gravity per frame',  min: 0.05, max: 0.6, step: 0.005 },
      { key: 'walkSpeed', label: 'Walk speed',         min: 0.4, max: 2.4, step: 0.1 },
    ],
    explainer: `
      <h2>The Castlevania Jump</h2>
      <p>The Castlevania jump (or Donkey Kong jump) is the most basic type of
      jump that all other jumps are based on. It creates a parabolic arc with
      only an initial jump force, and gravity.</p>
      <p class="rule"><b>The twist: there is none.</b> The arc is fully
      committed — no steering in the air, no cutting it short. Simon walks at
      exactly 1 px/frame and a flat-ground jump lasts 40 frames; he can land
      on a ledge 2 blocks up, never 3.</p>`,
    pseudocode:
`y         += yVelocity
yVelocity -= gravity
<span class="hl">// xVelocity is locked at takeoff
// — no air control at all</span>`,
  },

  mario: {
    name: 'Mario', game: 'Super Mario Bros.', accent: '#d03028',
    hitboxW: 12,
    defaults: {
      minWalk: 0.07421875,       // 0x00130 — standstill snaps to this
      walkAccel: 0.037109375,    // 0x00098
      runAccel: 0.0556640625,    // 0x000E4 (B held)
      releaseDecel: 0.05078125,  // 0x000D0
      skidDecel: 0.1015625,      // 0x001A0
      maxWalk: 1.5,              // 24 subpx/frame
      maxRun: 2.5,               // 40 subpx/frame
      terminal: 4.5,
      jumpForce: 4.0,            // tier-1 values; other tiers scale from these
      holdGravity: 0.125,        // 0x20/256
      releaseGravity: 0.4375,    // 0x70/256
    },
    /* the speed-indexed jump table from the disassembly (px/frame):
       |vx| >= min  →  initial vy, gravity holding A, gravity otherwise */
    tiers: [
      { min: 1.5625, vy: 5.0, hold: 0.15625,   fall: 0.5625 },  // ≥25 subpx
      { min: 1.0,    vy: 4.0, hold: 0.1171875, fall: 0.375  },  // 16–24
      { min: 0,      vy: 4.0, hold: 0.125,     fall: 0.4375 },  // <16
    ],
    sliders: [
      { key: 'jumpForce',      label: 'Initial jump force',    min: 2, max: 8, step: 0.1 },
      { key: 'holdGravity',    label: 'Gravity (button held)', min: 0.03, max: 0.6, step: 0.005 },
      { key: 'releaseGravity', label: 'Gravity (released)',    min: 0.03, max: 1.0, step: 0.005 },
      { key: 'maxRun',         label: 'Top speed (run)',       min: 1, max: 5, step: 0.1 },
      { key: 'runAccel',       label: 'Acceleration (run)',    min: 0.02, max: 0.3, step: 0.005 },
    ],
    explainer: `
      <h2>The Mario Jump</h2>
      <p>Super Mario Bros. starts from the same recipe, then makes height
      variable by <i>switching gravity</i>: while the button is held and Mario
      is rising, gravity is weak (0.125). Release the button — or pass the
      peak — and it becomes 0.4375, ~3.5× stronger.</p>
      <p class="rule"><b>The twist: hold to go higher.</b> The jump table is
      speed-indexed: at ≥1.5625 px/f the initial force becomes 5.0 (with
      heavier gravity to match). Hold <kbd>Shift</kbd> to run, and try tapping
      vs. holding the jump key.</p>`,
    pseudocode:
`y         += yVelocity
<span class="hl">if (rising && jumpHeld)
      yVelocity -= holdGravity    // weak
else  yVelocity -= releaseGravity // ~3.5×</span>`,
  },

  smw: {
    name: 'Mario', game: 'Super Mario World', accent: '#2f9648',
    hitboxW: 12,
    defaults: {
      accel: 0.09375,         // ±1/±2 subpx alternating ≈ 1.5 subpx/frame²
      releaseDecel: 0.0625,   // 1 subpx
      skidDecel: 0.125,       // approximated — see README
      maxWalk: 1.3125,        // 21 subpx/frame
      maxRun: 2.3125,         // 37 subpx/frame
      maxSprint: 3.0625,      // 49 subpx/frame — P-speed
      pMeterFull: 56,         // ≈80 frames standstill → maxed meter, minus accel time
      jumpForce: 4.8125,      // 77 subpx standing; scales to 92 at P-speed
      holdGravity: 0.1875,    // 3 subpx — reproduces the documented 6/5/2-tile heights
      releaseGravity: 0.375,  // 6 subpx — release exactly doubles gravity
      terminal: 4.0,
    },
    sliders: [
      { key: 'jumpForce',      label: 'Jump force (standing)', min: 2, max: 8, step: 0.0625 },
      { key: 'holdGravity',    label: 'Gravity (button held)', min: 0.03, max: 0.6, step: 0.005 },
      { key: 'releaseGravity', label: 'Gravity (released)',    min: 0.03, max: 1.0, step: 0.005 },
      { key: 'maxSprint',      label: 'P-speed (sprint)',      min: 1, max: 5, step: 0.0625 },
      { key: 'accel',          label: 'Acceleration',          min: 0.02, max: 0.3, step: 0.005 },
    ],
    explainer: `
      <h2>The Super Mario World Jump</h2>
      <p>The SNES refinement: the gravity switch stays (0.1875 held &amp;
      rising, 0.375 released — release exactly <i>doubles</i> gravity, gentler
      than SMB1's ~3.5×), but now the initial jump force itself scales with
      ground speed — 77 subpixels standing, 82 at walk, 87 at run, 92 at full
      P-speed.</p>
      <p class="rule"><b>The twist: speed <i>is</i> height.</b> Hold
      <kbd>Shift</kbd> at run speed for ~1&nbsp;second to fill the P-meter and
      unlock the 3.06 px/f sprint — the only way to reach the full 6-tile
      jump (and even then, only just barely).</p>`,
    pseudocode:
`<span class="hl">// takeoff: force scales with speed
jumpForce = table[ |xVelocity| ]  // 77…92</span>
y         += yVelocity
if (rising && jumpHeld)
      yVelocity -= 0.1875
else  yVelocity -= 0.375  <span class="hl">// exactly 2×</span>`,
  },

  sonic: {
    name: 'Sonic', game: 'Sonic the Hedgehog', accent: '#2456e0',
    hitboxW: 14,
    defaults: { accel: 0.046875, decel: 0.5, friction: 0.046875, topSpeed: 6,
                jumpForce: 6.5, gravity: 0.21875, releaseCap: 4 },
    sliders: [
      { key: 'jumpForce',  label: 'Initial jump force',     min: 2, max: 9, step: 0.1 },
      { key: 'gravity',    label: 'Gravity per frame',      min: 0.05, max: 0.6, step: 0.005 },
      { key: 'releaseCap', label: 'Release cap (jump cut)', min: 0.5, max: 6.5, step: 0.1 },
      { key: 'topSpeed',   label: 'Top speed',              min: 2, max: 8, step: 0.1 },
      { key: 'accel',      label: 'Acceleration',           min: 0.02, max: 0.25, step: 0.005 },
    ],
    explainer: `
      <h2>The Sonic Jump</h2>
      <p>Sonic keeps one gravity value (0.21875) but <i>cuts the jump on
      release</i>: let go of the button while moving upward faster than
      4 px/frame and your upward speed instantly drops to 4. There is no fall
      speed cap in Sonic&nbsp;1.</p>
      <p class="rule"><b>The twist: momentum.</b> Acceleration is 0.046875
      px/f² (doubled in the air) against a top speed of 6, so the same 6.5
      jump force produces wildly different arcs. Take a long run-up, then
      jump.</p>`,
    pseudocode:
`<span class="hl">if (!jumpHeld && yVelocity > cap)
      yVelocity = cap   // jump cut</span>
y         += yVelocity
yVelocity -= gravity
<span class="hl">// then air drag while -4 &lt; yVel &lt; 0</span>`,
  },

  metroid: {
    name: 'Samus', game: 'Super Metroid', accent: '#c2571d',
    hitboxW: 14,
    defaults: {
      walkSpeed: 2.75,      // NTSC "2.49152" in px.subpx notation
      accel: 0.3,           // approximated — Samus reaches walk speed quickly
      dashAccel: 0.0625,    // documented: 4096 subpx/frame while dash held
      dashMax: 2.0,         // run = walk + full dash = 4.75 px/f
      airCap: 1.375,        // air-control cap ("1.24576"); momentum is kept
      airAccel: 0.125,      // approximated
      jumpForce: 4.875,     // "4.57344"
      gravity: 0.109375,    // 7168 subpx — same rising and falling
      terminal: 5.03125,    // "5.02048" fall cap, NTSC
    },
    sliders: [
      { key: 'jumpForce', label: 'Initial jump force', min: 2, max: 8, step: 0.0625 },
      { key: 'gravity',   label: 'Gravity per frame',  min: 0.03, max: 0.6, step: 0.005 },
      { key: 'walkSpeed', label: 'Walk speed',         min: 1, max: 4, step: 0.05 },
      { key: 'dashMax',   label: 'Dash bonus (run)',   min: 0, max: 4, step: 0.125 },
      { key: 'airCap',    label: 'Air-control cap',    min: 0.25, max: 4, step: 0.125 },
    ],
    explainer: `
      <h2>The Super Metroid Jump</h2>
      <p>The third way to vary height (the diagram names all three): <i>release
      to stop</i>. Let go of jump while rising and upward speed is set
      straight to 0 — the ascent simply ends. Gravity is a floaty 0.109375
      both ways (half of Sonic's), so the full 4.875 jump force buys a
      ~7-tile apex and 1.5 seconds of hang time. Zebes moon-gravity.</p>
      <p class="rule"><b>The twist: momentum vs. air control.</b> Air steering
      is capped at 1.375 px/f — but speed carried from the ground is kept.
      Hold <kbd>Shift</kbd> to dash (+2 px/f built over ~32 frames on top of
      the 2.75 walk), and a moving jump becomes a somersault.</p>`,
    pseudocode:
`<span class="hl">if (!jumpHeld && rising)
      yVelocity = 0   // ascent ends</span>
y         += yVelocity
yVelocity -= 0.109375 <span class="hl">// floaty, both ways</span>`,
  },

  megaman: {
    name: 'Mega Man', game: 'Mega Man 2', accent: '#1e78c8',
    hitboxW: 14,
    defaults: {
      walkSpeed: 1.296875,    // 0x01.4C
      jumpForce: 4.87109375,  // 0x04.DF, from the nesdev disassembly thread
      gravity: 0.25,          // 0x00.40
      terminal: 7,
    },
    sliders: [
      { key: 'jumpForce', label: 'Initial jump force', min: 2, max: 8, step: 0.0625 },
      { key: 'gravity',   label: 'Gravity per frame',  min: 0.05, max: 0.6, step: 0.005 },
      { key: 'walkSpeed', label: 'Walk speed',         min: 0.5, max: 3, step: 0.05 },
    ],
    explainer: `
      <h2>The Mega Man Jump</h2>
      <p>Digital movement, analog jump: walking has <i>no acceleration at
      all</i> — 1.296875 px/frame the instant you press, zero the instant you
      release, on the ground or in the air. The jump is Samus-style: release
      while rising and upward speed is set to 0.</p>
      <p class="rule"><b>The twist: total control.</b> With instant air
      control at full walk speed and an instantly cuttable jump, every pixel
      of the arc is yours — which is why Mega Man platforming can demand so
      much precision.</p>`,
    pseudocode:
`xVelocity = dir * 1.296875 <span class="hl">// instant, even mid-air</span>
if (!jumpHeld && rising)
      yVelocity = 0
y         += yVelocity
yVelocity -= 0.25`,
  },

  megamanx: {
    name: 'X', game: 'Mega Man X', accent: '#00a0a8',
    hitboxW: 14,
    defaults: {
      walkSpeed: 1.5,     // TASVideos data page
      dashSpeed: 3.5,
      jumpForce: 5.0,
      gravity: 0.25,
      terminal: 5.75,
    },
    sliders: [
      { key: 'jumpForce', label: 'Initial jump force', min: 2, max: 8, step: 0.0625 },
      { key: 'gravity',   label: 'Gravity per frame',  min: 0.05, max: 0.6, step: 0.005 },
      { key: 'walkSpeed', label: 'Walk speed',         min: 0.5, max: 3, step: 0.05 },
      { key: 'dashSpeed', label: 'Dash speed',         min: 1, max: 6, step: 0.05 },
    ],
    explainer: `
      <h2>The Mega Man X Jump</h2>
      <p>The 16-bit evolution keeps the instant, cuttable jump (release while
      rising → upward speed 0; same gravity 0.25) but adds the <i>dash</i>:
      hold <kbd>Shift</kbd> to move at 3.5 px/frame instead of 1.5 — and a
      jump started from a dash keeps that speed for the whole arc.</p>
      <p class="rule"><b>The twist: the dash jump.</b> Same height, 2.3×
      the distance. Every X game is balanced around it. (Wall slides and
      wall kicks exist in the real game but not in this sample.)</p>`,
    pseudocode:
`xVelocity = dir * (dashing ? 3.5 : 1.5)
<span class="hl">// dash-jumps keep 3.5 in the air</span>
if (!jumpHeld && rising)
      yVelocity = 0
y         += yVelocity
yVelocity -= 0.25`,
  },

  kirby: {
    name: 'Kirby', game: 'Kirby Super Star', accent: '#e0679f',
    hitboxW: 16,
    defaults: {
      walkSpeed: 1.25,       // Super Star movement, approximated
      runSpeed: 2.5,         // dash: roughly double walk speed
      jumpForce: 9.0,        // high force + high gravity = a snappy burst
      riseGravity: 0.45,     // high gravity while ascending...
      fallGravity: 0.4,      // ...AND on the way down — very reactive
      terminal: 4.0,         // real falls are quick; the float is the floaty part
      flapImpulse: 2.0,      // float jumps: low initial force...
      floatGravity: 0.09375,
      floatTerminal: 0.75,   // ...and a low capped terminal velocity
      floatSpeed: 0.875,
    },
    sliders: [
      { key: 'jumpForce',     label: 'Initial jump force', min: 2, max: 12, step: 0.0625 },
      { key: 'riseGravity',   label: 'Gravity (rising)',   min: 0.05, max: 0.6, step: 0.005 },
      { key: 'fallGravity',   label: 'Gravity (falling)',  min: 0.03, max: 0.6, step: 0.005 },
      { key: 'flapImpulse',   label: 'Flap impulse',       min: 0.5, max: 4, step: 0.125 },
      { key: 'floatTerminal', label: 'Float fall speed',   min: 0.1, max: 3, step: 0.05 },
    ],
    explainer: `
      <h2>The Kirby Jump</h2>
      <p>The first jump is <i>very</i> reactive: a really high initial
      force under really high gravity — in <b>both</b> directions, so Kirby
      bursts up and comes right back down. Its height is <i>fixed</i> —
      holding the button does nothing. All of Kirby's famous floatiness
      lives in the float: press jump mid-air to puff up, and flaps use a
      low impulse with a low capped fall speed. Forever.</p>
      <p class="rule"><b>The twist: flight as forgiveness.</b> Missed the
      ledge? Flap. Ground movement is Super Star style: an instant walk and
      a double-speed dash on <kbd>Shift</kbd>.</p>`,
    pseudocode:
`<span class="hl">if (airborne && jumpPressed)
      puffed = true, yVelocity = flap</span>
y += yVelocity
if (puffed)      yVelocity -= 0.094 <span class="hl">// max fall 0.75</span>
else if (rising) yVelocity -= 0.45 <span class="hl">// burst up</span>
else             yVelocity -= 0.40 <span class="hl">// and right back down</span>`,
  },

  ori: {
    name: 'Ori', game: 'Ori and the Blind Forest', accent: '#4aa8d8',
    hitboxW: 16,
    defaults: {
      /* HorizontalPlatformMovementSettings: MaxSpeed 11.6, Acceleration 60,
         Deceleration 30 (units/s), converted via the 3-unit jump anchor
         (21.5 px/unit at 60 fps). The same set applies on the ground and
         in the air. */
      topSpeed: 4.157,
      accel: 0.358,
      friction: 0.179,
      jumpForce: 4.6,         // first jump of the chain
      chainWindow: 12,        // frames after landing to continue the chain
      airJumpForce: 4.0,
      holdGravity: 0.17,
      releaseGravity: 0.4,
      terminal: 5,
      airJumps: 1,            // the Double Jump ability
    },
    /* ground-chain height ratios from the SeinJump source:
       FirstJumpHeight 3, SecondJumpHeight 3.75, ThirdJumpHeight 4.5 */
    chainRatios: [1, 1.25, 1.5],
    sliders: [
      { key: 'jumpForce',      label: 'Initial jump force',    min: 2, max: 8, step: 0.1 },
      { key: 'airJumpForce',   label: 'Air jump force',        min: 1, max: 8, step: 0.1 },
      { key: 'airJumps',       label: 'Air jumps',             min: 0, max: 4, step: 1 },
      { key: 'holdGravity',    label: 'Gravity (button held)', min: 0.03, max: 0.6, step: 0.005 },
      { key: 'releaseGravity', label: 'Gravity (released)',    min: 0.03, max: 1.0, step: 0.005 },
    ],
    explainer: `
      <h2>The Ori Jump</h2>
      <p>The triple jump lives <i>on the ground</i>: land and jump again
      within a beat and the chain escalates — skip, hop, then a spinning
      flip. The jump heights come straight from the SeinJump source:
      3, then 3.75, then 4.5 units (a 1 : 1.25 : 1.5 ladder). Miss the
      window and the chain resets. Each jump is soft-gravity while held,
      heavy when released, plus one mid-air Double Jump.</p>
      <p class="rule"><b>The twist: rhythm.</b> The best height isn't a
      button you hold — it's a beat you keep. Land, jump, land, jump,
      <i>flip.</i></p>`,
    pseudocode:
`<span class="hl">onLand: window = 12 frames
if (jump within window) stage++
heights: 3 → 3.75 → 4.5 (flip)</span>
y += yVelocity
if (rising && jumpHeld)
      yVelocity -= 0.17
else  yVelocity -= 0.40`,
  },
};

const CHAR_ORDER = ['castlevania', 'mario', 'smw', 'sonic', 'metroid', 'megaman', 'megamanx', 'kirby', 'ori'];

/* ---- modern game-feel assists (toggleable, applied to every character) ---- */
const COYOTE_FRAMES = 6;   // grace window after walking off a ledge
const BUFFER_FRAMES = 6;   // early jump press remembered until landing
const ASSISTS = { coyote: true, buffer: true };   // synced from checkboxes

/* SMW jump force scales with |vx|: 77/82/87/92 subpx at standstill /
   walk max (21) / run max (37) / sprint max (49) — interpolated between. */
function smwJumpForce(P, vxAbs) {
  const anchors = [[0, 77], [21, 82], [37, 87], [49, 92]];
  const s = Math.min(vxAbs * 16, 49);
  let subpx = 92;
  for (let i = 1; i < anchors.length; i++) {
    if (s <= anchors[i][0]) {
      const [s0, j0] = anchors[i - 1], [s1, j1] = anchors[i];
      subpx = j0 + (j1 - j0) * (s - s0) / (s1 - s0);
      break;
    }
  }
  return (subpx / 16) * (P.jumpForce / 4.8125);
}

/* ----------------------------------------------------------------- sprites
   Frames sliced from sheets on The Spriters Resource (see README credits).
   Simon's sheet faces left; Mario's and Sonic's face right. */

const SPRITE_DEFS = {
  castlevania: { facesLeft: true, frames: {
    idle: 'simon_idle', run1: 'simon_run1', run2: 'simon_run2',
    run3: 'simon_run3', jump: 'simon_jump' } },
  mario: { facesLeft: false, frames: {
    idle: 'mario_idle', run1: 'mario_run1', run2: 'mario_run2',
    run3: 'mario_run3', jump: 'mario_jump' } },
  smw: { facesLeft: false, frames: {
    idle: 'smw_idle', walk1: 'smw_walk1', walk2: 'smw_walk2',
    run1: 'smw_run1', run2: 'smw_run2',
    jump: 'smw_jump', fall: 'smw_fall', runjump: 'smw_runjump' } },
  metroid: { facesLeft: false, frames: {
    idle: 'samus_idle',
    run1: 'samus_run1', run2: 'samus_run2', run3: 'samus_run3',
    run4: 'samus_run4', run5: 'samus_run5', run6: 'samus_run6',
    run7: 'samus_run7', run8: 'samus_run8', run9: 'samus_run9',
    run10: 'samus_run10',
    jump: 'samus_jump', fall: 'samus_fall',
    spin1: 'samus_spin1', spin2: 'samus_spin2', spin3: 'samus_spin3',
    spin4: 'samus_spin4', spin5: 'samus_spin5', spin6: 'samus_spin6',
    spin7: 'samus_spin7', spin8: 'samus_spin8' } },
  megaman: { facesLeft: true, frames: {
    idle: 'mm_idle', run1: 'mm_run1', run2: 'mm_run2', run3: 'mm_run3',
    jump: 'mm_jump' } },
  megamanx: { facesLeft: false, frames: {
    idle: 'mmx_idle',
    run1: 'mmx_run1', run2: 'mmx_run2', run3: 'mmx_run3', run4: 'mmx_run4',
    run5: 'mmx_run5', run6: 'mmx_run6', run7: 'mmx_run7', run8: 'mmx_run8',
    run9: 'mmx_run9', run10: 'mmx_run10',
    jump: 'mmx_jump', fall: 'mmx_fall', dash: 'mmx_dash' } },
  kirby: { facesLeft: false, frames: {
    idle: 'kirby_idle', walk1: 'kirby_walk1', walk2: 'kirby_walk2',
    walk3: 'kirby_walk3', jump: 'kirby_jump', fall: 'kirby_fall',
    tumble1: 'kirby_tumble1', tumble2: 'kirby_tumble2',
    tumble3: 'kirby_tumble3',
    puff1: 'kirby_puff1', puff2: 'kirby_puff2', puff3: 'kirby_puff3',
    puff4: 'kirby_puff4' } },
  /* Ori's frames ship at the game's native resolution and draw at 1:1
     screen pixels (scale = 1/SCALE), so no resampling ever happens. */
  ori: { facesLeft: false, scale: 1 / SCALE, frames: {
    idle: 'ori_idle',
    ...Object.fromEntries(Array.from({ length: 13 },
      (_, i) => ['run' + (i + 1), 'ori_run' + (i + 1)])),
    skip: 'ori_skip', hop: 'ori_hop', flip: 'ori_flip',
    fall: 'ori_fall' } },
  sonic: { facesLeft: false, frames: {
    idle: 'sonic_idle',
    walk1: 'sonic_walk1', walk2: 'sonic_walk2', walk3: 'sonic_walk3',
    walk4: 'sonic_walk4', walk5: 'sonic_walk5', walk6: 'sonic_walk6',
    frun1: 'sonic_run1', frun2: 'sonic_run2', frun3: 'sonic_run3',
    frun4: 'sonic_run4',
    ball1: 'sonic_ball1', ball2: 'sonic_ball2', ball3: 'sonic_ball3',
    ball4: 'sonic_ball4' } },
};

const SPRITE_CACHE = {};   // [charKey][frameKey] = {right, left, w, h}
const ASSET_V = 7;         // bump when sprite files change, so caches can't
                           // mix frame generations (e.g. old walk + new idle)

/* Hand-drawn placeholder pixel art, used when assets/ is missing (the ripped
   sprites are not redistributed with this repo — see README). */

const FALLBACK_PALETTES = {
  castlevania: { d: '#4a2c14', a: '#c9782f', s: '#eec39a' },
  mario: { r: '#e03c28', h: '#7a3410', s: '#f8c088', b: '#2a52c8', y: '#f8d820' },
  sonic: { b: '#2456e0', s: '#f2c896', r: '#d82818', w: '#ffffff', k: '#101010' },
};

const SIMON_TOP = [
  '.....dddddd.....', '....dddddddd....', '....ddssssdd....', '....dssssss.....',
  '....dsssssss....', '....dssssss.....', '.....ssssss.....', '....aaaaaaa.....',
  '...aaaaaaaaa....', '..aaaaaaaaaaa...', '..aa.aaaaa.aa...', '..ss.aaaaa.ss...',
  '.....aaaaa......', '....aaaaaaa.....'];
const MARIO_TOP = [
  '....rrrrrr......', '...rrrrrrrrrr...', '...hhhhssss.....', '..hhshsssss.....',
  '..hhshhssssss...', '..hhsssssss.....', '....ssssssss....', '...rrrbbrr......',
  '..rrrrbbrrrr....', '.rrrrbbbbrrrr...', '.ssrrbybbybrss..', '.sssbbbbbbbss...',
  '.ssbbbbbbbbbss..'];
const SONIC_TOP = [
  '......bbbb......', '....bbbbbbbb....', '...bbbbbbbbbb...', '.b.bbbbbbbbbb...',
  '..bbbbbbbwwk....', '.bbbbbbbbwwk....', 'b.bbbbbbssss....', '.bbbbbbbsssk....',
  '..bbbbbbsss.....', '...bbbbbbb......', '...bssssbb......', '..bbssssbbb.....',
  '..s.bbbb.s......', '.ss..bb..ss.....'];

const FALLBACK_MAPS = {
  castlevania: {
    idle: [...SIMON_TOP, '....aa.aaa......', '....aa..aa......', '....aa..aa......',
      '....dd..dd......', '...ddd..ddd.....', '...ddd..ddd.....'],
    run1: [...SIMON_TOP, '....aa.aaa......', '...aa....aa.....', '...aa....aa.....',
      '...dd.....dd....', '..ddd.....ddd...', '..ddd.....ddd...'],
    run2: [...SIMON_TOP, '....aaaa........', '....aa.aa.......', '....aa.aa.......',
      '....dd.dd.......', '...ddd.ddd......', '...ddd.ddd......'],
    jump: ['.....dddddd.....', '....dddddddd....', '....ddssssdd....', '....dssssss.....',
      '....dsssssss....', '.....ssssss.....', '....aaaaaaa.....', '...aaaaaaaaa....',
      '..ssaaaaaaas....', '...aaaaaaaa.....', '....aaaaaa......', '...aaddaadd.....',
      '...addd.ddd.....', '...ddd..ddd.....'],
  },
  mario: {
    idle: [...MARIO_TOP, '...bbb..bbb.....', '..hhhh..hhhh....', '.hhhhh..hhhhh...'],
    run1: [...MARIO_TOP, '...bbbb.bbb.....', '..hhhh...hhh....', '.hhhh.....hhh...'],
    run2: [...MARIO_TOP, '....bbbbb.......', '....hhhhh.......', '...hhhhhh.......'],
    jump: ['....rrrrrr..ss..', '...rrrrrrrrrss..', '...hhhhssss.r...', '..hhshsssssr....',
      '..hhshhssssrr...', '..hhsssssrr.....', '....ssssssrr....', '...rrrbbrr......',
      '..rrrrbbrrr.....', '.rrrrbbbbrrr....', '.ssrrbybbybs....', '.sssbbbbbbb.....',
      '..sbbbbbbbbb....', '..bbbb.bbbb.....', '.hhhh...hhhh....', '.hhh.....hhh....'],
  },
  sonic: {
    idle: [...SONIC_TOP, '.....b.b........', '....bb.bb.......', '....b...b.......',
      '...rr...rr......', '..rrrw..rrrw....', '.rrrr...rrrr....'],
    run1: [...SONIC_TOP, '.....b..b.......', '....bb...bb.....', '...rr.....rr....',
      '..rrrw...rrrw...', '.rrrr.....rrr...'],
    run2: [...SONIC_TOP, '......bb........', '.....b.b........', '....rr.rr.......',
      '...rrrwrrrw.....', '...rrr.rrr......'],
    ball1: ['...bbbbbb...', '..bbbbbbbb..', '.bbwbbbbbbb.', 'bbbwbbbbbbbb',
      'bbbwbbbbwbbb', 'bbbbwbbwbbbb', 'bbbbwwwbbbbb', 'bbbwbbbwbbbb',
      'bbwbbbbbwbbb', '.bbbbbbbbbb.', '..bbbbbbbb..', '...bbbbbb...'],
    ball2: ['...bbbbbb...', '..bbbbwbbb..', '.bbbbbwbbbb.', 'bbbbbbwbbbbb',
      'bbwbbbbbbbbb', 'bbbwwbbbbbbb', 'bbbbbwwwbbbb', 'bbbbbbbbwbbb',
      'bbbbbbbbwbbb', '.bbbbbwbbbb.', '..bbbbbbbb..', '...bbbbbb...'],
  },
};

FALLBACK_MAPS.smw = FALLBACK_MAPS.mario;        // same silhouette works fine
FALLBACK_PALETTES.smw = FALLBACK_PALETTES.mario;
FALLBACK_MAPS.metroid = FALLBACK_MAPS.castlevania;   // tall silhouette
FALLBACK_PALETTES.metroid = { d: '#7a2010', a: '#d8b020', s: '#e08030' };
FALLBACK_MAPS.megaman = FALLBACK_MAPS.mario;
FALLBACK_PALETTES.megaman = { r: '#1e78c8', h: '#0a3f8c', s: '#f8d8b0', b: '#40b8f0', y: '#f8d820' };
FALLBACK_MAPS.megamanx = FALLBACK_MAPS.mario;
FALLBACK_PALETTES.megamanx = { r: '#00a0a8', h: '#005060', s: '#f8d8b0', b: '#70d8e0', y: '#f8d820' };
FALLBACK_MAPS.kirby = FALLBACK_MAPS.sonic;           // round silhouette
FALLBACK_PALETTES.kirby = { b: '#e888b8', s: '#f8c8d8', r: '#d04870', w: '#ffffff', k: '#101010' };

/* Ori is original pixel art (the game is skeletal-animated — no sprite
   frames exist to rip), so these maps ARE the sprites, built inline. */
FALLBACK_PALETTES.ori = { w: '#f0f6ff', s: '#b8cbe4', o: '#71809f', e: '#2c3a55', g: '#a8e4f0' };
FALLBACK_MAPS.ori = {
  idle: [
    '.....o..o.......', '....owo owo.....', '....owwowwo.....', '.....owwwwoo....',
    '.....owwwwwo....', '....owwewwwo....', '....owwwwwo.....', '.....owwwo......',
    '.....sowws......', '....owwwwwo.....', '...oswwwwwso....', '..os.owwwws.....',
    '.oo...owwo......', '.......oo.......', '......ow.wo.....', '......o...o.....',
    '.....oo...oo....'],
  run1: [
    '....o..o........', '...owo owo......', '...owwowwo......', '....owwwwoo.....',
    '....owwwwwwo....', '...owwewwwwo....', '....owwwwwo.....', '.....owwwo......',
    '....sowwws......', '...owwwwwwo.....', '..oswwwwwso.....', '.os.owwwws......',
    'oo...owwo.......', '....ow..wo......', '...ow....wo.....', '..oo......oo....'],
  run2: [
    '....o..o........', '...owo owo......', '...owwowwo......', '....owwwwoo.....',
    '....owwwwwwo....', '...owwewwwwo....', '....owwwwwo.....', '.....owwwo......',
    '....sowwws......', '...owwwwwwo.....', '..oswwwwwso.....', '.os.owwwws......',
    'oo...owwo.......', '......ow........', '.....owwo.......', '.....o..o.......'],
  jump: [
    '......o..o......', '.....owo owo....', '.....owwowwo....', '......owwwwoo...',
    '......owwwwwo...', '.....owwewwwo...', '.....owwwwwo....', '......owwwo.....',
    '.....sowwws.....', '....owwwwwo.....', '...oswwwwso.....', '....owwwso......',
    '...ow.owo.......', '..ow...o........'],
  fall: [
    '.....o....o.....', '.....ow..wo.....', '.....owoowo.....', '......owwwo.....',
    '.....owwwwoo....', '....owwewwwo....', '.....owwwwo.....', '.....owwwo......',
    '....sowwws......', '...owwwwwwo.....', '..o.swwwws.o....', '.o...owwo...o...',
    '.....ow.wo......', '....ow...wo.....', '...oo.....oo....'],
  flip: [
    '.....oooo.......', '...oowwwwoo.....', '..owwwsswwwo....', '..owsoowwswo....',
    '.owso.ewwswo....', '.owwo.owwswo....', '..owwwwwswo.....', '..oswwwsswo.....',
    '...oosssoo......', '.....oooo.......'],
};

/* frameKey → fallback pixel map, per character */
function fallbackMapFor(charKey, frameKey) {
  const maps = FALLBACK_MAPS[charKey];
  if (maps[frameKey]) return maps[frameKey];
  const n = +frameKey.replace(/\D/g, '') || 1;
  if (/^(ball|puff|tumble)/.test(frameKey)) return n % 2 ? maps.ball1 : maps.ball2;
  if (/jump|fall|spin|flip|skip|hop/.test(frameKey)) return maps.jump || maps.idle;
  if (/^(walk|frun|run)/.test(frameKey)) return n % 2 ? maps.run1 : maps.run2;
  return maps.idle;
}

function buildFallbackSprite(charKey, frameKey) {
  const rows = fallbackMapFor(charKey, frameKey);
  const pal = FALLBACK_PALETTES[charKey];
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  const make = flip => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
      if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(flip ? w - 1 - rx : rx, ry, 1, 1); }
    }));
    return c;
  };
  return { right: make(false), left: make(true), w, h };
}

function loadSprites() {
  const jobs = [];
  for (const [charKey, def] of Object.entries(SPRITE_DEFS)) {
    SPRITE_CACHE[charKey] = {};
    if (def.inline) {                       /* built from pixel maps, no fetch */
      for (const frameKey of Object.keys(def.frames))
        SPRITE_CACHE[charKey][frameKey] = buildFallbackSprite(charKey, frameKey);
      continue;
    }
    for (const [frameKey, file] of Object.entries(def.frames)) {
      jobs.push(new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth, h = img.naturalHeight;
          const make = flip => {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const g = c.getContext('2d');
            if (flip) { g.translate(w, 0); g.scale(-1, 1); }
            g.drawImage(img, 0, 0);
            return c;
          };
          const a = make(false), b = make(true);
          const k = def.scale || 1;                 /* native-res art: world
                                                       dims shrink, source
                                                       stays full detail */
          const entry = { w: def.scale ? w * k : w, h: def.scale ? h * k : h,
                          smooth: !!def.scale };    /* exact fractions → 1:1 */
          if (def.facesLeft) { entry.right = b; entry.left = a; }
          else { entry.right = a; entry.left = b; }
          SPRITE_CACHE[charKey][frameKey] = entry;
          resolve();
        };
        img.onerror = () => {
          SPRITE_CACHE[charKey][frameKey] = buildFallbackSprite(charKey, frameKey);
          resolve();
        };
        img.src = `assets/${file}.png?v=${ASSET_V}`;
      }));
    }
  }
  return Promise.all(jobs);
}

/* ----------------------------------------------------------------- physics */

function newPlayerState(x) {
  return { x, y: GROUND, vx: 0, vy: 0, grounded: true, facing: 1,
           jumping: false, holdG: 0.125, fallG: 0.4375, pMeter: 0, dash: 0,
           sprintJump: false, spinJump: false, coyoteTimer: 0, jumpBuffer: 0,
           floating: false, freeze: 0, tumble: 0, flapAnim: 0,
           jumpsUsed: 0, airFlip: 0, chainStage: 0, chainTimer: 0,
           lastChainStage: 0, takeoffX: x, takeoffY: GROUND };
}

function hitboxH(charKey, st) {
  if (charKey === 'sonic' && st.jumping) return 30;      // rolled up
  const spr = SPRITE_CACHE[charKey] && SPRITE_CACHE[charKey].idle;
  return spr ? spr.h : 24;
}

/* One 60 Hz step. `input` = { dir: -1|0|1, run, jumpHeld, jumpPressed }.
   Update order per the games: control → move → gravity (position is updated
   with the OLD velocity, then gravity is subtracted — as in the diagram). */
function stepPhysics(st, charKey, P, input) {
  const ev = { jumped: false, landed: false, assist: null };
  const C = CHARS[charKey];

  /* assist timers */
  if (st.jumpBuffer > 0) st.jumpBuffer--;
  if (!st.grounded && st.coyoteTimer > 0) st.coyoteTimer--;

  /* Ori's chain window ticks down on the ground; expiry resets the chain */
  if (charKey === 'ori' && st.grounded && st.chainTimer > 0) {
    st.chainTimer--;
    if (st.chainTimer === 0) st.chainStage = 0;
  }

  /* jump start — directly, via a buffered early press, or via coyote time */
  const buffered = ASSISTS.buffer && st.grounded && st.jumpBuffer > 0;
  const coyote = ASSISTS.coyote && !st.grounded && !st.jumping &&
                 st.coyoteTimer > 0 && input.jumpPressed;
  if ((st.grounded && (input.jumpPressed || buffered)) || coyote) {
    ev.assist = coyote ? 'coyote time!'
      : (buffered && !input.jumpPressed ? 'buffered!' : null);
    st.jumpBuffer = 0; st.coyoteTimer = 0;
    st.takeoffX = st.x; st.takeoffY = st.y;
    if (charKey === 'mario') {
      const t = C.tiers.find(t => Math.abs(st.vx) >= t.min);
      st.vy = -t.vy * (P.jumpForce / 4.0);
      st.holdG = t.hold * (P.holdGravity / 0.125);
      st.fallG = t.fall * (P.releaseGravity / 0.4375);
    } else if (charKey === 'smw') {
      st.vy = -smwJumpForce(P, Math.abs(st.vx));
      st.holdG = P.holdGravity;
      st.fallG = P.releaseGravity;
      st.sprintJump = Math.abs(st.vx) >= P.maxRun + 0.05;
    } else {
      st.vy = -P.jumpForce;
      if (charKey === 'metroid') st.spinJump = Math.abs(st.vx) > 0.2;
      if (charKey === 'ori') {
        /* the ground chain: skip, hop, flip — heights 3 / 3.75 / 4.5 */
        const stage = st.chainTimer > 0 ? Math.min(2, st.chainStage) : 0;
        st.vy = -P.jumpForce * Math.sqrt(C.chainRatios[stage]);
        st.lastChainStage = stage;                     /* skip / hop / flip pose */
        if (stage === 2) st.airFlip = 18;              /* the flip */
        st.chainStage = stage === 2 ? 0 : stage + 1;
        st.jumpsUsed = 1; st.holdG = P.holdGravity; st.fallG = P.releaseGravity;
      }
    }
    st.grounded = false; st.jumping = true; ev.jumped = true;
  } else if (charKey === 'ori' && input.jumpPressed && !st.grounded &&
             st.jumpsUsed < 1 + P.airJumps) {
    st.vy = -P.airJumpForce;             /* air jump — the triple-jump chain */
    st.jumpsUsed++;
    st.jumping = true;
    st.airFlip = 14;
    st.holdG = P.holdGravity; st.fallG = P.releaseGravity;
  } else if (charKey === 'kirby' && input.jumpPressed && !st.grounded) {
    st.floating = true;                  /* puff up — every press is a flap */
    st.vy = -P.flapImpulse;
    st.flapAnim = 12;                    /* play the flap animation once */
  } else if (ASSISTS.buffer && input.jumpPressed && !st.grounded) {
    st.jumpBuffer = BUFFER_FRAMES;       /* remember the early press */
  }

  /* Sonic's variable jump: checked BEFORE movement and gravity (SPG) */
  if (charKey === 'sonic' && st.jumping && !input.jumpHeld && st.vy < -P.releaseCap)
    st.vy = -P.releaseCap;

  /* Samus / Mega Man / X variable jump: release while rising → ascent ends */
  if ((charKey === 'metroid' || charKey === 'megaman' || charKey === 'megamanx') &&
      st.jumping && !input.jumpHeld && st.vy < 0)
    st.vy = 0;

  /* (Kirby has no jump cut — the first jump's height is fixed; variable
     height comes entirely from flaps and the float) */

  /* horizontal control */
  if (charKey === 'castlevania') {
    if (st.grounded) st.vx = input.dir * P.walkSpeed;
    /* airborne: vx locked — the committed jump */
  } else if (charKey === 'mario') {
    /* SMB picks one force from {0xE4 run, 0x98 walk, 0xD0 release} and
       DOUBLES it while facing != moving — that doubling is the skid
       (0x1A0 = 2×0xD0) and it applies to air turns as well. */
    if (input.dir !== 0) {
      const turning = st.vx !== 0 && Math.sign(st.vx) !== input.dir;
      if (turning) {
        let rate;
        if (st.grounded) rate = P.skidDecel;                       // 2 × 0xD0
        else rate = 2 * (Math.abs(st.vx) >= 1.5625 ? P.runAccel : P.walkAccel);
        const next = st.vx + input.dir * rate;
        /* the skid ends crossing zero: flip cleanly to min walk speed */
        st.vx = Math.sign(next) === input.dir ? input.dir * P.minWalk : next;
      } else {
        if (st.grounded && st.vx === 0) st.vx = input.dir * P.minWalk;
        const cap = !st.grounded || input.run ? P.maxRun : P.maxWalk;
        if (Math.abs(st.vx) > cap) {    /* over the cap (released B): ease back */
          st.vx = Math.sign(st.vx) * Math.max(cap, Math.abs(st.vx) - P.releaseDecel);
        } else {
          st.vx += input.dir * (st.grounded
            ? (input.run ? P.runAccel : P.walkAccel)
            : (Math.abs(st.vx) >= 1.5625 ? P.runAccel : P.walkAccel));
          if (Math.abs(st.vx) > cap) st.vx = Math.sign(st.vx) * cap;
        }
      }
    } else if (st.grounded && st.vx !== 0) {
      const d = P.releaseDecel;
      st.vx = Math.abs(st.vx) <= d ? 0 : st.vx - Math.sign(st.vx) * d;
    }
  } else if (charKey === 'smw') {
    /* P-meter: fills while grounded at run max with run held; holds in air */
    if (st.grounded) {
      if (input.run && input.dir !== 0 && Math.abs(st.vx) >= P.maxRun - 0.01)
        st.pMeter = Math.min(P.pMeterFull, st.pMeter + 1);
      else st.pMeter = Math.max(0, st.pMeter - 2);
    }
    if (input.dir !== 0) {
      const turning = st.vx !== 0 && Math.sign(st.vx) !== input.dir;
      if (turning) {
        st.vx += input.dir * (st.grounded ? P.skidDecel : P.accel);
      } else {
        const cap = input.run
          ? (st.pMeter >= P.pMeterFull ? P.maxSprint : P.maxRun)
          : P.maxWalk;
        if (st.grounded && Math.abs(st.vx) > cap) {
          st.vx = Math.sign(st.vx) * Math.max(cap, Math.abs(st.vx) - P.releaseDecel);
        } else {
          st.vx += input.dir * P.accel;
          const hardCap = st.grounded ? cap : P.maxSprint;
          if (Math.abs(st.vx) > hardCap) st.vx = Math.sign(st.vx) * hardCap;
        }
      }
    } else if (st.grounded && st.vx !== 0) {
      const d = P.releaseDecel;
      st.vx = Math.abs(st.vx) <= d ? 0 : st.vx - Math.sign(st.vx) * d;
    }
  } else if (charKey === 'metroid') {
    /* dash builds +dashAccel per frame while held on the ground; released → 0 */
    if (st.grounded) {
      if (input.run && input.dir !== 0)
        st.dash = Math.min(P.dashMax, st.dash + P.dashAccel);
      else st.dash = 0;
    }
    if (input.dir !== 0) {
      const turning = st.vx !== 0 && Math.sign(st.vx) !== input.dir;
      if (st.grounded) {
        st.vx += input.dir * (turning ? P.accel * 2 : P.accel);
        const cap = P.walkSpeed + (input.run ? st.dash : 0);
        if (Math.abs(st.vx) > cap)
          st.vx = Math.sign(st.vx) * Math.max(cap, Math.abs(st.vx) - P.accel);
      } else if (turning) {
        st.vx += input.dir * P.airAccel;
      } else if (Math.abs(st.vx) < P.airCap) {
        st.vx = Math.min(P.airCap, Math.abs(st.vx) + P.airAccel) * input.dir;
      } /* above the cap: ground momentum is kept, no air gain */
    } else if (st.grounded && st.vx !== 0) {
      st.vx = Math.abs(st.vx) <= P.accel ? 0 : st.vx - Math.sign(st.vx) * P.accel;
    }
  } else if (charKey === 'ori') {
    if (input.dir !== 0) {
      const turning = st.vx !== 0 && Math.sign(st.vx) !== input.dir;
      st.vx += input.dir * P.accel * (turning ? 2 : 1);
      if (Math.abs(st.vx) > P.topSpeed) st.vx = Math.sign(st.vx) * P.topSpeed;
    } else if (st.vx !== 0) {            /* source decelerates in air too */
      const f = P.friction;
      st.vx = Math.abs(st.vx) <= f ? 0 : st.vx - Math.sign(st.vx) * f;
    }
  } else if (charKey === 'kirby') {
    const cap = (!st.grounded && st.floating) ? P.floatSpeed
              : (input.run ? P.runSpeed : P.walkSpeed);
    st.vx = input.dir * cap;
  } else if (charKey === 'megaman') {
    /* purely digital: full speed or nothing, ground and air alike */
    st.vx = input.dir * P.walkSpeed;
  } else if (charKey === 'megamanx') {
    if (input.dir !== 0) {
      if (st.grounded) {
        st.vx = input.dir * (input.run ? P.dashSpeed : P.walkSpeed);
      } else {
        /* a dash-jump keeps its speed while you hold the same direction */
        const keep = Math.abs(st.vx) > P.walkSpeed && Math.sign(st.vx) === input.dir;
        st.vx = input.dir * (keep ? Math.abs(st.vx) : P.walkSpeed);
      }
    } else {
      st.vx = 0;                       /* instant stop, even mid-air */
    }
  } else { /* sonic */
    if (input.dir !== 0) {
      if (st.grounded && st.vx !== 0 && Math.sign(st.vx) !== input.dir) {
        st.vx += input.dir * P.decel;                       // braking, 0.5
      } else if (Math.abs(st.vx) < P.topSpeed || Math.sign(st.vx) !== input.dir) {
        st.vx += input.dir * P.accel * (st.grounded ? 1 : 2);
        if (Math.abs(st.vx) > P.topSpeed) st.vx = Math.sign(st.vx) * P.topSpeed;
      }
    } else if (st.grounded && st.vx !== 0) {
      const f = P.friction;
      st.vx = Math.abs(st.vx) <= f ? 0 : st.vx - Math.sign(st.vx) * f;
    }
  }
  if (input.dir !== 0 && (st.grounded || charKey !== 'castlevania')) st.facing = input.dir;

  /* refresh gravity selection while grounded (for walking off ledges) */
  if (charKey === 'mario' && st.grounded) {
    const t = C.tiers.find(t => Math.abs(st.vx) >= t.min);
    st.holdG = t.hold * (P.holdGravity / 0.125);
    st.fallG = t.fall * (P.releaseGravity / 0.4375);
  } else if (charKey === 'smw' && st.grounded) {
    st.holdG = P.holdGravity;
    st.fallG = P.releaseGravity;
  }

  /* movement + collision. Sonic 1 quirk: jumping exits the movement cycle,
     so the player does not move on the frame the jump starts. */
  const skipMove = charKey === 'sonic' && ev.jumped;
  if (!skipMove) {
    const hw = C.hitboxW / 2, hh = hitboxH(charKey, st);

    st.x += st.vx;
    for (const b of BLOCKS) {
      if (st.x + hw > b.x && st.x - hw < b.x + b.w && st.y > b.y && st.y - hh < b.y + b.h) {
        st.x = st.vx > 0 ? b.x - hw : b.x + b.w + hw;
        st.vx = 0;
      }
    }
    /* no walls — wrap around the screen */
    if (st.x >= W) st.x -= W;
    else if (st.x < 0) st.x += W;

    const prevY = st.y;
    st.y += st.vy;
    /* no ceiling — overshoot the top and gravity brings you back */
    let onGround = false;
    if (st.vy >= 0) {
      if (st.y >= GROUND) { st.y = GROUND; onGround = true; }
      for (const b of BLOCKS) {
        if (st.x + hw > b.x && st.x - hw < b.x + b.w && prevY <= b.y && st.y >= b.y) {
          st.y = b.y; onGround = true;
        }
      }
    } else {
      for (const b of BLOCKS) {
        const bottom = b.y + b.h;
        if (st.x + hw > b.x && st.x - hw < b.x + b.w &&
            prevY - hh >= bottom && st.y - hh < bottom) {
          st.y = bottom + hh; st.vy = 0;   /* head bonk */
        }
      }
    }

    if (onGround) {
      if (!st.grounded) ev.landed = true;
      if (!st.grounded && charKey === 'ori') st.chainTimer = P.chainWindow;
      st.grounded = true; st.vy = 0; st.jumping = false; st.floating = false;
      st.jumpsUsed = 0;
    } else if (st.grounded) {
      st.grounded = false;               /* walked off a ledge */
      st.coyoteTimer = COYOTE_FRAMES;
    }
  }

  /* gravity — applied AFTER the position update, like the diagram says */
  if (!st.grounded && !skipMove) {
    if (charKey === 'mario' || charKey === 'smw' || charKey === 'ori') {
      st.vy += (st.vy < 0 && input.jumpHeld) ? st.holdG : st.fallG;
      if (st.vy > P.terminal) st.vy = P.terminal;
      if (st.airFlip > 0) st.airFlip--;
    } else if (charKey === 'kirby') {
      if (st.floating) {
        st.vy += P.floatGravity;         /* puffed: parachute drift */
        if (st.vy > P.floatTerminal) st.vy = P.floatTerminal;
      } else {
        /* asymmetric: burst up under high gravity, drift down under low */
        if (st.vy < 0) {
          st.vy += P.riseGravity;
          if (st.vy >= 0) st.tumble = 12;    /* the apex flip */
        } else {
          st.vy += P.fallGravity;
        }
        if (st.vy > P.terminal) st.vy = P.terminal;
      }
      if (st.tumble > 0) st.tumble--;
      if (st.flapAnim > 0) st.flapAnim--;
    } else if (charKey !== 'sonic') {   /* plain gravity + terminal cap */
      st.vy += P.gravity;
      if (st.vy > P.terminal) st.vy = P.terminal;
    } else { /* sonic — no fall speed cap in Sonic 1 */
      st.vy += P.gravity;
      if (st.vy < 0 && st.vy > -4)       /* air drag, after gravity (SPG) */
        st.vx -= Math.trunc(st.vx / 0.125) / 256;
    }
  }
  return ev;
}

/* Predict the arc if the player jumped right now (holding, or tapping). */
function predictArc(charKey, P, from, holdFrames, run) {
  const st = { ...from };
  const dir = st.vx === 0 ? 0 : Math.sign(st.vx);
  const pts = [];
  stepPhysics(st, charKey, P, { dir, run, jumpHeld: true, jumpPressed: true });
  pts.push({ x: st.x, y: st.y });
  for (let f = 1; f < 300 && !st.grounded; f++) {
    stepPhysics(st, charKey, P, { dir, run, jumpHeld: f < holdFrames, jumpPressed: false });
    pts.push({ x: st.x, y: st.y });
  }
  return pts;
}

/* -------------------------------------------------------------------- state */

let charKey = 'castlevania';
let P = { ...CHARS.castlevania.defaults };    // live (slider-tweaked) physics
let player = newPlayerState(70);

let arc = [];          // recorded points of the jump in progress
let lastArc = [];      // the previous complete jump, kept on screen
let ghosts = [];       // faded sprite snapshots
let assistFlashes = []; // floating "coyote time!"/"buffered!" labels
let jumpStart = null;
let airFrames = 0;
let takeoffFlash = 0;
let animClock = 0;
let slowmo = false;
let phase = 0;         // 0 grounded · 1 press · 2 rising · 3 peak/fall

const keys = {};
let jumpQueued = false;

/* ---- auto demo: run, full-hold jump, admire the stats, next character ---- */

const DEMO_JUMP_X = { castlevania: 180, mario: 150, smw: 160, sonic: 170,
                      metroid: 165, megaman: 180, megamanx: 165, kirby: 170,
                      ori: 130 };
const demo = { phase: 'off', timer: 0, pinned: false, flutterDone: false };

function startDemo() {
  player = newPlayerState(70);
  arc = []; lastArc = []; ghosts = [];
  demo.phase = 'wait'; demo.timer = 30; demo.flutterDone = false;
  demo.chainCount = 0;
}

function stopDemo() { demo.phase = 'off'; }

function demoInput() {
  const idle = { dir: 0, run: false, jumpHeld: false, jumpPressed: false };
  const move = { dir: 1, run: charKey !== 'castlevania' && charKey !== 'sonic', jumpHeld: false, jumpPressed: false };
  switch (demo.phase) {
    case 'wait':
      if (--demo.timer <= 0) demo.phase = 'run';
      return idle;
    case 'run':
      if (player.grounded && player.x >= DEMO_JUMP_X[charKey]) {
        demo.phase = 'air';
        demo.timer = 0;
        return { ...move, jumpHeld: true, jumpPressed: true };
      }
      return move;
    case 'air': {
      if (player.grounded) {
        if (charKey === 'kirby' && !demo.flutterDone) {
          /* Kirby's showcase, act two: jump again and spam flaps to flutter */
          demo.flutterDone = true;
          demo.timer = 0;
          return { ...move, jumpHeld: true, jumpPressed: true };
        }
        if (charKey === 'ori' && (demo.chainCount || 0) < 2) {
          /* Ori's showcase: chain the landing into the next jump — skip,
             hop, flip */
          demo.chainCount = (demo.chainCount || 0) + 1;
          demo.timer = 0;
          return { ...move, jumpHeld: true, jumpPressed: true };
        }
        demo.phase = 'admire'; demo.timer = 100; return idle;
      }
      demo.timer++;
      const flap = charKey === 'kirby' && demo.flutterDone &&
                   demo.timer > 10 && demo.timer < 150 && player.vy > 0.4;
      return { ...move, jumpHeld: true, jumpPressed: flap };
    }
    case 'admire':
      if (--demo.timer <= 0) {
        if (demo.pinned) startDemo();    /* loop the chosen character */
        else selectChar(CHAR_ORDER[(CHAR_ORDER.indexOf(charKey) + 1) % CHAR_ORDER.length], true);
      }
      return idle;
  }
  return idle;
}

/* --------------------------------------------------------------------- DOM */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const el = id => document.getElementById(id);
const phaseCards = [...document.querySelectorAll('.phase-card')];

function buildTabs() {
  const nav = el('char-tabs');
  CHAR_ORDER.forEach((key, i) => {
    const c = CHARS[key];
    const btn = document.createElement('button');
    btn.className = 'char-tab';
    btn.dataset.char = key;
    const num = document.createElement('span');
    num.className = 'tab-key';
    num.textContent = i + 1;
    btn.append(num);
    const spr = SPRITE_CACHE[key].idle;
    if (spr) {
      const icon = document.createElement('canvas');
      icon.width = spr.w; icon.height = spr.h;
      icon.style.width = spr.w * (26 / spr.h) + 'px';
      icon.style.height = '26px';
      icon.style.imageRendering = 'pixelated';
      icon.getContext('2d').drawImage(spr.right, 0, 0);
      btn.append(icon);
    }
    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = c.game;
    btn.append(label);
    btn.title = c.game;
    btn.setAttribute('aria-label', c.game);
    btn.addEventListener('click', () => selectChar(key));
    nav.append(btn);
  });
}

function selectChar(key, viaDemo) {
  charKey = key;
  P = { ...CHARS[key].defaults };
  const x = player.x;
  player = newPlayerState(x);
  arc = []; lastArc = []; ghosts = []; jumpStart = null;
  el('stat-apex').textContent = el('stat-air').textContent = el('stat-range').textContent = '—';
  document.documentElement.style.setProperty('--accent', CHARS[key].accent);
  document.querySelectorAll('.char-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.char === key));
  el('explainer').innerHTML = CHARS[key].explainer;
  el('pseudocode').innerHTML = CHARS[key].pseudocode;
  buildSliders();
  const t = el('toggle-demo');
  if (t && t.checked) {
    if (!viaDemo) demo.pinned = true;       // hand-picked: loop this character
    startDemo();
  }
}

function buildSliders() {
  const box = el('sliders');
  box.innerHTML = '';
  for (const s of CHARS[charKey].sliders) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    const label = document.createElement('label');
    const name = document.createElement('b');
    name.textContent = s.label;
    const val = document.createElement('span');
    val.className = 'val';
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: s.min, max: s.max, step: s.step, value: P[s.key] });
    const show = () => val.textContent = (+P[s.key]).toFixed(s.step < 0.01 ? 3 : s.step < 0.1 ? 2 : 1);
    input.addEventListener('input', () => { P[s.key] = +input.value; show(); });
    show();
    label.append(name, val);
    row.append(label, input);
    box.append(row);
  }
}

el('reset-btn').addEventListener('click', () => { P = { ...CHARS[charKey].defaults }; buildSliders(); });

el('toggle-demo').addEventListener('change', e => {
  if (e.target.checked) { demo.pinned = false; startDemo(); }  /* fresh cycle */
  else stopDemo();
});

el('toggle-coyote').addEventListener('change', e => { ASSISTS.coyote = e.target.checked; });
el('toggle-buffer').addEventListener('change', e => { ASSISTS.buffer = e.target.checked; });

const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ']);
addEventListener('keydown', e => {
  if (GAME_KEYS.has(e.key)) e.preventDefault();
  if (e.repeat) return;
  keys[e.key.toLowerCase()] = true;
  const k = e.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'a', 'd', 'w', 'z', ' '].includes(k)) {
    const t = el('toggle-demo');               // manual input takes control back
    if (t && t.checked) { t.checked = false; stopDemo(); }
  }
  if (e.key === ' ' || e.key.toLowerCase() === 'z' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w')
    jumpQueued = true;
  if (e.key.toLowerCase() === 's') { slowmo = !slowmo; el('slowmo-badge').classList.toggle('on', slowmo); }
  if (e.key.toLowerCase() === 'r') { player = newPlayerState(70); arc = []; lastArc = []; ghosts = []; }
  if (e.key === '1') selectChar('castlevania');
  if (e.key === '2') selectChar('mario');
  if (e.key === '3') selectChar('smw');
  if (e.key === '4') selectChar('sonic');
  if (e.key === '5') selectChar('metroid');
  if (e.key === '6') selectChar('megaman');
  if (e.key === '7') selectChar('megamanx');
  if (e.key === '8') selectChar('kirby');
  if (e.key === '9') selectChar('ori');
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

/* drop stale input when the tab is hidden — the game loop pauses with rAF */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { for (const k in keys) keys[k] = false; jumpQueued = false; }
});

/* ---- touch controls (CSS reveals them on coarse-pointer / touch devices) */
document.addEventListener('touchstart', () => {
  document.documentElement.classList.add('touch');
}, { once: true, passive: true });

function bindTouchButton(id, onDown, onUp) {
  const btn = document.getElementById(id);
  const down = e => {
    e.preventDefault();
    btn.classList.add('held');
    const demo = el('toggle-demo');                 /* manual input takes over */
    if (demo && demo.checked) { demo.checked = false; stopDemo(); }
    onDown();
  };
  const up = e => {
    if (e && e.cancelable) e.preventDefault();
    btn.classList.remove('held');
    onUp();
  };
  btn.addEventListener('touchstart', down, { passive: false });
  btn.addEventListener('touchend', up, { passive: false });
  btn.addEventListener('touchcancel', up, { passive: false });
  btn.addEventListener('mousedown', down);
  btn.addEventListener('mouseup', up);
  btn.addEventListener('mouseleave', () => up());
}

bindTouchButton('tc-left',  () => { keys['arrowleft'] = true; },  () => { keys['arrowleft'] = false; });
bindTouchButton('tc-right', () => { keys['arrowright'] = true; }, () => { keys['arrowright'] = false; });
bindTouchButton('tc-run',   () => { keys['shift'] = true; },      () => { keys['shift'] = false; });
bindTouchButton('tc-jump',  () => { keys[' '] = true; jumpQueued = true; },
                            () => { keys[' '] = false; });

/* portrait hint: offer fullscreen landscape where the platform allows it */
if (el('rotate-go')) {
  el('rotate-go').addEventListener('click', async () => {
    try {
      await document.documentElement.requestFullscreen();
      if (screen.orientation && screen.orientation.lock)
        await screen.orientation.lock('landscape');
    } catch (e) { /* iOS Safari has no orientation lock — rotating by hand works */ }
    el('rotate-hint').style.display = 'none';
  });
  el('rotate-close').addEventListener('click', () => {
    el('rotate-hint').style.display = 'none';
  });
}

function readInput() {
  const left = keys['arrowleft'] || keys['a'];
  const right = keys['arrowright'] || keys['d'];
  const jumpHeld = keys[' '] || keys['z'] || keys['arrowup'] || keys['w'];
  const run = !!keys['shift'];
  const jumpPressed = jumpQueued;
  jumpQueued = false;
  return { dir: (right ? 1 : 0) - (left ? 1 : 0), run, jumpHeld, jumpPressed };
}

/* -------------------------------------------------------------- simulation */

function tick() {
  const demoOn = demo.phase !== 'off' && el('toggle-demo').checked;
  const input = demoOn ? demoInput() : readInput();
  const ev = stepPhysics(player, charKey, P, input);

  if (ev.jumped) {
    lastArc = [];
    arc = [{ x: player.takeoffX, y: player.takeoffY }, { x: player.x, y: player.y }];
    ghosts = [];
    jumpStart = { x: player.takeoffX, y: player.takeoffY };
    airFrames = 1;
    takeoffFlash = 14;
    if (ev.assist)
      assistFlashes.push({ text: ev.assist, x: player.takeoffX,
                           y: player.takeoffY - hitboxH(charKey, player) - 6, t: 55 });
  }
  for (const f of assistFlashes) f.t--;
  assistFlashes = assistFlashes.filter(f => f.t > 0);

  if (player.jumping) {
    arc.push({ x: player.x, y: player.y });
    airFrames++;
    if (airFrames % 2 === 0)
      ghosts.push({ x: player.x, y: player.y, facing: player.facing,
                    frame: spriteFrameKey(), alpha: 0.32 });
  }
  for (const g of ghosts) g.alpha -= 0.0022;
  ghosts = ghosts.filter(g => g.alpha > 0.02);

  if (ev.landed && arc.length > 1) {
    lastArc = arc; arc = [];
    const apex = jumpStart.y - Math.min(...lastArc.map(p => p.y));
    el('stat-apex').textContent = `${apex.toFixed(0)} px · ${(apex / TILE).toFixed(1)} tiles`;
    el('stat-air').textContent = `${airFrames} frames · ${(airFrames / 60).toFixed(2)} s`;
    let dx = player.x - jumpStart.x;               // account for screen wrap
    if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
    el('stat-range').textContent = `${Math.abs(dx).toFixed(0)} px`;
  }

  if (takeoffFlash > 0) takeoffFlash--;
  const newPhase = player.grounded ? 0
    : takeoffFlash > 0 ? 1
    : player.vy < -0.4 ? 2 : 3;
  if (newPhase !== phase) {
    phase = newPhase;
    phaseCards.forEach(c => c.classList.toggle('active', +c.dataset.phase === phase));
  }

  animClock++;
}

const MARIO_WALK = ['run1', 'run2', 'run3'];
const SONIC_WALK = ['walk1', 'walk2', 'walk3', 'walk4', 'walk5', 'walk6'];
const SONIC_RUN = ['frun1', 'frun2', 'frun3', 'frun4'];
const SONIC_BALL = ['ball1', 'ball2', 'ball3', 'ball4'];

function spriteFrameKey() {
  const speed = Math.abs(player.vx);
  if (!player.grounded) {
    if (charKey === 'sonic' && player.jumping) {
      const d = Math.max(1, Math.floor(4 - Math.min(speed, 3)));   // SPG spin timing
      return SONIC_BALL[Math.floor(animClock / d) % 4];
    }
    if (charKey === 'smw')
      return player.vy < 0 ? (player.sprintJump ? 'runjump' : 'jump') : 'fall';
    if (charKey === 'metroid') {
      if (player.jumping && player.spinJump)
        return 'spin' + ((Math.floor(animClock / 3) % 8) + 1);
      return player.vy < 0 ? 'jump' : 'fall';
    }
    if (charKey === 'megaman') return 'jump';       // one air pose, rise & fall
    if (charKey === 'megamanx') return player.vy < 0 ? 'jump' : 'fall';
    if (charKey === 'ori') {
      if (player.airFlip > 0) return 'flip';        // third jump / air jump
      if (player.vy < 0)
        return ['skip', 'hop', 'flip'][player.lastChainStage || 0];
      return 'fall';
    }
    if (charKey === 'kirby') {
      if (player.floating) {
        if (player.flapAnim > 0)         /* one flap cycle per press */
          return 'puff' + (Math.min(3, Math.floor((12 - player.flapAnim) / 3)) + 1);
        return 'puff' + ((Math.floor(animClock / 16) % 2) + 1);   /* gentle bob */
      }
      if (player.vy < 0) return 'jump';
      if (player.tumble > 0)             /* single somersault at the apex */
        return 'tumble' + (Math.min(2, Math.floor((12 - player.tumble) / 4)) + 1);
      return 'fall';
    }
    return player.jumping ? 'jump' : 'idle';
  }
  if (speed > 0.05) {
    if (charKey === 'metroid') {
      const d = Math.max(2, Math.round(5 - speed * 0.6));
      return 'run' + ((Math.floor(animClock / d) % 10) + 1);
    }
    if (charKey === 'megaman')
      return 'run' + ((Math.floor(animClock / 6) % 3) + 1);
    if (charKey === 'kirby') {
      const d = Math.max(3, Math.round(8 - speed * 2));
      return 'walk' + ((Math.floor(animClock / d) % 3) + 1);
    }
    if (charKey === 'ori')            /* full 13-frame cycle, 60 fps */
      return 'run' + ((animClock % 13) + 1);
    if (charKey === 'megamanx') {
      if (speed > CHARS.megamanx.defaults.walkSpeed + 0.05) return 'dash';
      return 'run' + ((Math.floor(animClock / 4) % 10) + 1);
    }
    if (charKey === 'sonic') {
      const d = Math.max(1, Math.floor(8 - speed));                // SPG walk timing
      const cyc = speed >= 6 ? SONIC_RUN : SONIC_WALK;
      return cyc[Math.floor(animClock / d) % cyc.length];
    }
    if (charKey === 'smw') {
      const d = Math.max(2, Math.round(9 - speed * 2));
      const cyc = speed > 2.4 ? ['run1', 'run2'] : ['walk1', 'walk2'];
      return cyc[Math.floor(animClock / d) % 2];
    }
    if (charKey === 'mario') {
      const d = Math.max(2, Math.round(10 - speed * 2.5));
      return MARIO_WALK[Math.floor(animClock / d) % 3];
    }
    return MARIO_WALK[Math.floor(animClock / 8) % 3];              // simon
  }
  return 'idle';
}

/* --------------------------------------------------------------- rendering */

function drawArc(pts, color, width, dash) {
  if (pts.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  let prev = null;
  for (const p of pts) {
    /* break the line where the path wraps around the screen edge */
    if (!prev || Math.abs(p.x - prev.x) > W / 2) ctx.moveTo(S(p.x), S(p.y - 1));
    else ctx.lineTo(S(p.x), S(p.y - 1));
    prev = p;
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawSprite(frameKey, x, y, facing, alpha) {
  const spr = SPRITE_CACHE[charKey][frameKey];
  if (!spr) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = CHARS[charKey].accent;
    ctx.fillRect(S(x) - S(6), S(y) - S(24), S(12), S(24));
    ctx.globalAlpha = 1;
    return;
  }
  ctx.globalAlpha = alpha;
  if (spr.smooth) {                    /* native-res art: downsample cleanly */
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  const img = facing < 0 ? spr.left : spr.right;
  const draw = wx => ctx.drawImage(img,
    S(wx) - S(spr.w) / 2, S(y) - S(spr.h), S(spr.w), S(spr.h));
  draw(x);
  /* wrap copies while crossing the screen edge */
  if (x < spr.w) draw(x + W);
  if (x > W - spr.w) draw(x - W);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
}

function render() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  /* ground + soil */
  ctx.fillStyle = '#efe9da';
  ctx.fillRect(0, S(GROUND), VIEW_W, VIEW_H - S(GROUND));
  ctx.strokeStyle = '#2b2019';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, S(GROUND)); ctx.lineTo(VIEW_W, S(GROUND)); ctx.stroke();

  /* left wall first, so ruler lines and labels draw over it */
  for (const b of BLOCKS) {
    if (!b.wall) continue;
    ctx.fillStyle = '#e7dfcc';
    ctx.fillRect(S(b.x), S(b.y), S(b.w), S(b.h));
    ctx.strokeStyle = '#c4b498';
    ctx.lineWidth = 2;
    ctx.strokeRect(S(b.x), S(b.y), S(b.w), S(b.h));
  }

  /* height ruler */
  ctx.font = '12px Georgia';
  ctx.textAlign = 'left';
  for (let t = 1; t <= 9; t++) {
    const y = S(GROUND - t * TILE);
    ctx.strokeStyle = t % 2 ? '#eee7d6' : '#e0d7c2';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VIEW_W, y); ctx.stroke();
    if (t % 2 === 0) { ctx.fillStyle = '#b0a48e'; ctx.fillText(`${t} tiles`, 6, y - 4); }
  }

  /* blocks */
  for (const b of BLOCKS) {
    if (b.wall) continue;
    ctx.fillStyle = '#f0ead9';
    ctx.fillRect(S(b.x), S(b.y), S(b.w), S(b.h));
    ctx.strokeStyle = '#b8a888';
    ctx.lineWidth = 2;
    ctx.strokeRect(S(b.x), S(b.y), S(b.w), S(b.h));
    for (let ty = b.y + TILE; ty < b.y + b.h; ty += TILE) {
      ctx.beginPath(); ctx.moveTo(S(b.x), S(ty)); ctx.lineTo(S(b.x + b.w), S(ty)); ctx.stroke();
    }
    if (b.h >= TILE && b.w >= 24) {
      ctx.fillStyle = '#8a7b6a';
      ctx.textAlign = 'center';
      ctx.fillText(`${b.h / TILE} tiles`, S(b.x + b.w / 2), S(b.y) + 15);
      ctx.textAlign = 'left';
    }
  }

  /* predicted arcs (when grounded) */
  if (el('toggle-predict').checked && player.grounded) {
    const run = !!keys['shift'];
    const hold = predictArc(charKey, P, player, 999, run);
    const variable = charKey !== 'castlevania';
    drawArc(hold, 'rgba(181,67,42,0.30)', 3, [2, 9]);
    if (variable) {
      const tap = predictArc(charKey, P, player, 5, run);
      drawArc(tap, 'rgba(36,86,224,0.30)', 3, [2, 9]);
      const top = hold.reduce((m, p) => p.y < m.y ? p : m);
      ctx.font = 'italic 13px Georgia';
      ctx.fillStyle = 'rgba(181,67,42,0.55)';
      ctx.fillText('hold', S(top.x) + 8, S(top.y) - 6);
      const tapTop = tap.reduce((m, p) => p.y < m.y ? p : m);
      ctx.fillStyle = 'rgba(36,86,224,0.55)';
      ctx.fillText('tap', S(tapTop.x) + 8, S(tapTop.y) - 6);
    }
  }

  /* the dashed red arc — the star of the diagram */
  if (el('toggle-arc').checked) {
    const pts = arc.length > 1 ? arc : lastArc;
    drawArc(pts, '#b5432a', 4, [9, 8]);
    if (pts.length > 2) {
      const apex = pts.reduce((m, p) => p.y < m.y ? p : m);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#b5432a';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(S(apex.x), S(apex.y - 1), 6, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }

  /* ghosts */
  if (el('toggle-ghosts').checked)
    for (const g of ghosts) drawSprite(g.frame, g.x, g.y, g.facing, g.alpha);

  drawSprite(spriteFrameKey(), player.x, player.y, player.facing, 1);

  /* assist labels float up and fade */
  ctx.font = 'italic 15px Georgia';
  ctx.textAlign = 'center';
  for (const f of assistFlashes) {
    ctx.globalAlpha = Math.min(1, f.t / 25);
    ctx.fillStyle = CHARS[charKey].accent;
    ctx.fillText(f.text, S(f.x), S(f.y) - (55 - f.t) * 0.6);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  drawHUD();
}

function drawHUD() {
  const cx = VIEW_W - 150, held = keys[' '] || keys['z'] || keys['arrowup'] || keys['w'];
  const vyUp = -player.vy;                       // display convention: up is positive
  const val = Math.round(vyUp * 10);             // ×10, like the diagram's 40 / 2 units

  ctx.textAlign = 'center';
  ctx.fillStyle = '#2b2019';
  ctx.font = '22px Georgia';
  ctx.fillText('Y Velocity:', cx, 44);
  ctx.font = 'bold 40px Georgia';
  ctx.fillStyle = player.grounded || val === 0 ? '#2b2019' : (val > 0 ? '#2e8b3a' : '#c03028');
  ctx.fillText(val, cx, 86);
  ctx.font = '11px Georgia';
  ctx.fillStyle = '#8a7b6a';
  ctx.fillText('(px/frame × 10)', cx, 103);

  /* velocity arrow, like the green/red arrow in the diagram */
  const ax = cx - 88, base = 78, len = Math.min(Math.abs(vyUp) * 9, 64);
  if (len > 2) {
    const up = vyUp > 0;
    ctx.fillStyle = up ? '#2e8b3a' : '#c03028';
    const dir = up ? -1 : 1;
    ctx.fillRect(ax - 5, up ? base - len : base, 10, len);
    ctx.beginPath();
    ctx.moveTo(ax - 12, base + dir * len);
    ctx.lineTo(ax + 12, base + dir * len);
    ctx.lineTo(ax, base + dir * (len + 14));
    ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = '#c8bfa8';
    ctx.fillRect(ax - 10, base - 2, 20, 4);
  }

  /* the A button */
  const by = 140;
  ctx.beginPath(); ctx.arc(cx, by + (held ? 2 : 0), 17, 0, Math.PI * 2);
  ctx.fillStyle = held ? '#4a4440' : '#8d8680'; ctx.fill();
  ctx.strokeStyle = '#5c554e'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#f2ede4';
  ctx.font = 'bold 17px Georgia';
  ctx.fillText('A', cx, by + 6 + (held ? 2 : 0));
  ctx.font = '11px Georgia';
  ctx.fillStyle = '#8a7b6a';
  ctx.fillText(held ? 'jump held' : 'jump', cx, by + 34);
  ctx.textAlign = 'left';
}

/* ---------------------------------------------------------------- main loop */

let last = performance.now(), acc = 0;
function frame(now) {
  acc += (now - last) * (slowmo ? 0.25 : 1);
  last = now;
  acc = Math.min(acc, STEP_MS * 8);
  while (acc >= STEP_MS) { tick(); acc -= STEP_MS; }
  render();
  requestAnimationFrame(frame);
}

loadSprites().then(() => {
  buildTabs();
  selectChar('castlevania', true);
  last = performance.now();
  requestAnimationFrame(frame);
});
