-- Existing listing IDs and conversations remain intact. One canonical rider per account.
alter table private.listings add column looking boolean not null default true;
create unique index one_rider_per_account on private.listings(owner_id) where type='rider';
alter table private.listings drop constraint listings_region_check,drop constraint listings_description_check,drop constraint listings_languages_check,drop constraint listings_categories_check,drop constraint listings_vibes_check,drop constraint "listings_ridersNeeded_check",drop constraint listings_check;
alter table private.listings add check(length(trim(region))<=100),add check(length(trim(description))<=700),add check(length(trim(languages))<=100),
 add check(cardinality(categories)<=2 and categories <@ array['Men','Women','Mixed']),
 add check(cardinality(vibes)<=5 and vibes <@ array['Just for the views','Good times, good pace','Sporty but social','Let’s shred','Race to win']),
 add check("ridersNeeded" between 0 and 5),
 add check(coalesce((type='team' and age is null and "riderGender" is null and "ridersNeeded" is not null and cardinality(categories)=1 and seeking in ('Anyone','Women','Men') and (categories=array['Mixed'] or seeking=categories[1]))
 or (type='rider' and "ridersNeeded" is null and seeking is null and (("riderGender" is null and cardinality(categories)=0) or ("riderGender" in ('Woman','Man') and categories <@ case when "riderGender"='Woman' then array['Women','Mixed'] else array['Men','Mixed'] end))),false));

create table private.team_members (
 team_id uuid not null references private.listings(id) on delete cascade,
 rider_id uuid not null references private.listings(id) on delete cascade,
 state text not null check(state in ('pending','accepted','declined','cancelled','left','removed')),
 requested_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(team_id,rider_id),check(team_id<>rider_id)
);
create unique index one_team_per_rider on private.team_members(rider_id) where state='accepted';
create index team_members_rider on private.team_members(rider_id);
alter table private.team_members enable row level security;
revoke all on private.team_members from public,anon,authenticated;

