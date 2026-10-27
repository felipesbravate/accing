# Image generation test

Compares models on the same photos: does the result look like you, how long does it take, what does it cost.

## 1. Keys (once)
Add to `.env.local` in the project root (never commit it, never paste it in a chat):
```
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```

## 2. Photos
Put them in `image-test/inputs/` (git-ignored, they stay on your Mac). JPG, PNG or WebP.
- `face-front.jpg`, `face-left.jpg`, `face-right.jpg`: required
- `body.jpg`: one full-body photo, strongly recommended
- `garment-1-brown-tweed-blazer.jpg`, `garment-2-black-v-neck-top.jpg`, …: one per garment.
  The words after the number become the garment's description in the prompt.

## 3. Run
```
npm run image-test                      # every model, 3 runs each
npm run image-test -- --runs=1          # quicker
npm run image-test -- --only=gemini     # one provider (gemini or openai)
npm run image-test -- --occasion="a dinner" --weather="rainy 14°C" --time="Friday evening"
npm run image-test -- --dry-run         # check inputs and show the prompt, no API calls, no cost
```
Results land in `image-test/results/<date-time>/`: every image, `report.md` (seconds, tokens, estimated cost) and
`index.html` (open it to compare the outputs side by side with your reference photos).

Prices used for the estimate are in `scripts/image-test.mjs` (`PRICES`) with their sources; check them against the
providers' pricing pages before trusting the totals.
