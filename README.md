# The Basics of Jumping — interactive edition

An interactive recreation of Celia Wagar's animated diagram about jump physics
([critpoints.net](https://critpoints.net)), extended to compare three classic
jump models side by side.

## Run it

Any static server works — no build step:

```
python -m http.server 8123
# then open http://localhost:8123
```

(Or just open `index.html` directly in a browser.)

## Controls

| Key | Action |
| --- | --- |
| `←` `→` / `A` `D` | move |
| `Space` / `Z` / `↑` | jump — **hold** it, release timing matters |
| `S` | slow-motion (¼×) |
| `R` | reset position |
| `1` `2` `3` | switch character |

## The three jump models

All three share the diagram's core loop — position is moved by Y velocity,
*then* gravity is subtracted from Y velocity (that update order matters and is
what the original games do) — and differ in what happens around the button:

- **Castlevania (Simon)** — the base "Castlevania / Donkey Kong jump".
  One force, one gravity, and a fully *committed* arc: no air control, no
  variable height. X velocity is locked at takeoff. Walk speed is exactly
  1 px/frame.
- **Super Mario Bros. (Mario)** — variable height by *switching gravity*:
  weak gravity while the button is held and Mario is rising, ~3.5× once
  released (or past the peak). The jump table is speed-indexed (see accuracy
  notes). Hold Shift to run. Full air control.
- **Sonic the Hedgehog (Sonic)** — variable height by *cutting velocity*:
  release while rising faster than 4 px/frame and upward speed snaps to 4.
  Momentum-heavy ground movement (accel 0.046875, top speed 6) stretches the
  same 6.5 jump force into wildly different arcs.

## Accuracy notes

Values are px/frame at 60 Hz, from disassembly-based documentation:

- **SMB1** ([smbpedia movement](https://simplistic6502.github.io/smb1_tll/smbpedia_movement.html)):
  walk accel 0x98, run accel 0xE4, release decel 0xD0, skid 0x1A0 (all /4096
  px/f²); min walk 0x130/4096; walk cap 1.5, run cap 2.5. Jump table indexed
  by takeoff speed: <1.0 → vy 4.0, hold g 0x20/256, fall g 0x70/256;
  1.0–1.5625 → vy 4.0, 0x1E/256, 0x60/256; ≥1.5625 → vy 5.0, 0x28/256,
  0x90/256. Fall speed capped at 4.5. Horizontal control follows the
  FrictionData mechanism: one force chosen from {0xE4 run, 0x98 walk, 0xD0
  release}, **doubled while facing ≠ moving direction** — that doubling is
  the skid (0x1A0 = 2×0xD0) and applies to air turns too (air rate picked by
  the 25-subpixel speed threshold). *Approximated:* the RunningTimer/
  RunningSpeed flag subtleties, and the NES's true 60.0988 fps.
- **Sonic 1** ([Sonic Physics Guide](https://info.sonicretro.org/SPG:Jumping)):
  jump force 6.5, gravity 0.21875, release cap −4 (checked before movement),
  ground accel/friction 0.046875, braking 0.5, top speed 6, air accel ×2,
  air drag `xsp -= trunc(xsp/0.125)/256` when −4 < ysp < 0 (after gravity),
  no fall-speed cap, and the Sonic 1 quirk that the player doesn't move on
  the frame the jump starts.
- **Castlevania** ([TASVideos frame data](https://tasvideos.org/GameResources/NES/Castlevania)):
  walk 1 px/frame; flat jump 40 frames; lands on ledges 2 blocks up at frame
  29, 1 up at 36, never 3 up. The original uses a preset trajectory table
  rather than force+gravity; the fitted v0 4.0 / g 0.2 reproduces the
  documented rise timings and 40-frame airtime to within a frame (apex 42 px
  ≈ 2.6 tiles). *Approximated:* the descent tail (the real table falls
  slightly faster past the takeoff height) and landing recovery frames.

## Sprite credits

The original in-game sprites are **not included in this repository** — they
are copyrighted assets (characters © Nintendo, Konami, and SEGA), and the
sheets' rippers ask that they only be hosted at their source sites. Without
an `assets/` folder the app automatically falls back to built-in placeholder
pixel art, so a fresh clone runs fine.

To use the real sprites locally, download the sheets for personal/educational
use from [The Spriters Resource](https://www.spriters-resource.com/) —
Mario & Luigi (SMB, NES) by SuperJustinBros, Simon Belmont (Castlevania, NES)
by Mister Mike, Sonic (Sonic the Hedgehog, Genesis) by Triangly — and slice
frames into `assets/` (git-ignored) using the segmentation scripts in
`tools/`. Expected filenames (see `SPRITE_DEFS` in `app.js`):
`mario_idle/run1-3/jump`, `simon_idle/run1-3/jump`, `sonic_idle`,
`sonic_walk1-6`, `sonic_run1-4`, `sonic_ball1-4` (all `.png`).

## What the visualization shows

- **Dashed red arc** — the actual path of the current/last jump, with a marker
  at the apex (the diagram's "Peak and Fall" moment).
- **Faint predicted arcs** — while grounded: where a *hold* jump (red) and a
  *tap* jump (blue) from the current speed would go.
- **Ghost trail** — frame-by-frame snapshots of the jump, like the diagram.
- **Y Velocity readout** — live value (×10, up = positive) with the green
  rise / red fall arrow, plus the A-button hold indicator.
- **Phase cards** — the diagram's three steps light up as they happen.
- **Stats bar** — apex height (px and tiles), airtime, and horizontal range of
  the last jump; the stepped blocks (2/3/4 tiles) make max-height differences
  tangible.
- **Auto demo checkbox** — each character in turn runs, does a full held jump,
  pauses on the stats, then resets and hands off to the next character.
  Pressing any movement/jump key takes control back.

All physics run at a fixed 60 Hz in world pixels (1 tile = 16 px), rendered at
3×. Sample values are editable live via the sliders (reset restores the
authentic defaults).