create table private.paddock_events (
 id uuid primary key default gen_random_uuid(),recipient_id uuid not null references auth.users(id) on delete cascade,
 team_id uuid not null references private.listings(id) on delete cascade,
 rider_id uuid not null references private.listings(id) on delete cascade,
 kind text not null check(kind in ('requested','accepted','declined','removed')),
 created_at timestamptz not null default now(),seen boolean not null default false,email_done boolean not null default false,claim uuid
);
create index paddock_events_recipient on private.paddock_events(recipient_id,created_at desc);
create index paddock_events_mail on private.paddock_events(recipient_id) where not email_done;
alter table private.paddock_events enable row level security;
revoke all on private.paddock_events from public,anon,authenticated;
create table private.feature_permissions (
 listing_id uuid primary key references private.listings(id) on delete cascade,
 allowed boolean not null default false,version text not null default 'paddock-feature-v1',
 listing_revision integer not null,recorded_at timestamptz not null default now()
);
alter table private.feature_permissions enable row level security;
revoke all on private.feature_permissions from public,anon,authenticated;
create or replace function private.save_listing(p_id uuid, p_data jsonb, p_revision integer, p_publish boolean, p_consent boolean, p_photo_consent boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user(); old private.listings; saved private.listings; first_publish timestamptz; photo text;
begin
  if p_id is null or p_revision is null or p_publish is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid listing request.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into old from private.listings where id = p_id for update;
  if found then
    if old.owner_id <> uid then raise exception 'Listing not found.' using errcode='42501'; end if;
    if old.type <> p_data->>'type' then raise exception 'A profile cannot change between rider and team.'; end if;
    if old.revision <> p_revision then raise exception 'This listing changed in another window. Reload My listings and try again.'; end if;
    if not p_publish and old.status <> 'draft' then raise exception 'Please preview and confirm publication before saving.'; end if;
    if old.expires_at <= now() then raise exception 'This listing has reached its ten-month limit. Please create a new listing.'; end if;
  else
    if p_data->>'type'='rider' and exists(select 1 from private.listings where owner_id=uid and type='rider') then raise exception 'You already have a rider profile. Open My Paddock to edit it.'; end if;
    if p_revision <> 0 then raise exception 'Listing not found.'; end if;
    if (select count(*) from private.listings where owner_id = uid) >= 3 then raise exception 'You can keep up to three listings. Please delete an old one first.'; end if;
  end if;
  if p_publish and not coalesce(p_consent,false) then raise exception 'Please agree to publication.'; end if;
  photo := nullif(p_data->>'image_path','');
  if photo is not null then
    if split_part(photo,'/',1) <> p_id::text or not exists(select 1 from storage.objects where bucket_id='listing-photos' and name=photo) then raise exception 'Photo not found. Please choose it again.'; end if;
    if p_publish and not coalesce(p_photo_consent,false) then raise exception 'Please confirm that you may publish the photo.'; end if;
  end if;
  first_publish := coalesce(old.published_at, case when p_publish then now() end);
  insert into private.listings (id,owner_id,type,name,region,description,languages,age,"ridersNeeded","riderGender",seeking,categories,vibes,strava,instagram,image_path,status,revision,published_at,expires_at,looking)
  values (p_id,uid,p_data->>'type',trim(p_data->>'name'),trim(p_data->>'region'),trim(p_data->>'description'),trim(p_data->>'languages'),
    case when p_data->>'type'='rider' then nullif(p_data->>'age','')::integer end,
    case when p_data->>'type'='team' then (p_data->>'ridersNeeded')::integer end,
    case when p_data->>'type'='rider' then p_data->>'riderGender' end,
    case when p_data->>'type'='team' then p_data->>'seeking' end,
    array(select distinct jsonb_array_elements_text(p_data->'categories')),
    array(select distinct jsonb_array_elements_text(p_data->'vibes')),
    coalesce(p_data->>'strava',''),coalesce(p_data->>'instagram',''),photo,
    case when p_publish then 'active' else coalesce(old.status,'draft') end,coalesce(old.revision,0)+1,first_publish,
    coalesce(old.expires_at, (first_publish at time zone 'UTC' + interval '10 months') at time zone 'UTC'),
    case when exists(select 1 from private.team_members where rider_id=p_id and state='accepted') then false else coalesce((p_data->>'looking')::boolean,old.looking,true) end)
  on conflict(id) do update set type=excluded.type,name=excluded.name,region=excluded.region,description=excluded.description,languages=excluded.languages,
    age=excluded.age,"ridersNeeded"=excluded."ridersNeeded","riderGender"=excluded."riderGender",seeking=excluded.seeking,categories=excluded.categories,vibes=excluded.vibes,
    strava=excluded.strava,instagram=excluded.instagram,image_path=excluded.image_path,status=excluded.status,revision=excluded.revision,
    published_at=excluded.published_at,expires_at=excluded.expires_at,updated_at=now(),looking=excluded.looking
  returning * into saved;
  -- A revised photo/text needs a fresh optional feature permission.
  update private.feature_permissions set allowed=false where listing_id=p_id;
  if p_publish then
    insert into private.consents(listing_id,version,text,photo_consent) values(p_id,'2026-10-01-paddock-v1',
      'I agree that my selected profile information will be shown publicly in the RAD RACE ONETWENTY Paddock. If a photo is included, I confirm that I may use it and that it can be shown publicly.',photo is not null and p_photo_consent);
  end if;
  return to_jsonb(saved)-'owner_id';
end $$;


create function private.paddock_list(p_type text default 'all',p_search text default '',p_looking boolean default false,p_vibe text default '',p_gender text default 'all',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total bigint;
begin
 with matches as (
 select l.* from private.listings l where status='active' and expires_at>now()
 and (p_type='all' or type=p_type) and (not coalesce(p_looking,false) or looking)
 and (coalesce(p_search,'')='' or name ilike '%'||left(p_search,100)||'%' or region ilike '%'||left(p_search,100)||'%')
 and (coalesce(p_vibe,'')='' or p_vibe=any(vibes))
 and (p_gender='all' or (type='rider' and "riderGender"=case when p_gender='Women' then 'Woman' else 'Man' end) or (type='team' and (seeking='Anyone' or seeking=p_gender)))
 ), page as (select * from matches order by created_at desc,id limit 24 offset greatest(0,least(coalesce(p_offset,0),10000)))
 select coalesce((select jsonb_agg(to_jsonb(t)-'owner_id' order by created_at desc,id) from page t),'[]'),(select count(*) from matches) into result,total;
 return jsonb_build_object('items',result,'total',total);
end $$;

create function private.paddock_roster(p_team uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from private.listings where id=p_team and type='team' and status='active' and expires_at>now()) then return '[]'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'image_path',r.image_path,'revision',r.revision) order by m.updated_at,r.id)
 from private.team_members m join private.listings r on r.id=m.rider_id where m.team_id=p_team and m.state='accepted' and r.status='active' and r.expires_at>now()),'[]');
