-- Chat moderation for the developer: run once in the Supabase SQL editor (after chat.sql).
-- admin_delete_chat(key, ids): deletes the given message ids, or every message when ids is null.
-- The server checks the developer code itself (only its salted SHA-256 is stored here).
create or replace function public.admin_delete_chat(p_key text, p_ids bigint[]) returns integer language plpgsql security definer set search_path = public as $$ declare n integer; begin if encode(sha256(convert_to('#ashen-admin' || upper(btrim(p_key)), 'UTF8')), 'hex') <> 'ae375075c3bc035551946756109fa2fcfda9798a59872242d1f7ddd14223fd00' then raise exception 'denied'; end if; if p_ids is null then delete from chat where true; else delete from chat where id = any(p_ids); end if; get diagnostics n = row_count; return n; end $$;
grant execute on function public.admin_delete_chat(text, bigint[]) to anon;
