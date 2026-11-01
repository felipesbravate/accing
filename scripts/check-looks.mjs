// Read-only check of one account's outfit photos, recent jobs and looks: what the worker did with new photos.
//   node --env-file=.env.local scripts/check-looks.mjs you@example.com [days=3]
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local. Prints no keys and changes nothing.
import { createClient } from '@supabase/supabase-js';

const [email, daysArg] = process.argv.slice(2);
if (!email) { console.error('Usage: node --env-file=.env.local scripts/check-looks.mjs you@example.com [days]'); process.exit(1); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const since = new Date(Date.now() - (Number(daysArg) || 3) * 864e5).toISOString();
const t = (s) => (s ? new Date(s).toLocaleString('en-GB', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');

const { data: u, error } = await db.from('users').select('id, plan, base_path').eq('email', email).single();
if (error || !u) { console.error('No account for', email, error?.message || ''); process.exit(1); }
console.log(`Account: plan ${u.plan}, base photo ${u.base_path ? 'picked' : 'NOT picked'}\n`);

const { data: photos } = await db.from('wardrobe_photos').select('id, path, is_active, created_at, retake_hint').eq('user_id', u.id).order('created_at');
const name = new Map();
console.log('Outfit photos (oldest first):');
(photos || []).forEach((p, i) => {
  name.set(p.path, `#${i + 1}`); name.set(p.id, `#${i + 1}`);
  console.log(`  #${i + 1}  ${t(p.created_at)}  ${p.is_active ? 'active  ' : 'inactive'}  ${p.path.split('/').pop()}${p.retake_hint ? `  retake: ${p.retake_hint}` : ''}`);
});

const { data: jobs } = await db.from('generation_jobs').select('id, job_type, status, payload, result, error_message, created_at, completed_at')
  .eq('user_id', u.id).gte('created_at', since).order('created_at');
console.log(`\nJobs since ${t(since)}:`);
for (const j of jobs || []) {
  const p = j.payload || {};
  console.log(`  ${t(j.created_at)}  ${j.job_type}  ${j.status.padEnd(10)} ${p.kind || ''} ${p.occasion || ''}${p.include_path ? `  with photo ${name.get(p.include_path) || p.include_path.split('/').pop()}` : ''}`
    + `${j.result ? `  → ${JSON.stringify(j.result)}` : ''}${j.error_message ? `\n      error: ${j.error_message.slice(0, 300)}` : ''}`);
}

const { data: looks } = await db.from('outfits').select('created_at, status, occasion, items, reasons, generated_image_path').eq('user_id', u.id).gte('created_at', since).order('created_at');
console.log(`\nLooks since ${t(since)}:`);
for (const o of looks || []) {
  const from = [...new Set((o.items || []).map((i) => (i.photo_id ? name.get(i.photo_id) || '?' : null)).filter(Boolean))].join(' ');
  console.log(`  ${t(o.created_at)}  ${o.status.padEnd(7)} ${(o.occasion || '').padEnd(22)} ${from ? `photos ${from}  ` : ''}${(o.items || []).map((i) => i.description).join(' | ').slice(0, 110)}`
    + `${o.reasons ? `\n      why: ${JSON.stringify(o.reasons).slice(0, 200)}` : ''}${o.status === 'ready' && !o.generated_image_path?.endsWith('.webp') ? '  (no cut-out: not shown)' : ''}`);
}
