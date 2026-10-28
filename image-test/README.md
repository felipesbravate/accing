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
- Face close-ups, either:
  - `face-front.jpg`, `face-left.jpg`, `face-right.jpg` (the onboarding photos), or
  - frames from a short video of you turning your head: `npm run faces-from-video -- ~/Downloads/face.mov --frames=5`
    writes `face-1.jpg` … `face-5.jpg` (existing face photos are moved to a `previous-faces-…` folder, not deleted).
    Move those back and delete the face-N files to return to the photos.
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
- `--looks=4` makes up to 4 different looks from your garments (new combinations first, spreading the garments), one
  image each with `--runs=1`. Fewer come back if your photos cannot make that many.
  Same face, pose and shadow in every look: look 1 is generated from your face photos and must pass the face check
  (up to 3 tries, `--anchor-tries=N`); looks 2+ are edits of that image where only the clothes change
  (prompt in `scripts/image-edit-prompt.txt`). Each edit must keep look 1's pose (checked by Gemini Flash-Lite,
  ~$0.001) and pass the face check, or it is made again; rejected attempts are kept as `*-rejected-N.png`.
  `--no-anchor` generates every look from scratch instead.
- The same garment in several photos counts once even when the reader words it differently, so looks don't repeat.
- `--size=2K` gives the face more detail in the output (Gemini models; 512, 1K, 2K or 4K).
- `--detail=max` (default) makes Gemini read the face photos at its highest detail and the other photos at high detail;
  `--detail=default` leaves it to Gemini (which reads them at low detail). Check "Input tokens" in the report.
- `--only=` picks models: `gemini`, `openai`, or keys such as `gemini-nano-banana-pro` (Nano Banana Pro, only runs when named),
  comma-separated, e.g. `--only=gemini-nano-banana-2,gemini-nano-banana-pro`.
- Other options: `--runs=1`, `--occasion="a dinner"`, `--weather="rainy 14°C"`,
  `--time="Friday evening"`, `--pose="walking towards the camera mid-step"`, `--reader-model=<gemini model>`,
  `--shoes="black leather Chelsea boots"` (used only when no photo shows shoes; default plain white leather sneakers).

Every look uses the same pose, framing and pure white background (shadow only on the floor), so looks compare side by side.
The default pose is relaxed: turned about 15°, head to the camera, both arms loose at the sides, no hands in pockets (always the same); `--pose="…"` overrides it for a test.

Results land in `image-test/results/<date-time>/`: every image, `wardrobe.json` (what was read and chosen),
`report.md` (seconds, tokens, estimated cost) and `index.html` (open it to compare everything side by side).
Prices for the estimates are in `scripts/image-test.mjs` (`PRICES`) with their sources; check them before trusting totals.

## Flat background colour (automatic)
Image models never return pure white (every image measured 232–244/255, some with window-light patterns), which shows
as a grey box on the app's white screen. After each generation the person is cut out (ISNet, run on your Mac; model
~180 MB downloaded once into `image-test/models/`), the background is painted one flat colour (`#F9F9FB`; `--background=#RRGGBB` to change it), and the same soft floor shadow
is drawn under every look (a light pool around the shoes, slightly behind them, fading out well before the edges, and
a darker contact line under the soles; tune it in `SHADOW` in `scripts/clean-background.mjs`). The model's own output is kept as `*-raw.png`.
Takes ~3–7 s per image; `--no-clean` skips it.

