# Blocks

A falling block puzzle for one player, made for Android phones in landscape.
See [REQUIREMENTS.md](REQUIREMENTS.md) for the full spec.

## Development

```sh
npm install
npm run dev      # dev server
npm test         # unit tests: game rules, input timing, touch routing, random-play fuzz
npm run test:e2e # browser tests (Playwright, mobile landscape) against the production build
npm run build    # typecheck + production build into dist/
```

Tests are organised so most behaviour is checked without a browser:

- `src/touch.ts` routes touches to actions with no DOM access (`tests/touch.test.ts`).
- `Game` takes a starting board/piece and exposes input as methods; `tests/helpers.ts`
  replays timed input scripts through the real `InputController` + `Game`.
- `tests/fuzz.test.ts` plays seeded random games and checks invariants every frame.
- `tests/e2e/` covers what needs a browser: real multi-touch, screens, persistence and
  the service worker update banner.

Icons are generated with `python3 scripts/make_icons.py` (needs Pillow).

## Deploy

Every push and pull request runs the unit and browser tests
(`.github/workflows/deploy.yml`); pushes to `main` that pass are published to GitHub Pages. In the repository settings, set
**Pages → Build and deployment → Source** to **GitHub Actions** once.

On the phone, open the Pages URL in Chrome and choose **Add to Home screen** to
play fullscreen and offline.
