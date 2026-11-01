// What to tell the person when a batch of looks failed (generation_jobs.error_message). Pure; tested.
// The raw errors are for us (worker log, scripts/check-looks.mjs); the app shows one plain sentence.
export function jobFailureText(message) {
  const m = String(message || '');
  if (!m) return null;
  // 2026-10-31: Gemini prepaid credit ran out; every batch failed for 14 hours and the app said nothing.
  if (/credit|billing|prepay|quota|\b402\b|\b429\b|rate limit/i.test(m)) return 'The look service is out of credit for now. Try again later.';
  if (/refus|safety|policy/i.test(m)) return 'The image service declined these looks.';
  if (/no outfit|no look|nothing from|at least a top/i.test(m)) return 'None of your outfits suit this occasion yet.';
  return 'Something went wrong while making them. Try again later.';
}