## Base photo (try-on mode, used when `inputs/base.jpg` exists)
Generating a new person never looked enough like her, even with her real face pasted in (2026-10-27: faces, hair and
body still varied between looks). So when a full-body photo named `base.jpg` (or `.png`/`.heic`) is in the inputs, every
look is an EDIT of that real photo: only the clothes change; face, hair, body, pose, framing and light come from the
photo. The garments she wears in it are read first and listed as "take off" in the edit; her face is locked back from
the base photo after each edit; the background is painted `#F9F9FB` with the house shadow; each look is checked for pose
(against the base photo's outline), face, body and outfit, and remade up to 3 times (`--anchor-tries`).
The base photo decides how good every look can be. Take it like this:
- full body, head to feet with a little space; phone propped at chest height, timer, 2–3 m away, portrait
- plain wall, even soft light (facing a window, no sun or flash), no mirror
- face fully visible, looking at the camera, natural expression; hair off the cheeks
- fitted, plain, neutral clothes (easier to replace than a coat or a long dress), barefoot or simple flat shoes
- the house pose: body turned about 15°, arms loose at the sides, hands open, never in pockets
Keep her `face-*` photos and the garment photos in the folder as before. Remove `base.*` to go back to generating.

Face lock in base mode: the prepared base photo's face is copied back onto every look. Without it GPT redrew the face
on each edit and it drifted; resampled, it went soft (both 2026-10-28). It now copies pixel for pixel when the head has
the same size and angle as in the base photo (the log says "pixel copy"), and only resamples when the head moved.
`--hd` makes GPT images 1536x2304 instead of 1024x1536 (face ~170 px wide instead of ~115; ~2.25× the cost); use it
with `--reprep` so the base photo is prepared at the same size. The preparation now makes all 3 tries and keeps the
passing one closest to her face photos.
`--prepared=<file>` uses a base photo you picked (e.g. a `base-prepared-N.png` from a results folder) and saves it as
the prepared version for later runs. Logos and prints on the base photo's clothes are not judged during preparation
(the clothes are replaced in every look anyway).

### Base photo preparation (automatic, once per photo)
Any photo works as the base, including a mirror selfie: it is read first.
- Unusable (only part of the body, face covered, more than one person, sitting, blurry): the run stops and says why.
- Fixable (phone in hand, eyes on the phone, mirror and room, arms not relaxed, hand in a pocket): it is edited once into
  a studio photo in the house pose: hands empty, looking into the lens, plain background, same clothes. The face is
  rebuilt from the `face-*` photos where the head or eyes turn. Up to 3 tries; one is kept only if the identity stays
  within 0.05 of the original photo's, the look check passes and the problems are gone. Made with
  `openai-2.5-flare-high` (Gemini when there is no OpenAI key; `--prep-model=<key>` to choose), about $0.08–0.25 once.
- Already clean: used as it is (nothing redrawn).
The prepared photo is saved in `inputs/prepared/` and reused on later runs; `--reprep` makes it again, `--no-prep` skips
it. Looks of a base photo may move the feet up to 4% of the height (1% elsewhere) and are checked against her face
photos and the base photo only (her mirror-selfie outfit photos made the check see a bun and a choker that were not there).

## Real face (Gemini only by default, when there is no base photo)
Since 2026-10-28 GPT looks keep GPT's own face (the transplant looked pasted on; GPT's face already looked like her);
the face check still rejects a GPT look that does not match. `--real-face` forces the transplant on every model,
`--no-real-face` turns it off everywhere. Everything the run prints is also saved as `run.log` in the results folder.

