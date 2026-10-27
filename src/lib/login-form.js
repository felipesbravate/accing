// Pure helpers for the sign-in forms (tested in tests/login-form.test.js).
export function cleanEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

export function cleanName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

export function validPassword(value) {
  const p = String(value ?? '');
  return p.length >= 8 && p.length <= 200;
}
