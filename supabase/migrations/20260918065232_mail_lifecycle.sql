-- Private outbox: emails are resolved from auth.users only when the server claims a job.
create table private.mail_jobs (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references private.listings(id) on delete cascade,
 sender_id uuid references auth.users(id) on delete cascade,
 kind text not null check(kind in ('contact','reminder')),
 body text check(body is null or length(body) between 1 and 1500),
 request_id uuid unique,
 milestone integer check(milestone in (2,4,6,8)),
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','uncertain','cancelled')),
 attempts integer not null default 0,
 created_at timestamptz not null default now(),
 attempted_at timestamptz,
 retry_at timestamptz not null default now(),
 expires_at timestamptz not null,
 unique(listing_id,milestone),
 check((kind='contact' and sender_id is not null and request_id is not null and milestone is null)
   or (kind='reminder' and sender_id is null and request_id is null and milestone is not null))
);
create index mail_sender_created on private.mail_jobs(sender_id,created_at);
create index mail_listing_created on private.mail_jobs(listing_id,created_at);
create index mail_pending on private.mail_jobs(retry_at) where state in ('pending','failed');
create index listings_expiry on private.listings(expires_at);
create table private.account_cleanup (user_id uuid primary key references auth.users(id) on delete cascade);
create table private.worker_lock (id boolean primary key default true check(id), token uuid, until_at timestamptz not null default now());
insert into private.worker_lock(id) values(true);
alter table private.mail_jobs enable row level security;
alter table private.account_cleanup enable row level security;
alter table private.worker_lock enable row level security;
create policy mail_server_only on private.mail_jobs using(false);
create policy cleanup_server_only on private.account_cleanup using(false);
create policy lock_server_only on private.worker_lock using(false);
revoke all on private.mail_jobs,private.account_cleanup,private.worker_lock from public,anon,authenticated;

create or replace function private.require_user() returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null and not coalesce(is_anonymous,false) and (banned_until is null or banned_until<now()))
 or exists(select 1 from private.account_cleanup where user_id=uid) then
  raise exception 'Please confirm your email and sign in again.' using errcode='42501';
 end if;
 return uid;
end $$;

-- Same owner lock as save_listing closes the create/account-cleanup race.
create function private.guard_listing_account() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,0));
 if exists(select 1 from private.account_cleanup where user_id=new.owner_id) then raise exception 'Account cleanup in progress. Please sign in again later.'; end if;
 return new;
end $$;
create trigger listing_account_guard before insert on private.listings for each row execute function private.guard_listing_account();

