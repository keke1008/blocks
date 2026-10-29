# Blocks — Requirements

A single-player falling block puzzle for Android phones in landscape.
(The well-known trademarked name is intentionally not used anywhere.)

## Platform
- Web app (TypeScript + Vite + Canvas), installable as a PWA, works offline.
- Hosted on GitHub Pages (deployed by GitHub Actions on push to `main`).
- Target: Android (Chrome). Landscape only — portrait shows a "rotate your device" screen.
- No keyboard / PC support, no vibration, no sound or music.
- UI language: English.

## Controls (touch, two hands)
- Left hand: D-pad — Left, Right, Soft drop (down), Hard drop (up).
- Right hand: Rotate left, Rotate right, Hold.
- The whole screen is the touch surface: a touch triggers the action whose marker is
  nearest (distance scaled by marker size), so you never have to hit a button exactly.
- A finger holding Left / Right / Soft drop can slide between those three, like a D-pad.
  Hard drop, rotations and Hold only fire on touch, never by sliding into them.
- Multi-touch: several fingers can act at once (e.g. hold Left while rotating).
- Each marker's position and size can be adjusted in the button editor, which shades
  the screen by which action each area triggers. No gestures.
- DAS / ARR auto-repeat, adjustable in settings.

## Rules
- 10×20 visible field plus a hidden buffer above.
- SRS rotation with the standard wall kick tables (separate table for I).
- 7-bag randomizer, Hold (once per piece), Next queue, Ghost piece.
- Hard drop and soft drop.
- Lock delay 0.5 s, reset by moves/rotations up to 15 times (refreshed when the piece reaches a new lowest row).
- No line clear delay, no entry delay. No 180° rotation.
- Game over on block out (spawn blocked) or lock out (piece locked fully above the field).

## Scoring (all × level)
| Clear | Points |
| --- | --- |
| Single / Double / Triple / Quad | 100 / 300 / 500 / 800 |
| T-spin Mini (0 / 1 / 2 lines) | 100 / 200 / 400 |
| T-spin (0 / 1 / 2 / 3 lines) | 400 / 800 / 1200 / 1600 |
| Back-to-Back (Quad or any line-clearing T-spin, in a row) | ×1.5 |
| Combo (REN) | 50 × combo count |
| Perfect clear (1 / 2 / 3 / 4 lines, B2B Quad) | 800 / 1200 / 1800 / 2000 / 3200 |
| Soft drop / Hard drop | 1 / 2 per row |

T-spin detection uses the 3-corner rule; a Mini is upgraded to a full T-spin when
both front corners are filled or the 5th kick test was used.

## Mode
- Marathon only: level up every 10 lines, guideline gravity curve, ends at 150 lines (level 15).
- Best score saved on the device.

## Presentation
- Simple look, standard piece colors, minimal effects (a short text label for
  T-spins, B2B, REN and perfect clears).
- Auto-pause when the app is hidden, loses focus or is turned to portrait.

## Settings
- DAS, ARR, soft drop speed, number of Next pieces (1–6), ghost on/off.
- Button editor: drag to move, size slider, reset to defaults.