end $$;

create function private.paddock_home() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=private.require_user();
begin
 return jsonb_build_object(
 'rider',(select to_jsonb(l)-'owner_id' from private.listings l where owner_id=uid and type='rider'),
 'membership',(select jsonb_build_object('team_id',t.id,'team_name',t.name,'state',m.state) from private.team_members m join private.listings r on r.id=m.rider_id join private.listings t on t.id=m.team_id where r.owner_id=uid and m.state='accepted' and t.expires_at>now() and r.expires_at>now()),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('team_id',t.id,'team_name',t.name,'rider_id',r.id,'name',r.name,'state',m.state,'description',r.description,'region',r.region,'image_path',r.image_path,'revision',r.revision) order by m.requested_at)
 from private.team_members m join private.listings t on t.id=m.team_id join private.listings r on r.id=m.rider_id where t.owner_id=uid and t.expires_at>now() and r.expires_at>now() and m.state in ('pending','accepted')),'[]'),
 'outgoing',coalesce((select jsonb_agg(jsonb_build_object('team_id',t.id,'team_name',t.name,'state',m.state)) from private.team_members m join private.listings r on r.id=m.rider_id join private.listings t on t.id=m.team_id where r.owner_id=uid and m.state='pending' and t.expires_at>now()),'[]'),
 'events',coalesce((select jsonb_agg(e) from (select e.id,e.kind,e.seen,t.name as team_name,r.name as rider_name,e.created_at from private.paddock_events e join private.listings t on t.id=e.team_id join private.listings r on r.id=e.rider_id where e.recipient_id=uid order by e.created_at desc limit 30) e),'[]'),
 'features',coalesce((select jsonb_agg(jsonb_build_object('listing_id',f.listing_id,'allowed',f.allowed)) from private.feature_permissions f join private.listings l on l.id=f.listing_id where l.owner_id=uid),'[]'));
end $$;

create function private.paddock_badge() returns bigint language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=private.require_user(); begin
 return (select count(*) from private.paddock_events where recipient_id=uid and not seen);
end $$;
create function private.paddock_seen(p_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); begin update private.paddock_events set seen=true where recipient_id=uid and id=any(p_ids); end $$;

