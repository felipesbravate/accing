// Same rule as Ongatu: a visitor with no session cookie at all goes straight to /login, so a signed-out visit
// never renders the mirror. Only the cookie's presence is checked here; the page itself verifies the session.
// `preview_user` is the local preview account used while Supabase is not configured (development only).
import { NextResponse } from 'next/server';

const SESSION_COOKIE = /^(sb-.+-auth-token(\.\d+)?|preview_user)$/;
const PRIVATE_PAGES = new Set(['/', '/onboarding']);

export function middleware(request) {
  const { pathname, searchParams } = request.nextUrl;
  if (PRIVATE_PAGES.has(pathname) && !searchParams.has('code') && !request.cookies.getAll().some((c) => SESSION_COOKIE.test(c.name) && c.value)) {
    const to = request.nextUrl.clone(); to.pathname = '/login'; to.search = '';
    return NextResponse.redirect(to, 307);
  }
  const res = NextResponse.next();
  res.headers.set('cache-control', 'no-store');
  return res;
}

export const config = { matcher: ['/', '/login', '/onboarding'] };
