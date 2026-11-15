import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
for (const [file, fn] of [
  ['supabase/chat-admin.sql', 'admin_delete_chat'],
  ['supabase/duels.sql', 'admin_delete_duels'],
]) {
  test(`${fn}: NULL-safe key guard exists before every administrative delete`, () => {
    const sql = fs.readFileSync(file, 'utf8');
    const body = new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?end \\$\\$;`, 'i').exec(sql)?.[0];
    assert.ok(body, `missing canonical function ${fn}`);
    const firstDelete = body.indexOf('delete from');
    const guard = body.slice(0, firstDelete);
    assert.match(guard, /is distinct from/i, 'NULL must be denied instead of yielding UNKNOWN from <>');
    assert.match(guard, /raise exception 'denied'/i);
  });
}
