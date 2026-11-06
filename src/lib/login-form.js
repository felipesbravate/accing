// Pure helpers for the sign-in forms (tested in tests/login-form.test.js).
export function cleanEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

export function cleanName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

/** New passwords (Figma "Password requirements", 177:2816): at least 8 characters, with an uppercase letter, a lowercase
 *  letter, a number and a symbol. Signing in never checks this, so older passwords keep working. */
export const PASSWORD_RULE = 'Use at least 8 characters, including an uppercase letter, a lowercase letter, a number, and a symbol.';
export function validPassword(value) {
  const p = String(value ?? '');
  return p.length >= 8 && p.length <= 200 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);
}

/** A same-site path to go to after an email link ("/reset-password"), or '/'. */
export function safeNext(value) {
  const v = String(value ?? '');
  return /^\/[a-z0-9/-]*$/i.test(v) && !v.startsWith('//') ? v : '/';
}
