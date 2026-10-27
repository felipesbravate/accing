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
- The clothes, in either (or both) of two ways:
  - `worn-1-brown-tweed-blazer.jpg`, `worn-2-black-jeans.jpg`, …: photos of you **wearing** clothes. Name each file
    after the one item to take from it; everything else in that photo is ignored. To test real outfit building, take
    items from **different** photos (blazer from one outfit, jeans from another).
  - `garment-1-brown-tweed-blazer.jpg`, …: a photo of the item on its own (flat or on a hanger).
  The words after the number become the description in the prompt.
- iPhone photos must be JPG/PNG, not HEIC (AirDrop → Options → Most Compatible).

## 3. Run
```
npm run image-test                      # every model, 3 runs each
npm run image-test -- --runs=1          # quicker
npm run image-test -- --only=gemini     # one provider (gemini or openai)
npm run image-test -- --occasion="a dinner" --weather="rainy 14°C" --time="Friday evening"
npm run image-test -- --pose="walking towards the camera mid-step, arms swinging naturally"
npm run image-test -- --dry-run         # check inputs and show the prompt, no API calls, no cost
```
Results land in `image-test/results/<date-time>/`: every image, `report.md` (seconds, tokens, estimated cost) and
`index.html` (open it to compare the outputs side by side with your reference photos).

Prices used for the estimate are in `scripts/image-test.mjs` (`PRICES`) with their sources; check them against the
providers' pricing pages before trusting the totals.
