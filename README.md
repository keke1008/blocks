# Blocks

A falling block puzzle for one player, made for Android phones in landscape.
See [REQUIREMENTS.md](REQUIREMENTS.md) for the full spec.

## Development

```sh
npm install
npm run dev      # dev server
npm test         # game logic unit tests
npm run build    # typecheck + production build into dist/
```

Icons are generated with `python3 scripts/make_icons.py` (needs Pillow).

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and
publishes `dist/` to GitHub Pages. In the repository settings, set
**Pages → Build and deployment → Source** to **GitHub Actions** once.

On the phone, open the Pages URL in Chrome and choose **Add to Home screen** to
play fullscreen and offline.
