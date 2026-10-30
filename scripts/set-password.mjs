// Sets a new password for an app account (admin, from the Mac). The password is typed hidden and never printed.
//   node --env-file=.env.local scripts/set-password.mjs you@example.com
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
if (!email) { console.error('Usage: node --env-file=.env.local scripts/set-password.mjs you@example.com'); process.exit(1); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function ask(question) {
  return new Promise((done) => {
    process.stdout.write(question);
    let value = '';
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    const onKey = (k) => {
      if (k === '\r' || k === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onKey); process.stdout.write('\n'); done(value); }
      else if (k === '\u0003') process.exit(1);
      else if (k === '\u007f') value = value.slice(0, -1);
      else value += k;
    };
    process.stdin.on('data', onKey);
  });
}

let user = null;
for (let page = 1; page < 50 && !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (data.users.length < 200) break;
}
if (!user) { console.error(`No account for ${email}`); process.exit(1); }
const pw = await ask('New password (hidden): ');
if (pw.length < 8) { console.error('Use at least 8 characters.'); process.exit(1); }
if (pw !== await ask('Again: ')) { console.error('The two did not match; nothing changed.'); process.exit(1); }
const { error } = await db.auth.admin.updateUserById(user.id, { password: pw });
if (error) { console.error('Not changed:', error.message); process.exit(1); }
console.log(`Password changed for ${email}. Sign in with it at https://accing.vercel.app`);
