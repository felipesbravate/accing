// Form posts must come from this same site (the browser sends Origin on POST). Mirrors Ongatu's passesFormCsrf.
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export const back = (path) => new Response(null, { status: 303, headers: { location: path } });
