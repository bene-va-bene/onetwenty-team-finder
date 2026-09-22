-- Run in a rollback-only transaction, after the messaging migration.
begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.sender',gen_random_uuid()::text,true),set_config('test.stranger',gen_random_uuid()::text,true),set_config('test.listing',gen_random_uuid()::text,true),set_config('test.request',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,created_at) select current_setting('test.'||v)::uuid,v||'.'||current_setting('test.listing')||'@example.invalid',now(),now()-interval '11 months' from unnest(array['owner','sender','stranger']) v;
-- Isolate existing recipients during this rollback-only test.
update private.chat_email_settings set enabled=false;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
select public.save_listing(current_setting('test.listing')::uuid,'{"type":"rider","name":"Chat fixture","region":"Test","description":"Test","languages":"EN","riderGender":"Woman","categories":["Mixed"],"vibes":["Let’s shred"]}',0,true,true,false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.sender'),'role','authenticated')::text,true);
select set_config('test.thread',public.send_chat(current_setting('test.listing')::uuid,current_setting('test.request')::uuid,'Hello','Rider without a listing')::text,true);

-- Sender cannot claim other people's mail or access the queue directly.
do $$ begin
 begin perform public.chat_email_claim(); raise exception 'FAIL worker permissions'; exception when insufficient_privilege then null; end;
 begin perform * from private.chat_email_queue; raise exception 'FAIL direct queue'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$ begin if public.chat_email_claim() is not null then raise exception 'FAIL initial delay'; end if; end $$;
reset role;
update private.chat_messages set created_at=now()-interval '3 minutes' where conversation_id=current_setting('test.thread')::uuid;
set local role service_role;
select set_config('test.claim',(public.chat_email_claim()->>'id'),true);
do $$ begin
 if current_setting('test.claim') is null then raise exception 'FAIL claim'; end if;
 if not public.chat_email_ready(current_setting('test.claim')::uuid) then raise exception 'FAIL ready'; end if;
 if public.chat_email_claim() is not null then raise exception 'FAIL duplicate claim'; end if;
 perform public.chat_email_finish(gen_random_uuid(),'sent');
 if not public.chat_email_ready(current_setting('test.claim')::uuid) then raise exception 'FAIL wrong token'; end if;
 perform public.chat_email_finish(current_setting('test.claim')::uuid,'sent');
 if public.chat_email_claim() is not null then raise exception 'FAIL resend backlog'; end if;
end $$;
reset role;
-- A second message is held by the global recipient cooldown.
insert into private.chat_messages(conversation_id,sender_id,request_id,body,created_at) values(current_setting('test.thread')::uuid,current_setting('test.sender')::uuid,gen_random_uuid(),'Second',now()-interval '3 minutes');
set local role service_role;
do $$ begin if public.chat_email_claim() is not null then raise exception 'FAIL throttle'; end if; end $$;
reset role;
update private.chat_email_settings set last_sent_at=now()-interval '31 minutes' where user_id=current_setting('test.owner')::uuid;
-- Reading before processing suppresses the email.
update private.conversations set owner_seen=(select max(id) from private.chat_messages where conversation_id=current_setting('test.thread')::uuid) where id=current_setting('test.thread')::uuid;
set local role service_role;
do $$ begin if public.chat_email_claim() is not null then raise exception 'FAIL read suppression'; end if; end $$;
reset role;
insert into private.chat_messages(conversation_id,sender_id,request_id,body,created_at) values(current_setting('test.thread')::uuid,current_setting('test.sender')::uuid,gen_random_uuid(),'Third',now()-interval '3 minutes');
set local role service_role;
select set_config('test.claim',(public.chat_email_claim()->>'id'),true);
-- Opt-out is self-only and also stops an already claimed batch at the final eligibility check.
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
do $$ begin
 if not public.chat_email_preference() then raise exception 'FAIL enabled default'; end if;
 if public.chat_email_preference(false) then raise exception 'FAIL opt out'; end if;
end $$;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin
 if public.chat_email_ready(current_setting('test.claim')::uuid) then raise exception 'FAIL opt-out after claim'; end if;
 perform public.chat_email_finish(current_setting('test.claim')::uuid,'skipped');
end $$;
reset role;
insert into private.chat_messages(conversation_id,sender_id,request_id,body,created_at) values(current_setting('test.thread')::uuid,current_setting('test.sender')::uuid,gen_random_uuid(),'While disabled',now()-interval '3 minutes');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.sender'),'role','authenticated')::text,true);
do $$ begin if not public.chat_email_preference() then raise exception 'FAIL isolated preference'; end if; end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
select public.chat_email_preference(true);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin if public.chat_email_claim() is not null then raise exception 'FAIL reenable backlog'; end if; end $$;
reset role;
-- Blocking, expiry and unverified recipients suppress notifications.
insert into private.chat_messages(conversation_id,sender_id,request_id,body,created_at) values(current_setting('test.thread')::uuid,current_setting('test.sender')::uuid,gen_random_uuid(),'Blocked',now()-interval '3 minutes');
update private.conversations set starter_blocked=true where id=current_setting('test.thread')::uuid;
set local role service_role;
do $$ begin if public.chat_email_claim() is not null then raise exception 'FAIL blocked'; end if; end $$;
reset role;
update private.conversations set starter_blocked=false where id=current_setting('test.thread')::uuid;
insert into private.chat_messages(conversation_id,sender_id,request_id,body,created_at) values(current_setting('test.thread')::uuid,current_setting('test.sender')::uuid,gen_random_uuid(),'Unverified',now()-interval '3 minutes');
update auth.users set email_confirmed_at=null where id=current_setting('test.owner')::uuid;
set local role service_role;
do $$ begin if public.chat_email_claim() is not null then raise exception 'FAIL unverified'; end if; end $$;
reset role;
update auth.users set email_confirmed_at=now() where id=current_setting('test.owner')::uuid;
-- Bounded safe retry; new messages arriving during a claim stay queued separately.
insert into private.chat_messages(conversation_id,sender_id,request_id,body,created_at) values(current_setting('test.thread')::uuid,current_setting('test.sender')::uuid,gen_random_uuid(),'Retry',now()-interval '3 minutes');
set local role service_role;
select set_config('test.claim',(public.chat_email_claim()->>'id'),true);
select public.chat_email_finish(current_setting('test.claim')::uuid,'failed');
do $$ begin if public.chat_email_claim() is not null then raise exception 'FAIL retry backoff'; end if; end $$;
reset role;
update private.chat_email_settings set retry_at=now() where user_id=current_setting('test.owner')::uuid;
set local role service_role;
select set_config('test.claim',(public.chat_email_claim()->>'id'),true);
select public.chat_email_finish(current_setting('test.claim')::uuid,'failed');
reset role;
update private.chat_email_settings set retry_at=now() where user_id=current_setting('test.owner')::uuid;
set local role service_role;
select set_config('test.claim',(public.chat_email_claim()->>'id'),true);
select public.chat_email_finish(current_setting('test.claim')::uuid,'failed');
do $$ begin if public.chat_email_claim() is not null then raise exception 'FAIL retry limit'; end if; end $$;
reset role;
insert into private.chat_messages(conversation_id,sender_id,request_id,body,created_at) values(current_setting('test.thread')::uuid,current_setting('test.sender')::uuid,gen_random_uuid(),'Uncertain',now()-interval '3 minutes');
set local role service_role;
select set_config('test.claim',(public.chat_email_claim()->>'id'),true);
reset role;
insert into private.chat_messages(conversation_id,sender_id,request_id,body,created_at) values(current_setting('test.thread')::uuid,current_setting('test.sender')::uuid,gen_random_uuid(),'After claim',now()-interval '3 minutes');
update private.chat_email_settings set claimed_at=now()-interval '16 minutes' where user_id=current_setting('test.owner')::uuid;
set local role service_role;
do $$ begin if public.chat_email_claim() is not null then raise exception 'FAIL stale lease throttle'; end if; end $$;
reset role;
do $$ begin
 if (select count(*) from private.chat_email_queue where recipient_id=current_setting('test.owner')::uuid)<>1 then raise exception 'FAIL new message preserved'; end if;
end $$;
update private.chat_email_settings set last_sent_at=now()-interval '31 minutes' where user_id=current_setting('test.owner')::uuid;
set local role service_role;
select set_config('test.claim',(public.chat_email_claim()->>'id'),true);
do $$ begin if not public.chat_email_ready(current_setting('test.claim')::uuid) then raise exception 'FAIL new message claim'; end if; end $$;
reset role;
update private.listings set expires_at=now()-interval '1 minute' where id=current_setting('test.listing')::uuid;
set local role service_role;
do $$ begin if public.chat_email_ready(current_setting('test.claim')::uuid) then raise exception 'FAIL expiry'; end if; end $$;
reset role;
delete from private.listings where id=current_setting('test.listing')::uuid;
set local role service_role;
do $$ begin if public.chat_email_ready(current_setting('test.claim')::uuid) then raise exception 'FAIL deletion'; end if; end $$;
reset role;
do $$ begin if exists(select 1 from private.chat_email_queue where recipient_id=current_setting('test.owner')::uuid) then raise exception 'FAIL cascade'; end if; end $$;
rollback;
select 'chat notification checks passed (fixtures rolled back)' as result;
