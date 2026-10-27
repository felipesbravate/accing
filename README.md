# Accing

AI-powered personal fashion mirror. Same setup as Ongatu: Next.js App Router + React + Supabase, plain CSS, plain JavaScript.

## Run locally (macOS)

```bash
cd ~/Projects/accing
npm install
npm run dev
```

Open http://localhost:3000. Without Supabase keys, use **Continue with preview account** on the sign-in page.

## Connect Supabase

```bash
cp .env.example .env.local
```

Fill `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Supabase → Settings → API), then restart `npm run dev`.
In Supabase → Authentication → URL Configuration, add `http://localhost:3000/auth/callback` to the redirect URLs.

## Layout

- `app/`: thin Next.js pages and `/auth/*` route handlers
- `src/server/`: server-only code (Supabase auth)
- `src/lib/`: pure helpers
- `src/login/`, `src/mirror/`: the screens
- `src/ui/theme.css`: design tokens from Figma
- `tests/`: `npm test`
