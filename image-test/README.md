# Image generation test

Mirrors the real onboarding: three face close-ups plus ordinary head-to-toe photos. The script reads the garments in
each photo by itself, composes a new outfit across photos, generates it with each image model, and measures how long
it takes and what it costs.

## 1. Keys (once)
Add to `.env.local` in the project root (never commit it, never paste it in a chat):
```
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```
The Gemini key is always needed (it reads the garments); the OpenAI key only for the OpenAI models.

## 2. Photos in `image-test/inputs/` (git-ignored, they stay on your Mac)
- `face-front.jpg`, `face-left.jpg`, `face-right.jpg`: face close-ups, as in onboarding.
- Any other photos, any file names: you head to toe, each in a different outfit. 2 to 4 is a good start.
  The script reads what you wear in each and mixes items across photos (e.g. the blazer from one, the jeans from another).
- JPG, PNG or WebP. iPhone HEIC is skipped (AirDrop > Options > Most Compatible gives JPG).

## 3. Run (one command at a time)
```
npm run image-test -- --dry-run
npm run image-test -- --only=gemini --runs=1
npm run image-test
```
- `--dry-run` reads the garments (well under one cent) and shows the outfit and prompt, without generating images.
- Each run picks the outfit with a random seed and prints it; `--seed=<number>` repeats the same outfit.
- `--size=2K` gives the face more detail in the output (Gemini models; 512, 1K, 2K or 4K).
- `--detail=max` (default) makes Gemini read the face photos at its highest detail and the other photos at high detail;
  `--detail=default` leaves it to Gemini (which reads them at low detail). Check "Input tokens" in the report.
- `--only=` picks models: `gemini`, `openai`, or keys such as `gemini-nano-banana-pro` (Nano Banana Pro, only runs when named),
  comma-separated, e.g. `--only=gemini-nano-banana-2,gemini-nano-banana-pro`.
- Other options: `--runs=1`, `--occasion="a dinner"`, `--weather="rainy 14°C"`,
  `--time="Friday evening"`, `--pose="walking towards the camera mid-step"`, `--reader-model=<gemini model>`.

Results land in `image-test/results/<date-time>/`: every image, `wardrobe.json` (what was read and chosen),
`report.md` (seconds, tokens, estimated cost) and `index.html` (open it to compare everything side by side).
Prices for the estimates are in `scripts/image-test.mjs` (`PRICES`) with their sources; check them before trusting totals.