create function private.paddock_join_status(p_team uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=private.require_user(); rider private.listings; begin
 select * into rider from private.listings where owner_id=uid and type='rider';
 return jsonb_build_object('rider',case when rider.id is not null then to_jsonb(rider)-'owner_id' end,
 'captain',exists(select 1 from private.listings where id=p_team and owner_id=uid),
 'state',(select state from private.team_members where team_id=p_team and rider_id=rider.id),
 'membership',(private.paddock_home()->'membership'));
end $$;

create function private.paddock_request(p_team uuid,p_name text default '',p_consent boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); t private.listings; r private.listings; m private.team_members; newstate text;
begin
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 perform private.require_user();
 select * into t from private.listings where id=p_team and type='team' and status='active' and expires_at>now() for share;
 if not found then raise exception 'This team is not available.'; end if;
 select * into r from private.listings where owner_id=uid and type='rider' for update;
 if not found then
  if not coalesce(p_consent,false) then raise exception 'Please agree to your public rider profile and team membership.'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 60 then raise exception 'Enter your name (1–60 characters).'; end if;
  insert into private.listings(id,owner_id,type,name,region,description,languages,categories,vibes,status,published_at,expires_at,looking)
   values(gen_random_uuid(),uid,'rider',trim(p_name),'','','','{}','{}','active',now(),now()+interval '10 months',false) returning * into r;
  insert into private.consents(listing_id,version,text,photo_consent) values(r.id,'2026-10-01-paddock-join-v1','I agree to publicly show my rider name and approved team membership in the RAD RACE ONETWENTY Paddock.',false);
 end if;
 if r.expires_at<=now() then raise exception 'Your rider profile has expired. Delete it in My Paddock before creating a new one.'; end if;
 if r.status<>'active' then raise exception 'Publish your rider profile in My Paddock before requesting to join.'; end if;
 update private.team_members tm set state='left',updated_at=now() where tm.rider_id=r.id and tm.state='accepted' and exists(select 1 from private.listings x where x.id=tm.team_id and x.expires_at<=now());
 if exists(select 1 from private.team_members where rider_id=r.id and state='accepted' and team_id<>t.id) then raise exception 'You are already in a team. Leave it in My Paddock before joining another.'; end if;
 select * into m from private.team_members where team_id=t.id and rider_id=r.id for update;
 if m.state in ('pending','accepted') then return; end if;
 if m.state in ('declined','removed') and m.updated_at>now()-interval '1 day' then raise exception 'Please wait a day before asking this team again.'; end if;
 if exists(select 1 from private.conversations c where c.listing_id=t.id and c.starter_id=uid and (c.owner_blocked or c.starter_blocked)) then raise exception 'Contact with this team is blocked.'; end if;
 if (select count(*) from private.team_members where rider_id=r.id and requested_at>now()-interval '1 day')>=5 then raise exception 'You can request up to five teams per day.'; end if;
 newstate:=case when t.owner_id=uid then 'accepted' else 'pending' end;
 insert into private.team_members(team_id,rider_id,state) values(t.id,r.id,newstate) on conflict(team_id,rider_id) do update set state=excluded.state,requested_at=now(),updated_at=now();
 if newstate='accepted' then
  update private.listings set looking=false,revision=revision+1,updated_at=now() where id=r.id;
  update private.team_members set state='cancelled',updated_at=now() where rider_id=r.id and state='pending';
 else
  insert into private.chat_email_settings(user_id) values(t.owner_id) on conflict do nothing;
  insert into private.paddock_events(recipient_id,team_id,rider_id,kind) values(t.owner_id,t.id,r.id,'requested');
 end if;
end $$;

create function private.paddock_decide(p_team uuid,p_rider uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); t private.listings; r private.listings; m private.team_members; begin
 select * into r from private.listings where id=p_rider and type='rider';
 if not found then raise exception 'Rider unavailable.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.owner_id::text,0));
 select * into t from private.listings where id=p_team and owner_id=uid and type='team' and expires_at>now() for share;
 if not found then raise exception 'Only the captain can approve requests.' using errcode='42501'; end if;
 select * into r from private.listings where id=p_rider for update;
 if p_accept and (t.status<>'active' or r.status<>'active' or r.expires_at<=now() or not exists(select 1 from auth.users where id=r.owner_id and email_confirmed_at is not null and (banned_until is null or banned_until<=now()))) then raise exception 'Rider unavailable.'; end if;
 select * into m from private.team_members where team_id=p_team and rider_id=p_rider for update;
 if m.state is null or m.state<>'pending' then return; end if;
 if p_accept is null then raise exception 'Choose accept or decline.'; end if;
 if p_accept and exists(select 1 from private.conversations c where c.listing_id=t.id and c.starter_id=r.owner_id and (c.owner_blocked or c.starter_blocked)) then raise exception 'Contact with this team is blocked.'; end if;
 if p_accept and exists(select 1 from private.team_members where rider_id=p_rider and state='accepted') then raise exception 'This rider is already in a team.'; end if;
 update private.team_members set state=case when p_accept then 'accepted' else 'declined' end,updated_at=now() where team_id=p_team and rider_id=p_rider;
 if p_accept then
  update private.listings set looking=false,revision=revision+1,updated_at=now() where id=p_rider;
  update private.team_members set state='cancelled',updated_at=now() where rider_id=p_rider and state='pending';
 end if;
 update private.paddock_events set seen=true,email_done=true where rider_id=p_rider and kind='requested' and (team_id=p_team or p_accept);
 insert into private.chat_email_settings(user_id) values(r.owner_id) on conflict do nothing;
 insert into private.paddock_events(recipient_id,team_id,rider_id,kind) values(r.owner_id,p_team,p_rider,case when p_accept then 'accepted' else 'declined' end);
end $$;

create function private.paddock_leave(p_team uuid,p_rider uuid) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); t private.listings; r private.listings; previous text; begin
 select * into r from private.listings where id=p_rider;
 if not found then raise exception 'Rider unavailable.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.owner_id::text,0));
 select * into t from private.listings where id=p_team;
 if t.id is null or (uid<>r.owner_id and uid<>t.owner_id) then raise exception 'Not your membership.' using errcode='42501'; end if;
 select state into previous from private.team_members where team_id=p_team and rider_id=p_rider for update;
 if previous not in ('accepted','pending') or previous is null then return; end if;
 update private.team_members set state=case when previous='pending' then 'cancelled' when uid=r.owner_id then 'left' else 'removed' end,updated_at=now() where team_id=p_team and rider_id=p_rider;
 update private.paddock_events set seen=true,email_done=true where team_id=p_team and rider_id=p_rider;
 if uid<>r.owner_id and previous='accepted' then
  insert into private.chat_email_settings(user_id) values(r.owner_id) on conflict do nothing;
  insert into private.paddock_events(recipient_id,team_id,rider_id,kind) values(r.owner_id,p_team,p_rider,'removed');
 end if;
