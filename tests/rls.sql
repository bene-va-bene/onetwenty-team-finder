-- Run as postgres; all synthetic users and listings are rolled back.
begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
('11111111-1111-4111-8111-111111111111','owner-a@example.invalid',now(),false),
('22222222-2222-4222-8222-222222222222','owner-b@example.invalid',now(),false);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select public.save_listing('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '{"type":"rider","name":"Test rider","region":"Test city","description":"A rollback-only fixture","languages":"EN","riderGender":"Woman","categories":["Women","Mixed"],"vibes":["Let’s shred"],"age":34}',0,true,true,false);
do $$ declare listing jsonb; begin
  listing := public.my_listings()->0;
  if listing->>'status' <> 'active' or listing ? 'owner_id' or listing ? 'email' then raise exception 'FAIL: owner/public field boundary'; end if;
  begin
    perform public.save_listing('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{}',0,true,true,false);
    raise exception 'FAIL: stale revision accepted';
  exception when others then if SQLERRM not like 'This listing changed%' then raise; end if; end;
  begin
    perform public.save_listing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{"type":"team","name":"Test","region":"Test","description":"Test","languages":"EN","categories":["Mixed"],"vibes":["Let’s shred"]}',0,true,true,false);
    raise exception 'FAIL: missing team fields accepted';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$ begin
  if public.my_listings() <> '[]'::jsonb then raise exception 'FAIL: another owner sees listing'; end if;
  begin perform public.set_listing_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','closed',1); raise exception 'FAIL: cross-owner change'; exception when insufficient_privilege then null; end;
  begin perform public.delete_listing('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1); raise exception 'FAIL: cross-owner deletion'; exception when insufficient_privilege then null; end;
  begin perform public.save_listing('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{}',1,true,true,false); raise exception 'FAIL: cross-owner save'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare listing jsonb; begin
  listing := public.list_public_listings()->0;
  if listing is null or listing ? 'owner_id' or listing ? 'email' then raise exception 'FAIL: public contract'; end if;
  begin perform * from private.listings; raise exception 'FAIL: anon direct table read'; exception when insufficient_privilege then null; end;
  begin perform public.my_listings(); raise exception 'FAIL: anon reads owners'; exception when insufficient_privilege then null; end;
  begin perform public.set_listing_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','closed',1); raise exception 'FAIL: anon writes'; exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ declare original jsonb; reopened jsonb; begin
  original := public.my_listings()->0;
  perform public.set_listing_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','closed',1);
  if public.public_listing('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is not null then raise exception 'FAIL: closed listing public'; end if;
  reopened := public.set_listing_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active',2);
  if reopened->>'expires_at' <> original->>'expires_at' then raise exception 'FAIL: reopen extends expiry'; end if;
end $$;
reset role;
update private.listings set expires_at=now()-interval '1 day' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
do $$ begin
  if public.public_listing('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is not null then raise exception 'FAIL: expired listing public'; end if;
  begin perform public.set_listing_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active',3); raise exception 'FAIL: reopen expired'; exception when others then if SQLERRM not like 'Use the form%' then raise; end if; end;
  perform public.set_listing_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','closed',3);
  perform public.delete_listing('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',4);
  if public.my_listings()<>'[]'::jsonb then raise exception 'FAIL: deletion'; end if;
end $$;
rollback;
select 'PASS: ownership, public/private fields, anonymous access, validation, revision conflicts, closure, immutable expiry, expiry enforcement and deletion' as result;
