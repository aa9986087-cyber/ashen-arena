import fs from 'node:fs';
// Read-only output. Never connects to Supabase. Source definitions remain canonical.
console.log('-- Review and apply to a TEST database first. Do not rerun entire initial-schema files.');
for (const [file, name] of [
  ['supabase/chat-admin.sql', 'admin_delete_chat'],
  ['supabase/duels.sql', 'admin_delete_duels'],
]) {
  const text = fs.readFileSync(file, 'utf8');
  const fn = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?end \\$\\$;`, 'i').exec(text)?.[0];
  if (!fn || !/is distinct from/i.test(fn)) throw new Error(`Unsafe or missing guard in ${file}`);
  console.log('\n' + fn);
}