end $$;

create function private.paddock_feature(p_listing uuid,p_allow boolean) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); l private.listings; begin
 select * into l from private.listings where id=p_listing and owner_id=uid for share;
 if not found then raise exception 'Not your profile.' using errcode='42501'; end if;
 if p_allow is null then raise exception 'Choose your preference.'; end if;
 if p_allow and (l.status<>'active' or l.expires_at<=now()) then raise exception 'Publish your profile first.'; end if;
 insert into private.feature_permissions(listing_id,allowed,listing_revision) values(l.id,p_allow,l.revision)
 on conflict(listing_id) do update set allowed=excluded.allowed,listing_revision=excluded.listing_revision,recorded_at=now();
end $$;

create function public.paddock_list(p_type text default 'all',p_search text default '',p_looking boolean default false,p_vibe text default '',p_gender text default 'all',p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select private.paddock_list(p_type,p_search,p_looking,p_vibe,p_gender,p_offset) $$;
revoke all on function public.paddock_list(text,text,boolean,text,text,integer),private.paddock_list(text,text,boolean,text,text,integer) from public,anon,authenticated;
grant execute on function public.paddock_list(text,text,boolean,text,text,integer),private.paddock_list(text,text,boolean,text,text,integer) to anon,authenticated;

create function public.paddock_roster(p_team uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.paddock_roster(p_team) $$;
revoke all on function public.paddock_roster(uuid),private.paddock_roster(uuid) from public,anon,authenticated;
grant execute on function public.paddock_roster(uuid),private.paddock_roster(uuid) to anon,authenticated;

create function public.paddock_home() returns jsonb language sql security invoker set search_path='' as $$ select private.paddock_home() $$;
revoke all on function public.paddock_home(),private.paddock_home() from public,anon,authenticated;
grant execute on function public.paddock_home(),private.paddock_home() to authenticated;

create function public.paddock_badge() returns bigint language sql security invoker set search_path='' as $$ select private.paddock_badge() $$;
revoke all on function public.paddock_badge(),private.paddock_badge() from public,anon,authenticated;
grant execute on function public.paddock_badge(),private.paddock_badge() to authenticated;

create function public.paddock_seen(p_ids uuid[]) returns void language sql security invoker set search_path='' as $$ select private.paddock_seen(p_ids) $$;
revoke all on function public.paddock_seen(uuid[]),private.paddock_seen(uuid[]) from public,anon,authenticated;
grant execute on function public.paddock_seen(uuid[]),private.paddock_seen(uuid[]) to authenticated;

create function public.paddock_join_status(p_team uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.paddock_join_status(p_team) $$;
revoke all on function public.paddock_join_status(uuid),private.paddock_join_status(uuid) from public,anon,authenticated;
grant execute on function public.paddock_join_status(uuid),private.paddock_join_status(uuid) to authenticated;

create function public.paddock_request(p_team uuid,p_name text default '',p_consent boolean default false) returns void language sql security invoker set search_path='' as $$ select private.paddock_request(p_team,p_name,p_consent) $$;
revoke all on function public.paddock_request(uuid,text,boolean),private.paddock_request(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.paddock_request(uuid,text,boolean),private.paddock_request(uuid,text,boolean) to authenticated;

create function public.paddock_decide(p_team uuid,p_rider uuid,p_accept boolean) returns void language sql security invoker set search_path='' as $$ select private.paddock_decide(p_team,p_rider,p_accept) $$;
revoke all on function public.paddock_decide(uuid,uuid,boolean),private.paddock_decide(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.paddock_decide(uuid,uuid,boolean),private.paddock_decide(uuid,uuid,boolean) to authenticated;

create function public.paddock_leave(p_team uuid,p_rider uuid) returns void language sql security invoker set search_path='' as $$ select private.paddock_leave(p_team,p_rider) $$;
revoke all on function public.paddock_leave(uuid,uuid),private.paddock_leave(uuid,uuid) from public,anon,authenticated;
grant execute on function public.paddock_leave(uuid,uuid),private.paddock_leave(uuid,uuid) to authenticated;

create function public.paddock_feature(p_listing uuid,p_allow boolean) returns void language sql security invoker set search_path='' as $$ select private.paddock_feature(p_listing,p_allow) $$;
revoke all on function public.paddock_feature(uuid,boolean),private.paddock_feature(uuid,boolean) from public,anon,authenticated;
grant execute on function public.paddock_feature(uuid,boolean),private.paddock_feature(uuid,boolean) to authenticated;

create or replace function private.chat_email_preference(p_enabled boolean default null) returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); result boolean;
begin
 insert into private.chat_email_settings(user_id) values(uid) on conflict do nothing;
 if p_enabled is not null then
  update private.chat_email_settings set enabled=p_enabled where user_id=uid;
  -- No backlog on re-enabling. Already-in-flight delivery may finish.
  delete from private.chat_email_queue where recipient_id=uid and claim is null;
  update private.paddock_events set email_done=true where recipient_id=uid and claim is null;
 end if;
 select enabled into result from private.chat_email_settings where user_id=uid;
 return result;
end $$;

create or replace function private.chat_email_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.chat_email_settings; token uuid; address text;
begin
 perform private.require_worker();
 -- A worker lost after SMTP might have delivered. Consume its batch instead of duplicating it.
 for s in select * from private.chat_email_settings where claim is not null and claimed_at<now()-interval '15 minutes' for update skip locked loop
  delete from private.chat_email_queue where claim=s.claim;
  update private.paddock_events set email_done=true,claim=null where claim=s.claim;
  update private.chat_email_settings set claim=null,claimed_at=null,last_sent_at=now(),attempts=0 where user_id=s.user_id;
 end loop;
 delete from private.chat_email_queue q using private.chat_email_settings st,private.chat_messages m,private.conversations c,private.listings l,auth.users u
 where q.claim is null and st.user_id=q.recipient_id and m.id=q.message_id and c.id=m.conversation_id and l.id=c.listing_id and u.id=q.recipient_id
 and (not st.enabled or c.owner_blocked or c.starter_blocked or l.expires_at<=now() or u.email_confirmed_at is null or u.email is null or u.banned_until>now()
 or m.id<=case when q.recipient_id=l.owner_id then c.owner_seen else c.starter_seen end);
 update private.paddock_events e set email_done=true where not e.email_done and e.claim is null and
 (e.seen or not exists(select 1 from private.chat_email_settings st join auth.users u on u.id=st.user_id where st.user_id=e.recipient_id and st.enabled and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()))
 or not exists(select 1 from private.listings t where t.id=e.team_id and t.status='active' and t.expires_at>now()));
 select st.* into s from private.chat_email_settings st
 where st.enabled and st.claim is null and st.retry_at<=now() and (st.last_sent_at is null or st.last_sent_at<=now()-interval '30 minutes')
 and (exists(select 1 from private.chat_email_queue q join private.chat_messages m on m.id=q.message_id where q.recipient_id=st.user_id and q.claim is null and m.created_at<=now()-interval '2 minutes') or exists(select 1 from private.paddock_events e where e.recipient_id=st.user_id and not e.email_done and e.claim is null and e.created_at<=now()-interval '2 minutes'))
 order by st.retry_at,st.user_id limit 1 for update skip locked;
 if not found then return null; end if;
 token:=gen_random_uuid();
 update private.chat_email_queue q set claim=token from private.chat_messages m where q.recipient_id=s.user_id and q.claim is null and m.id=q.message_id and m.created_at<=now()-interval '2 minutes';
 update private.paddock_events set claim=token where recipient_id=s.user_id and not email_done and claim is null and created_at<=now()-interval '2 minutes';
 update private.chat_email_settings set claim=token,claimed_at=now(),attempts=attempts+1 where user_id=s.user_id;
 select email into address from auth.users where id=s.user_id;
 return jsonb_build_object('id',token,'to',address,'activity',exists(select 1 from private.paddock_events where claim=token));
end $$;

create or replace function private.chat_email_ready(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform private.require_worker();
 return exists(select 1 from private.chat_email_settings s join auth.users u on u.id=s.user_id
 join private.chat_email_queue q on q.recipient_id=s.user_id and q.claim=s.claim
 join private.chat_messages m on m.id=q.message_id join private.conversations c on c.id=m.conversation_id join private.listings l on l.id=c.listing_id
 where s.claim=p_id and s.enabled and s.claimed_at>now()-interval '15 minutes' and u.email_confirmed_at is not null and u.email is not null and (u.banned_until is null or u.banned_until<=now())
 and not c.owner_blocked and not c.starter_blocked and l.expires_at>now() and m.id>case when s.user_id=l.owner_id then c.owner_seen else c.starter_seen end) or exists(select 1 from private.chat_email_settings s join auth.users u on u.id=s.user_id join private.paddock_events e on e.claim=s.claim join private.listings t on t.id=e.team_id
 where s.claim=p_id and s.enabled and s.claimed_at>now()-interval '15 minutes' and not e.seen and not e.email_done and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()) and t.status='active' and t.expires_at>now());
end $$;

create or replace function private.chat_email_finish(p_id uuid,p_state text) returns void language plpgsql security definer set search_path='' as $$
declare s private.chat_email_settings;
begin
 perform private.require_worker();
 if p_state not in ('sent','failed','uncertain','skipped') then raise exception 'Invalid delivery state'; end if;
 select * into s from private.chat_email_settings where claim=p_id for update;
 if not found then return; end if;
 if p_state='failed' and s.attempts<3 and s.enabled then
  update private.chat_email_queue set claim=null where claim=p_id;
  update private.paddock_events set claim=null where claim=p_id;
  update private.chat_email_settings set claim=null,claimed_at=null,retry_at=now()+interval '5 minutes'*s.attempts where user_id=s.user_id;
 else
  delete from private.chat_email_queue where claim=p_id;
  update private.paddock_events set claim=null,email_done=true where claim=p_id;
  update private.chat_email_settings set claim=null,claimed_at=null,attempts=0,retry_at=now(),last_sent_at=case when p_state in ('sent','uncertain') then now() else last_sent_at end where user_id=s.user_id;
 end if;
end $$;

create function private.paddock_rider_team(p_rider uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',t.id,'name',t.name) from private.team_members m join private.listings t on t.id=m.team_id join private.listings r on r.id=m.rider_id
 where m.rider_id=p_rider and m.state='accepted' and t.status='active' and t.expires_at>now() and r.status='active' and r.expires_at>now();
$$;
create function public.paddock_rider_team(p_rider uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.paddock_rider_team(p_rider) $$;
revoke all on function public.paddock_rider_team(uuid),private.paddock_rider_team(uuid) from public,anon,authenticated;
grant execute on function public.paddock_rider_team(uuid),private.paddock_rider_team(uuid) to anon,authenticated;

create function private.paddock_search(p_listing uuid,p_looking boolean,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); l private.listings; begin
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into l from private.listings where id=p_listing and owner_id=uid for update;
 if not found then raise exception 'Not your profile.' using errcode='42501'; end if;
 if p_revision is null or l.revision<>p_revision then raise exception 'Profile changed. Reload My Paddock.'; end if;
 if p_looking is null then raise exception 'Choose a search status.'; end if;
 if l.expires_at<=now() then raise exception 'This profile has expired.'; end if;
 if p_looking and exists(select 1 from private.team_members where rider_id=l.id and state='accepted') then raise exception 'Leave your current team before looking for another.'; end if;
 update private.listings set looking=p_looking,"ridersNeeded"=case when type='team' then case when p_looking then greatest(1,coalesce("ridersNeeded",1)) else 0 end end,revision=revision+1,updated_at=now() where id=l.id;
end $$;
create function public.paddock_search(p_listing uuid,p_looking boolean,p_revision integer) returns void language sql security invoker set search_path='' as $$ select private.paddock_search(p_listing,p_looking,p_revision) $$;
revoke all on function public.paddock_search(uuid,boolean,integer),private.paddock_search(uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.paddock_search(uuid,boolean,integer),private.paddock_search(uuid,boolean,integer) to authenticated;

create or replace function private.set_listing_status(p_id uuid,p_status text,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); saved private.listings;
begin
  if p_status is null or p_revision is null or p_status not in ('active','closed') then raise exception 'Invalid status.'; end if;
  select * into saved from private.listings where id=p_id and owner_id=uid for update;
  if not found then raise exception 'Listing not found.' using errcode='42501'; end if;
  if saved.revision<>p_revision then raise exception 'Listing changed. Reload My listings and try again.'; end if;
  if p_status='active' and (saved.published_at is null or saved.expires_at<=now()) then raise exception 'Use the form to publish a draft. Expired listings cannot be reopened.'; end if;
  update private.listings set status=p_status,revision=revision+1,updated_at=now() where id=p_id returning * into saved;
  if p_status='closed' then update private.feature_permissions set allowed=false,recorded_at=now() where listing_id=p_id; end if;
  return to_jsonb(saved)-'owner_id';
end $$;

-- Limit new objects even when clients call Storage directly. Existing photos stay intact.
update storage.buckets set file_size_limit=250000 where id='listing-photos';