-- An expired listing cannot receive further uploads while its storage is being removed.
drop policy photo_insert on storage.objects;
create function private.can_upload_photo(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from private.listings where id=p_id and owner_id=auth.uid() and (expires_at is null or expires_at>now()) for share;
 return found and not exists(select 1 from private.account_cleanup where user_id=auth.uid());
end;
$$;
create policy photo_insert on storage.objects for insert to authenticated with check(bucket_id='listing-photos' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and private.can_upload_photo((split_part(name,'/',1))::uuid));

create function private.enqueue_contact(p_listing uuid,p_request uuid,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); l private.listings; j private.mail_jobs;
begin
 if p_request is null or p_body is null or length(trim(p_body)) not between 1 and 1500 then raise exception 'Please write a message of up to 1500 characters.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 perform private.require_user();
 select * into j from private.mail_jobs where request_id=p_request;
 if found then
  if j.sender_id<>uid or j.listing_id<>p_listing or (j.body is not null and j.body<>trim(p_body)) then raise exception 'Invalid request.'; end if;
  return jsonb_build_object('id',j.id,'state',j.state);
 end if;
 select * into l from private.listings where id=p_listing and status='active' and expires_at>now() for update;
 if not found then raise exception 'This listing is no longer available.'; end if;
 if l.owner_id=uid then raise exception 'This is your own listing.'; end if;
 if (select count(*) from private.mail_jobs where sender_id=uid and created_at>now()-interval '1 hour')>=5
 or (select count(*) from private.mail_jobs where sender_id=uid and created_at>now()-interval '24 hours')>=20
 or exists(select 1 from private.mail_jobs where sender_id=uid and listing_id=p_listing and created_at>now()-interval '1 minute') then
  raise exception 'Too many messages. Please try again later.' using errcode='P0002';
 end if;
 if (select count(*) from private.mail_jobs where listing_id=p_listing and kind='contact' and created_at>now()-interval '24 hours')>=50 then
  raise exception 'This listing has received many messages today. Please try again tomorrow.' using errcode='P0002';
 end if;
 insert into private.mail_jobs(listing_id,sender_id,kind,body,request_id,expires_at)
 values(p_listing,uid,'contact',trim(p_body),p_request,least(l.expires_at,now()+interval '10 months')) returning * into j;
 return jsonb_build_object('id',j.id,'state',j.state);
end $$;
create function public.enqueue_contact(p_listing uuid,p_request uuid,p_body text) returns jsonb language sql security invoker set search_path='' as $$ select private.enqueue_contact(p_listing,p_request,p_body); $$;

-- Server functions have an explicit service-role check AND execute grants only to service_role.
create function private.require_worker() returns void language plpgsql set search_path='' as $$
begin if coalesce(auth.role(),'')<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if; end $$;

create function private.mail_claim(p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.mail_jobs; l private.listings; recipient text; sender text;
begin
 perform private.require_worker();
 update private.mail_jobs mj set state='cancelled',body=null where state in ('pending','failed') and exists(select 1 from private.listings lst where lst.id=mj.listing_id and (lst.status<>'active' or lst.expires_at<=now()));
 select * into j from private.mail_jobs where (p_id is null or id=p_id) and state in ('pending','failed') and attempts<3 and retry_at<=now() and expires_at>now()
 order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 select * into l from private.listings where id=j.listing_id;
 select email into recipient from auth.users where id=l.owner_id and email_confirmed_at is not null and (banned_until is null or banned_until<now());
 if j.sender_id is not null then select email into sender from auth.users where id=j.sender_id and email_confirmed_at is not null and (banned_until is null or banned_until<now()); end if;
 if l.status<>'active' or l.expires_at<=now() or recipient is null or (j.kind='contact' and sender is null) then
  update private.mail_jobs set state='cancelled',body=null where id=j.id; return null;
 end if;
 update private.mail_jobs set state='sending',attempts=attempts+1,attempted_at=now() where id=j.id;
 return jsonb_build_object('id',j.id,'kind',j.kind,'listing_id',l.id,'name',l.name,'to',recipient,'replyTo',sender,'body',j.body,'published_at',l.published_at,'expires_at',l.expires_at);
end $$;
create function private.mail_finish(p_id uuid,p_state text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_worker();
 if p_state not in ('sent','failed','uncertain') then raise exception 'Invalid outcome'; end if;
 update private.mail_jobs set state=p_state,retry_at=now()+interval '1 hour',body=case when p_state='sent' then null else body end where id=p_id and state='sending';
end $$;
create function private.mail_status(p_id uuid) returns text language plpgsql security definer set search_path='' as $$
begin perform private.require_worker(); return (select state from private.mail_jobs where id=p_id); end $$;

create function private.lifecycle_prepare(p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform private.require_worker();
 update private.worker_lock set token=p_token,until_at=now()+interval '2 minutes' where id and until_at<=now();
 if not found then return false; end if;
 -- Never retry an interrupted SMTP attempt automatically: it may already have been accepted.
 update private.mail_jobs set state='uncertain' where state='sending' and attempted_at<now()-interval '15 minutes';
 delete from private.mail_jobs where expires_at<=now();
 -- One current milestone per listing; no burst of old reminders after downtime.
 insert into private.mail_jobs(listing_id,kind,milestone,expires_at)
 select l.id,'reminder',m.months,l.expires_at from private.listings l
 cross join lateral (select max(n) as months from unnest(array[2,4,6,8]) n where ((l.published_at at time zone 'UTC')+make_interval(months=>n)) at time zone 'UTC'<=now()) m
 where l.status='active' and l.expires_at>now() and m.months is not null
 on conflict(listing_id,milestone) do nothing;
 return true;
end $$;
create function private.lifecycle_release(p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_worker(); update private.worker_lock set until_at=now() where token=p_token; end $$;
create function private.expired_listings() returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.require_worker(); return coalesce((select jsonb_agg(id) from (select id from private.listings where expires_at<=now() order by expires_at limit 100) s),'[]'); end $$;
create function private.purge_listing(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 perform private.require_worker();
 select owner_id into uid from private.listings where id=p_id and expires_at<=now();
 if not found then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 perform 1 from private.listings where id=p_id for update;
 if exists(select 1 from storage.objects where bucket_id='listing-photos' and split_part(name,'/',1)=p_id::text) then raise exception 'Storage cleanup incomplete'; end if;
 delete from private.listings where id=p_id and expires_at<=now();
 if not exists(select 1 from private.listings where owner_id=uid) and not exists(select 1 from private.mail_jobs where sender_id=uid) then
  insert into private.account_cleanup values(uid) on conflict do nothing;
 end if;
end $$;
create function private.cleanup_accounts() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 perform private.require_worker();
 for uid in select u.id from auth.users u where u.created_at<now()-interval '10 months' and not exists(select 1 from private.listings l where l.owner_id=u.id) and not exists(select 1 from private.mail_jobs j where j.sender_id=u.id) limit 100 loop
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if not exists(select 1 from private.listings where owner_id=uid) and not exists(select 1 from private.mail_jobs where sender_id=uid) then insert into private.account_cleanup values(uid) on conflict do nothing; end if;
 end loop;
 return coalesce((select jsonb_agg(user_id) from private.account_cleanup),'[]');
end $$;

create function public.mail_claim(p_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.mail_claim(p_id); $$;
create function public.mail_finish(p_id uuid,p_state text) returns void language sql security invoker set search_path='' as $$ select private.mail_finish(p_id,p_state); $$;
create function public.mail_status(p_id uuid) returns text language sql security invoker set search_path='' as $$ select private.mail_status(p_id); $$;
create function public.lifecycle_prepare(p_token uuid) returns boolean language sql security invoker set search_path='' as $$ select private.lifecycle_prepare(p_token); $$;
create function public.lifecycle_release(p_token uuid) returns void language sql security invoker set search_path='' as $$ select private.lifecycle_release(p_token); $$;
create function public.expired_listings() returns jsonb language sql security invoker set search_path='' as $$ select private.expired_listings(); $$;
create function public.purge_listing(p_id uuid) returns void language sql security invoker set search_path='' as $$ select private.purge_listing(p_id); $$;
create function public.cleanup_accounts() returns jsonb language sql security invoker set search_path='' as $$ select private.cleanup_accounts(); $$;

revoke all on function private.can_upload_photo(uuid),private.guard_listing_account(),private.enqueue_contact(uuid,uuid,text),public.enqueue_contact(uuid,uuid,text),private.require_worker(),private.mail_claim(uuid),private.mail_finish(uuid,text),private.mail_status(uuid),private.lifecycle_prepare(uuid),private.lifecycle_release(uuid),private.expired_listings(),private.purge_listing(uuid),private.cleanup_accounts(),public.mail_claim(uuid),public.mail_finish(uuid,text),public.mail_status(uuid),public.lifecycle_prepare(uuid),public.lifecycle_release(uuid),public.expired_listings(),public.purge_listing(uuid),public.cleanup_accounts() from public,anon,authenticated;
grant execute on function private.can_upload_photo(uuid),private.enqueue_contact(uuid,uuid,text),public.enqueue_contact(uuid,uuid,text) to authenticated;
grant usage on schema private to service_role;
grant execute on function private.require_worker(),private.mail_claim(uuid),private.mail_finish(uuid,text),private.mail_status(uuid),private.lifecycle_prepare(uuid),private.lifecycle_release(uuid),private.expired_listings(),private.purge_listing(uuid),private.cleanup_accounts(),public.mail_claim(uuid),public.mail_finish(uuid,text),public.mail_status(uuid),public.lifecycle_prepare(uuid),public.lifecycle_release(uuid),public.expired_listings(),public.purge_listing(uuid),public.cleanup_accounts() to service_role;
