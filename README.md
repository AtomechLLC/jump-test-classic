# The Basics of Jumping — interactive edition

An interactive recreation of Celia Wagar's animated diagram about jump physics
([critpoints.net](https://critpoints.net)), extended to compare three classic
jump models side by side.

**▶ Live demo:** <https://atomechllc.github.io/jump-test-classic/>

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
- **Super Mario World (Mario)** — the SNES refinement: the gravity switch
  stays (release exactly doubles gravity), but the initial jump force itself
  scales with ground speed. Filling the P-meter (hold run at speed) unlocks
  the 3.06 px/f sprint and the full 6-tile jump. Distinct rising and falling
  sprites.
- **Sonic the Hedgehog (Sonic)** — variable height by *cutting velocity*:
  release while rising faster than 4 px/frame and upward speed snaps to 4.
  Momentum-heavy ground movement (accel 0.046875, top speed 6) stretches the
  same 6.5 jump force into wildly different arcs.
- **Super Metroid (Samus)** — variable height by *stopping*: release while
  rising and upward speed is set straight to 0. Floaty 0.109375 gravity both
  ways gives a ~7-tile apex and 1.5 s of hang time. Air control is capped at
  1.375 px/f but ground momentum is kept; hold run to build the +2 px/f dash.
  Moving jumps somersault.
- **Mega Man 2 (Mega Man)** — purely digital movement: 1.296875 px/f the
  instant you press, zero the instant you release, on the ground or mid-air.
  Release-to-stop jump (0x04.DF force, 0.25 gravity). Total control.
- **Mega Man X (X)** — the 16-bit refinement: same instant, cuttable jump
  (5.0 force, 0.25 gravity) plus the dash — hold run for 3.5 px/f, and a
  dash-jump keeps that speed for the whole arc. Same height, 2.3× the
  distance.
- **Kirby Super Star (Kirby)** — the fourth answer to variable height: why
  land at all? A very reactive fixed-height hop (high force, high gravity
  both ways — up fast, right back down), then press jump mid-air to puff
  up — every press flaps upward, and while puffed Kirby parachutes down at
  a fraction of normal fall speed, indefinitely. Flight as forgiveness.
- **Ori and the Blind Forest (Ori)** — the fifth answer: rhythm. The
  triple jump is a *ground* chain — land and jump again within a beat and
  the sequence escalates skip → hop → spinning flip, with jump heights
  3 → 3.75 → 4.5 (from the SeinJump source). Miss the window and it
  resets. Soft-gravity while held, plus one mid-air Double Jump.

## Game-feel assists

Two modern platformer assists are layered on top of all five characters,
each with its own checkbox (on by default) so you can feel the difference:

- **Coyote time** — jumping still works for 6 frames after walking off a
  ledge (never after a jump).
- **Jump buffer** — a jump pressed up to 6 frames before landing is
  remembered and fires on touchdown.

A small label floats up from the takeoff point whenever a jump was granted
by an assist. None of the five original games have either mechanic.

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
- **Super Mario World** ([SMW Central measurements](https://www.smwcentral.net/?p=viewthread&t=97883)):
  max X speeds 21/37/49 subpx (walk/run/P-speed = 1.3125/2.3125/3.0625 px/f);
  initial jump speeds 77/82/87/92 subpx (4.8125→5.75 px/f) by speed tier,
  interpolated between anchors here. Gravity 3 subpx held-and-rising /
  6 subpx otherwise (0.1875/0.375) — cross-checked against the documented
  jump heights (6 tiles at sprint "only just barely", 5 at run, 2 minimum),
  which these values reproduce. *Approximated:* P-meter fill timing (~80
  frames from standstill is documented; the meter model here is simplified),
  skid rate, the 0-1-0-1-2 speed oscillation quirk, and the fall-speed cap.
- **Super Metroid** ([supermetroid.run](https://wiki.supermetroid.run/Horizontal_Speed) /
  [speedga.me](https://wiki.speedga.me/Vertical_Speed) wikis, NTSC values;
  their `pixels.subpixels` notation is 65536ths, converted here): walk 2.75,
  run 4.75 (walk + 2.0 dash built at the documented 0.0625/frame over ~32
  frames), jump 4.875, gravity 0.109375 rising and falling, fall cap
  5.03125, air-control caps 1.25/1.375. *Approximated:* ground accel/decel
  and air accel (not documented), and the release-to-stop transition (the
  real game passes through a brief falling-transition state). No hi-jump
  boots, water physics, or wall jumps.
- **Mega Man 2** ([nesdev reverse-engineering thread](https://forums.nesdev.org/viewtopic.php?t=10937)):
  jump velocity 0x04.DF (4.87109375 px/f); walk 0x01.4C and gravity 0x00.40
  (0.25) are the community-standard figures. *Approximated:* the famous
  first-press "inch step" quirk is omitted, and terminal fall speed (7 here)
  is not disassembly-verified.
- **Mega Man X** ([TASVideos data page](https://tasvideos.org/GameResources/SNES/MegamanX/Data)):
  walk 1.5, dash 3.5, jump 5.0, gravity 0.25, terminal 5.75 px/f.
  *Approximated:* the dash is modeled as hold-to-dash rather than the real
  timed burst, and wall slides/kicks are not implemented.
- **Kirby Super Star**: no public disassembly documents its constants (the
  [KSS disassembly](https://github.com/Ankouno/KSS-disassembly) covers
  system banks only), so everything here is feel-fitted. Ground movement
  is Super Star style — instant walk (1.25 px/f) with a double-speed dash
  (2.5) on the run button. The vertical model follows Celia Wagar's
  direction: the first jump is *very* reactive — a really high initial
  force under really high gravity in both directions (0.45 rising, 0.4
  falling), so Kirby bursts up and comes right back down at a fixed
  height (Super Star's ground jump does not scale with hold duration).
  The floatiness all lives in the float: flap jumps use a low impulse
  (2.0) under low gravity with a 0.75 fall cap, forever. *Approximated
  (feel-fitted):* the specific constants (9.0 force, 0.45/0.4 gravity,
  4.0 fall cap) — exact values aren't publicly documented.
- **Ori**: the ground-chain heights are sourced — FirstJumpHeight 3,
  SecondJumpHeight 3.75, ThirdJumpHeight 4.5 (a 1 : 1.25 : 1.5 ladder,
  read from the SeinJump controller in a fan-provided Will of the Wisps
  source tree; jump velocities here scale as √height to preserve the
  ratios). Movement is sourced too, from
  HorizontalPlatformMovementSettings: MaxSpeed 11.6, Acceleration 60,
  Deceleration 30 units/s, applied identically on the ground and in the
  air — converted via the 3-unit first-jump anchor (21.5 px/unit at
  60 fps) to 4.157 / 0.358 / 0.179 px-frame values. Gravity is sourced
  from CharacterGravity: GravityStrength 26 units/s² applied the same in
  both directions (the arc is symmetric — 0.1553 px-frame here) with
  MaxFallSpeed 38 (13.6 px-frame); launch speeds follow SeinJump's
  `CalculateSpeedFromHeight` = √(2gh), giving 4.476 px-frame for the
  first jump. The 12-frame chain window (`m_bunnyHopTimeRemaining` 0.2 s)
  and variable height are sourced too: releasing jump applies an extra
  deceleration that can drain at most the launch speed — but only *half*
  of it on the flip (jumpSustainMul 1.0 / 1.0 / 0.5). Timing was verified
  against captured gameplay footage: the measured full-jump rise (~28.5
  frames) matches the source-predicted 28.8, and the arc is symmetric on
  video as predicted. Frames render at 1:1
  native pixels; the run is the full 13-frame hand-drawn cycle (smear
  frames included) advancing every screen frame, 60 fps. *Approximated:*
  the release deceleration rate (JumpStopDeceleration) and the Double
  Jump force, both serialized in scene data rather than code. Ori's
  frames are the game's actual
  hand-drawn animation art, extracted from the `seinPlatformingAtlas`
  textures of a personally owned copy (the game is fully sprite-based);
  a pixel-art placeholder remains as the
  fallback. Ori is © Microsoft / Moon Studios.
- **Castlevania** ([TASVideos frame data](https://tasvideos.org/GameResources/NES/Castlevania)):
  walk 1 px/frame; flat jump 40 frames; lands on ledges 2 blocks up at frame
  29, 1 up at 36, never 3 up. The original uses a preset trajectory table
  rather than force+gravity; the fitted v0 4.0 / g 0.2 reproduces the
  documented rise timings and 40-frame airtime to within a frame (apex 42 px
  ≈ 2.6 tiles). *Approximated:* the descent tail (the real table falls
  slightly faster past the takeoff height) and landing recovery frames.

## Sprite credits

`assets/` contains individual frames from the original games, included here
solely for non-commercial, educational demonstration of jump physics. The
characters and their sprites are © Nintendo (Mario), © Konami (Simon
Belmont), and © SEGA (Sonic); they will be removed immediately at the
request of any rights holder.

Frames were sliced (scripts in `tools/`) from sheets on
[The Spriters Resource](https://www.spriters-resource.com/): Mario & Luigi
(SMB, NES) ripped by SuperJustinBros; Simon Belmont (Castlevania, NES) and
Mega Man (Mega Man 2, NES) by Mister Mike; Sonic (Sonic the Hedgehog,
Genesis) by Triangly; Samus Aran (Super Metroid, SNES) uploaded by "Barack
Obama"; X (Mega Man X, SNES) by Random Talking Bush; Kirby (Kirby Super
Star, SNES) by Jermungandr. The Super Mario World small-Mario frames
come from [Mario Universe](https://www.mariouniverse.com/sprites-snes-smw/).
Metroid, Super Mario World, and Kirby are © Nintendo (Kirby with HAL
Laboratory); Mega Man is © Capcom. If `assets/`
is removed, the app automatically falls back to built-in placeholder pixel
art, so the sample keeps running either way.

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
