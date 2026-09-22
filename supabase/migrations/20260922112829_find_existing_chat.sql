-- Resolve only the caller's own conversation with a listing, never another rider's.
create function private.find_existing_chat(p_listing uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=private.require_user(); result uuid;
begin
 select c.id into result from private.conversations c join private.listings l on l.id=c.listing_id
 where c.listing_id=p_listing and c.starter_id=uid and l.expires_at>now();
 return result;
end $$;
create function public.find_existing_chat(p_listing uuid) returns uuid
language sql stable security invoker set search_path='' as $$ select private.find_existing_chat(p_listing) $$;
revoke all on function private.find_existing_chat(uuid),public.find_existing_chat(uuid) from public,anon,authenticated;
grant execute on function private.find_existing_chat(uuid),public.find_existing_chat(uuid) to authenticated;
