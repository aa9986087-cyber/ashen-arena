-- Players delete their own chat messages. Each new message keeps a hash of the sender's device key (owner_hash);
-- delete_my_chat removes a message only when the key matches. Run once in the Supabase SQL editor.
alter table public.chat add column if not exists owner_hash text;
create or replace function public.send_chat(p_name text, p_msg text, p_key text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if char_length(coalesce(p_key, '')) < 16 then raise exception 'bad key'; end if;
  if exists (select 1 from chat where name = btrim(p_name) and created_at > now() - interval '3 seconds') then raise exception 'slow'; end if;
  insert into chat(name, msg, owner_hash)
    values (btrim(p_name), left(btrim(p_msg), 200), encode(sha256(convert_to('#ashen-chat' || p_key, 'UTF8')), 'hex'));
  delete from chat where created_at < now() - interval '2 days';
end $$;
create or replace function public.delete_my_chat(p_id bigint, p_key text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  if char_length(coalesce(p_key, '')) < 16 then raise exception 'bad key'; end if;
  delete from chat where id = p_id and owner_hash = encode(sha256(convert_to('#ashen-chat' || p_key, 'UTF8')), 'hex');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.send_chat(text, text, text) from public;
revoke all on function public.delete_my_chat(bigint, text) from public;
grant execute on function public.send_chat(text, text, text) to anon, authenticated;
grant execute on function public.delete_my_chat(bigint, text) to anon, authenticated;
