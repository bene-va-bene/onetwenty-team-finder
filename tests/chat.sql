-- Run in a rollback-only transaction, after the messaging migration.
begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.sender',gen_random_uuid()::text,true),set_config('test.stranger',gen_random_uuid()::text,true),set_config('test.listing',gen_random_uuid()::text,true),set_config('test.request',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,created_at) select current_setting('test.'||v)::uuid,v||'.'||current_setting('test.listing')||'@example.invalid',now(),now()-interval '11 months' from unnest(array['owner','sender','stranger']) v;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
select public.save_listing(current_setting('test.listing')::uuid,'{"type":"rider","name":"Chat fixture","region":"Test","description":"Test","languages":"EN","riderGender":"Woman","categories":["Mixed"],"vibes":["Let’s shred"]}',0,true,true,false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.sender'),'role','authenticated')::text,true);
select set_config('test.thread',public.send_chat(current_setting('test.listing')::uuid,current_setting('test.request')::uuid,'Hello','Rider without a listing')::text,true);
do $$ declare t uuid:=current_setting('test.thread')::uuid; data jsonb; begin
 if public.send_chat(current_setting('test.listing')::uuid,current_setting('test.request')::uuid,'Hello','Rider without a listing')<>t then raise exception 'FAIL retry'; end if;
 data:=public.read_chat(t);
 if jsonb_array_length(data)<>1 or data::text like '%@example.invalid%' or not (data->0->>'mine')::boolean then raise exception 'FAIL sender read/privacy'; end if;
 if public.chat_unread()<>0 then raise exception 'FAIL own unread'; end if;
 begin perform * from private.chat_messages; raise exception 'FAIL direct read'; exception when insufficient_privilege then null; end;
 begin perform public.send_chat(current_setting('test.listing')::uuid,current_setting('test.request')::uuid,'Changed','Same'); raise exception 'FAIL mismatched retry'; exception when others then if sqlerrm<>'Invalid message request.' then raise; end if; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.stranger'),'role','authenticated')::text,true);
do $$ declare t uuid:=current_setting('test.thread')::uuid; begin
 if public.chat_inbox()<>'[]'::jsonb then raise exception 'FAIL stranger inbox'; end if;
 begin perform public.read_chat(t); raise exception 'FAIL stranger read'; exception when insufficient_privilege then null; end;
 begin perform public.reply_chat(t,gen_random_uuid(),'Intrusion'); raise exception 'FAIL stranger reply'; exception when insufficient_privilege then null; end;
 begin perform public.seen_chat(t,1); raise exception 'FAIL stranger ack'; exception when insufficient_privilege then null; end;
 begin perform public.block_chat(t,true); raise exception 'FAIL stranger block'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 begin perform public.chat_inbox(); raise exception 'FAIL anon inbox'; exception when insufficient_privilege then null; end;
 begin perform public.read_chat(current_setting('test.thread')::uuid); raise exception 'FAIL anon read'; exception when insufficient_privilege then null; end;
 begin perform public.send_chat(current_setting('test.listing')::uuid,gen_random_uuid(),'Hi','Anonymous'); raise exception 'FAIL anon send'; exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
do $$ declare t uuid:=current_setting('test.thread')::uuid; data jsonb; begin
 if public.chat_unread()<>1 then raise exception 'FAIL owner unread'; end if;
 data:=public.read_chat(t);
 perform public.seen_chat(t,(data->0->>'id')::bigint);
 if public.chat_unread()<>0 then raise exception 'FAIL ack'; end if;
 perform public.reply_chat(t,gen_random_uuid(),'Welcome');
 perform public.block_chat(t,true);
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.sender'),'role','authenticated')::text,true);
do $$ begin
 if public.chat_unread()<>1 then raise exception 'FAIL reply unread'; end if;
 begin perform public.reply_chat(current_setting('test.thread')::uuid,gen_random_uuid(),'Blocked'); raise exception 'FAIL blocked send'; exception when others then if sqlerrm<>'Messaging is paused in this conversation.' then raise; end if; end;
 perform public.block_chat(current_setting('test.thread')::uuid,false);
 begin perform public.reply_chat(current_setting('test.thread')::uuid,gen_random_uuid(),'Still blocked'); raise exception 'FAIL unblock peer'; exception when others then if sqlerrm<>'Messaging is paused in this conversation.' then raise; end if; end;
end $$;
reset role;
update private.conversations set owner_blocked=false where id=current_setting('test.thread')::uuid;
update private.listings set status='closed' where id=current_setting('test.listing')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.sender'),'role','authenticated')::text,true);
select public.reply_chat(current_setting('test.thread')::uuid,gen_random_uuid(),'Continue after closing');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.stranger'),'role','authenticated')::text,true);
do $$ begin
 begin perform public.send_chat(current_setting('test.listing')::uuid,gen_random_uuid(),'Closed','Stranger'); raise exception 'FAIL start closed'; exception when others then if sqlerrm<>'This listing is no longer available.' then raise; end if; end;
end $$;
reset role;
update auth.users set email_confirmed_at=null where id=current_setting('test.stranger')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.stranger'),'role','authenticated')::text,true);
do $$ begin
 begin perform public.chat_inbox(); raise exception 'FAIL unverified account'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Fill a history to verify bounded paging and sender throttling.
insert into private.chat_messages(conversation_id,sender_id,request_id,body) select current_setting('test.thread')::uuid,current_setting('test.sender')::uuid,gen_random_uuid(),'History '||n from generate_series(1,60) n;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.sender'),'role','authenticated')::text,true);
do $$ declare data jsonb; older jsonb; begin
 data:=public.read_chat(current_setting('test.thread')::uuid);
 older:=public.read_chat(current_setting('test.thread')::uuid,(data->0->>'id')::bigint);
 if jsonb_array_length(data)<>50 or jsonb_array_length(older)<>13 then raise exception 'FAIL pagination'; end if;
 if public.read_chat(current_setting('test.thread')::uuid,null,(older->12->>'id')::bigint)<>data then raise exception 'FAIL forward cursor'; end if;
 begin perform public.reply_chat(current_setting('test.thread')::uuid,gen_random_uuid(),'Rate'); raise exception 'FAIL rate limit'; exception when others then if sqlerrm<>'Too many messages. Please try again later.' then raise; end if; end;
end $$;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.cleanup_accounts();
reset role;
do $$ begin
 if exists(select 1 from private.account_cleanup where user_id=current_setting('test.sender')::uuid) then raise exception 'FAIL active chat account cleanup'; end if;
end $$;
update private.listings set expires_at=now()-interval '1 second' where id=current_setting('test.listing')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.sender'),'role','authenticated')::text,true);
do $$ begin
 if public.chat_inbox()<>'[]'::jsonb then raise exception 'FAIL expiry'; end if;
 begin perform public.read_chat(current_setting('test.thread')::uuid); raise exception 'FAIL expired read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from private.listings where id=current_setting('test.listing')::uuid;
do $$ begin
 if exists(select 1 from private.chat_messages where conversation_id=current_setting('test.thread')::uuid) or exists(select 1 from private.conversations where id=current_setting('test.thread')::uuid) then raise exception 'FAIL cascade'; end if;
end $$;
rollback;

select 'PASS participant privacy, verified accounts, idempotency, unread, blocks, pagination, rate limits, expiry and cascade' as result;