Drawn faces plateaued at the identity of an average real photo (~0.6) and still read as "not her". Now look 1 gets the
person's REAL face: from the face photo whose head angle matches best, aligned by the landmarks and relit to the
generated light (her features, the image's light; toward the face edges only skin is taken, never hair). Identity on
2026-10-27: 0.62 → 0.86. Then a harmonize pass asks the image model to blend the edges without changing features; it is
kept only if the identity stays above 0.75 and within 0.06 of the transplant. Every look is generated fresh from the same pose reference and gets that same real face, so all looks share face, pose,
framing and shadow without editing one into the other (`--anchor` brings back editing look 1, which kept old garments,
invented ghosts and reshaped the body).
`--no-real-face` goes back to drawn faces. Works best with an evenly lit, front face photo with no hair over the cheeks.

## Face fidelity (automatic)
In a full-body image the face is only ~190 px wide, and every clothes edit redraws it (identity fell from 0.62 on
look 1 to 0.47–0.51 on its edits). Two steps fix that:
- **Face detail pass** (first image of each look set): the head is cut out, enlarged to 1024 px, and the face is
  redrawn from your face photos at that size (`--face-passes=2` tries in parallel, ~$0.07 each), then aligned back by
  the facial landmarks, colour-matched and blended in. The version closest to your face photos is kept, including
  the original if no redraw beats it. Prompt: `scripts/face-pass-prompt.txt`. `--face-passes=0` turns it off.
- **Face lock** (looks 2+): look 1's face is put back onto every edited look, aligned by the landmarks, so all looks
  have the very same face. Free, runs on your Mac. `--no-face-lock` turns it off.

## Identity card (automatic)
Before generating, Gemini Flash-Lite describes the person from the face photos in exact words (hair colour roots to
ends, skin, eyes, face, natural expression, age, what they always wear; ~$0.001), and the prompts state it. The image
model drifted on exactly these (dark brown hair with caramel ends came out auburn, a soft smile came out stern).
The card is saved as `image-test/inputs/identity-read.txt`; correct it (e.g. hair colour, age) and save it as
`identity.txt` in the same folder to use the person's own words instead. The expression is copied from the front face photo, including a slight smile. `--pro-face` uses Nano Banana Pro for the
face redraw (~$0.13 instead of ~$0.07 each) to compare.

## Pose references (once)
The model ignored the pose in words, so it gets a picture: a faceless mannequin in the house pose, one per body and
feet (heels raise the feet, flats/sneakers/boots keep them down; the shoes of the look decide).
`npm run make-pose-reference -- --all` makes the missing ones (female flat, female heels, male flat; ~$0.10 each) in
`scripts/assets/`; `-- --body=male --feet=heels` makes one. Open them; commit the good ones, run again for any that are off.
The body is read from your photos (`--body=female|male` sets it); `--no-pose-ref` leaves the reference out.
Edited looks may change only the foot angle when the shoes change heel height. Look 1's pose is measured against the
mannequin's and remade if it differs; each edit's pose is also measured from
the person outline (feet gap and how far one foot is in front): more than 1% of the height off look 1 and it is remade.

## Checks on every look (automatic, remade up to 3 times)
- Pose: measured against the mannequin (feet stagger and gap, 1% of the height).
- Face check: identity gate, hair, age, beard, glasses, **body build** vs the real full-body photos, invented items,
  hands in pockets.
- **Outfit check**: exactly the look's garments, nothing missing, nothing extra (e.g. a blazer from another look).
Outfit photos are cut out onto a plain background before they are sent (clutter in mirror selfies came back as ghosts);
`--no-clean-refs` sends them as they are.

## 4. Face check (runs automatically after every image test)
Two layers, because one number is not enough: on 2026-10-27 ArcFace ranked first the image friends liked least.
1. **Identity gate (ArcFace).** Similarity between the generated face and your average face photo, computed on your Mac.
   Below `0.4` = a different person (calibration: a different man scored 0.07, every real likeness 0.55–0.72).
   It only gates; it does not say which image looks most like you.
2. **Look check.** Gemini Flash-Lite (~$0.002 per image) compares the result with your real photos on what ArcFace
   cannot see: hair colour and grey, apparent age, beard, glasses, expression, and anything invented (tattoos, logos, watches).
   It also fails any image with a hand in a pocket.

Each image gets PASS or FAIL with reasons in `report.md` and `index.html`. A third, free check measures whether the
background is that flat colour (within 3/255; raw model output measured 232–244); it only warns.

Setup once: `npm install`. The first check downloads the face model (~280 MB) into `image-test/models/` (git-ignored).
- `npm run face-check` re-checks every results folder (also older ones); `npm run face-check -- image-test/results/<folder>` one folder.
- Options: `--min-identity=0.45`, `--no-look` (free, identity only), `--no-identity`; `npm run image-test -- --no-check` skips it.

Licence: the ArcFace model (InsightFace buffalo_l) is for non-commercial research only. Fine for this test; the product
needs InsightFace's commercial licence or a differently licensed model.

## Scoring (first-attempt rate)
Every run writes `scores.csv` in its results folder: one row per look with the garments and the attempt that was kept.
Fill `face`, `clothes` and `pose` with 1 (right) or 0 (wrong), then `npm run score-summary` (or
`npm run score-summary -- 2026-10-28` for some runs only) prints the rates and lists clothing misses.
In base mode the look check no longer judges what is copied or real: age, glasses and facial hair (the face is a pixel
copy), earrings, and logos or prints on the garments (the outfit check covers garments). All 11 rejections in three runs
on 2026-10-28 were false alarms of this kind.

## Cost and Flex
GPT image cost is computed from the tokens OpenAI reports (text in $5, image in $8, image out $30 per 1M; Flex at half),
saved per image in `*.usage.json`, and the run prints its total (kept + rejected + base preparation).
`--flex` asks for OpenAI's Flex tier — tested 2026-10-28: the Images API answers 400 "Unknown parameter: 'service_tier'", so Flex does not exist for image edits; the script then uses standard for the rest of the run. Was: (half price, slower, can be unavailable). When Flex is unavailable (429, not
charged) or not offered for the model, that image falls back to standard and the log says so; flex images say "(flex)".

