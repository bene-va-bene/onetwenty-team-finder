-- Run as postgres. Fixture-only assertions; no SMTP and no retained user data.
begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous,created_at) values
('11111111-1111-4111-8111-111111111111','owner@example.invalid',now(),false,now()),
('22222222-2222-4222-8222-222222222222','sender@example.invalid',now(),false,now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select public.save_listing('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"type":"rider","name":"Fixture","region":"Test","description":"Test","languages":"EN","riderGender":"Woman","categories":["Mixed"],"vibes":["Let’s shred"]}',0,true,true,false);
do $$ begin
 begin perform public.enqueue_contact('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'Self'); raise exception 'FAIL self'; exception when others then if SQLERRM<>'Messages have moved into the app. Please refresh the Team Finder.' then raise; end if; end;
 begin perform public.mail_claim(null); raise exception 'FAIL privileged claim'; exception when insufficient_privilege then null; end;
 begin perform * from private.mail_jobs; raise exception 'FAIL direct read'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$ begin
 begin perform public.enqueue_contact('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'Hello'); raise exception 'FAIL legacy contact'; exception when others then if SQLERRM<>'Messages have moved into the app. Please refresh the Team Finder.' then raise; end if; end;
end $$;
reset role;
insert into private.mail_jobs(listing_id,kind,milestone,expires_at) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','reminder',2,now()+interval '6 months');
select set_config('test.reminder',(select id::text from private.mail_jobs where listing_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and milestone=2),true);
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 begin perform public.enqueue_contact('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'Hello'); raise exception 'FAIL anon send'; exception when insufficient_privilege then null; end;
 begin perform public.expired_listings(); raise exception 'FAIL anon worker'; exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare j jsonb; begin
 j:=public.mail_claim(current_setting('test.reminder')::uuid);
 if j->>'to'<>'owner@example.invalid' or j->>'replyTo' is not null then raise exception 'FAIL addresses'; end if;
 if public.mail_claim((j->>'id')::uuid) is not null then raise exception 'FAIL duplicate claim'; end if;
 perform public.mail_finish((j->>'id')::uuid,'sent');
 if public.mail_claim((j->>'id')::uuid) is not null then raise exception 'FAIL resend'; end if;
end $$;
reset role;
do $$ begin if exists(select 1 from private.mail_jobs where request_id='33333333-3333-4333-8333-333333333333' and body is not null) then raise exception 'FAIL retained body'; end if; end $$;
update private.listings set published_at=now()-interval '4 months 1 day',expires_at=now()+interval '6 months' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role service_role;
do $$ begin
 if not public.lifecycle_prepare('44444444-4444-4444-8444-444444444444') then raise exception 'FAIL lock'; end if;
 if public.lifecycle_prepare(gen_random_uuid()) then raise exception 'FAIL double lock'; end if;
 perform public.lifecycle_release('44444444-4444-4444-8444-444444444444');
end $$;
reset role;
do $$ begin
 if (select count(*) from private.mail_jobs where listing_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and milestone=4)<>1 then raise exception 'FAIL calendar reminder'; end if;
end $$;
select set_config('test.closed_reminder',(select id::text from private.mail_jobs where listing_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and milestone=4),true);
-- Close while queued: a reminder/contact must not be sent afterwards.
update private.listings set status='closed' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role service_role;
do $$ begin
 if public.mail_claim(current_setting('test.closed_reminder')::uuid) is not null then raise exception 'FAIL closed delivery'; end if;
end $$;
reset role;
update private.listings set expires_at=now()-interval '1 second' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ begin if private.can_upload_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'FAIL expired upload'; end if; end $$;
reset role;
savepoint storage_fixture;
insert into storage.objects(bucket_id,name) values('listing-photos','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/55555555-5555-4555-8555-555555555555.jpg');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin
 begin perform public.purge_listing('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); raise exception 'FAIL orphaned photo'; exception when others then if SQLERRM<>'Storage cleanup incomplete' then raise; end if; end;
end $$;
reset role;
rollback to storage_fixture;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin perform public.purge_listing('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); end $$;
reset role;
do $$ begin
 if exists(select 1 from private.listings where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') or exists(select 1 from private.consents where listing_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') or exists(select 1 from private.mail_jobs where listing_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'FAIL cascade cleanup'; end if;
 if not exists(select 1 from private.account_cleanup where user_id='11111111-1111-4111-8111-111111111111') then raise exception 'FAIL account cleanup'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ begin
 begin perform public.my_listings(); raise exception 'FAIL retiring account still active'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS retired contact RPC, reminder privacy, duplicate claims, reminder date, close, expiry, storage retry, cascades, account gate' as result;