## Garment close-ups (automatic)
The garment reader also returns a box around each garment. Edits then send one close-up per garment (cut out, at most
1024 px) instead of whole outfit photos: about 70% of a GPT look's cost was the photos sent in. Garments without a box
are sent as their whole photo. Close-ups are saved as `garment-*.jpg` in the results folder; `--no-garment-crops` goes
back to whole photos (compare input tokens in the report).

## Swipe timing (base mode)
Each look's ready time (all attempts, checks and clean-up) is measured. The report shows, for "look n+1 starts when
look n is shown", how long she would wait if she swipes after 5, 10, 20 or 30 seconds.

Look check (all modes): garments and shoes are never judged as "added" (the outfit check covers them). Fresh looks may
differ from the pose reference by 2.5% of the height (was 1%: looks judged right were 1.5–2.3% off and all redone).

## Generated base photo (automatic when there is no base photo, GPT)
Fresh GPT looks were very good but each drew a new face and stance (Juliana, 2026-10-28). Without `base.*`, look 1 is
now generated 3 times (GPT high), the try closest to the face photos (and on the pose reference) becomes the base photo,
and looks 2+ are edits of it with its face copied back pixel for pixel. Look 1 is the base itself (no extra call).
It is saved in `inputs/prepared/generated-*.png` and reused while the face photos stay the same (any outfit, seed or occasion; look 1 is only free when it wears the same outfit as the base);
`--prepared=<file>` picks another try (`base-generated-N.png` in the results folder), `--reprep` makes new ones,
`--no-auto-base` goes back to fresh looks.

## Female model pose (2026-10-28)
Women now stand in a fashion-model pose (Felipe's pick), men keep the house pose; `--pose=...` overrides both.
The female mannequins are made from a photo with that pose: `npm run make-pose-reference -- --body=female --feet=flat
--from=image-test/inputs/pose-sources/female-model.png`, then `--body=female --feet=heels` (an edit of the flat one).
The previous ones are kept as `pose-reference-female-*-house.png`. A new pose makes a new generated base photo.

## 2026-10-28: show early, garments by eye, camera
- **Show early:** a look counts as shown when its first image is painted (~1 s after GPT); checks run while she looks
  at it and a rejected look is replaced later. The swipe table uses that time and lists replacements.
- **Outfit check by eye:** garments with a close-up are compared to it (neckline, straps and back, collar, sleeves,
  length, closures, pockets, pattern), not only by name. A plain V-neck tank had come out as a racerback and passed.
- **Camera:** base photos ask for hip height, ~4 m, long lens (85 mm look), no wide-angle distortion (feet looked big,
  legs short). New method → a new generated base is made once.
