update private.listings
set seeking = 'Mixed'
where type = 'team' and seeking = 'Anyone';

alter table private.listings drop constraint if exists listings_check;
alter table private.listings add constraint listings_check check(coalesce(
  (
    type = 'team'
    and age is null
    and "riderGender" is null
    and cardinality(categories) = 1
    and (
      (not looking and seeking is null and "ridersNeeded" is null)
      or (
        looking
        and seeking in ('Men','Women','Mixed')
        and ("ridersNeeded" is null or "ridersNeeded" between 1 and 5)
      )
    )
  )
  or (
    type = 'rider'
    and "ridersNeeded" is null
    and seeking is null
    and (
      ("riderGender" is null and cardinality(categories) = 0)
      or (
        "riderGender" in ('Woman','Man')
        and cardinality(categories) between 1 and 2
        and categories <@ case
          when "riderGender" = 'Woman' then array['Women','Mixed']
          else array['Men','Mixed']
        end
      )
    )
  ),
  false
));

create or replace function private.save_listing(
  p_id uuid,
  p_data jsonb,
  p_revision integer,
  p_publish boolean,
  p_consent boolean,
  p_photo_consent boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  uid uuid := private.require_user();
  old private.listings;
  saved private.listings;
  captain private.listings;
  first_publish timestamptz;
  photo text;
  team_seeking text;
  rider_gender text;
  rider_category text;
  stored_categories text[];
begin
  if p_id is null or p_revision is null or p_publish is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Invalid listing request.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into old from private.listings where id = p_id for update;

  if found then
    if old.owner_id <> uid then raise exception 'Listing not found.' using errcode='42501'; end if;
    if old.type <> p_data->>'type' then raise exception 'A profile cannot change between rider and team.'; end if;
    if old.revision <> p_revision then raise exception 'This listing changed in another window. Reload My Paddock and try again.'; end if;
    if not p_publish and old.status <> 'draft' then raise exception 'Please preview and confirm publication before saving.'; end if;
    if old.expires_at <= now() then raise exception 'This listing has reached its ten-month limit. Please create a new listing.'; end if;
  else
    if p_revision <> 0 then raise exception 'Listing not found.'; end if;
    if p_data->>'type' = 'rider' and exists(select 1 from private.listings where owner_id=uid and type='rider') then
      raise exception 'You already have a rider profile. Open My Paddock to edit it.';
    end if;
    if p_data->>'type' = 'team' and exists(select 1 from private.listings where owner_id=uid and type='team') then
      raise exception 'You already have a team. Open My Paddock to manage it.';
    end if;
  end if;

  if p_publish and not coalesce(p_consent,false) then
    raise exception 'Please agree to publication.';
  end if;

  photo := nullif(p_data->>'image_path','');
  if photo is not null then
    if split_part(photo,'/',1) <> p_id::text
      or not exists(select 1 from storage.objects where bucket_id='listing-photos' and name=photo) then
      raise exception 'Photo not found. Please choose it again.';
    end if;
    if p_publish and not coalesce(p_photo_consent,false) then
      raise exception 'Please confirm that you may publish the photo.';
    end if;
  end if;

  if p_data->>'type' = 'rider' then
    rider_gender := nullif(trim(p_data->>'riderGender'),'');
    if rider_gender is null or (rider_gender <> 'Man' and rider_gender <> 'Woman') then
      raise exception 'Choose Man or Woman.';
    end if;

    if jsonb_array_length(coalesce(p_data->'categories','[]'::jsonb)) <> 1 then
      raise exception 'Choose Mixed or Not mixed.';
    end if;

    rider_category := p_data->'categories'->>0;
    if rider_category = 'Mixed' then
      stored_categories := array['Mixed'];
    elsif rider_gender = 'Woman' and rider_category = 'Women' then
      stored_categories := array['Women'];
    elsif rider_gender = 'Man' and rider_category = 'Men' then
      stored_categories := array['Men'];
    else
      raise exception 'Choose Mixed or Not mixed.';
    end if;

    team_seeking := null;
  elsif p_data->>'type' = 'team' then
    select * into captain
    from private.listings
    where owner_id = uid and type = 'rider'
    for update;

    if not found then raise exception 'Create your rider profile before creating a team.'; end if;
    if captain.status <> 'active' or captain.expires_at <= now() then
      raise exception 'Publish your rider profile before creating a team.';
    end if;
    if captain."riderGender" is null or (captain."riderGender" <> 'Man' and captain."riderGender" <> 'Woman') then
      raise exception 'Complete the I am field on your rider profile first.';
    end if;
    if exists(
      select 1 from private.team_members
      where rider_id = captain.id and state = 'accepted' and team_id <> p_id
    ) then
      raise exception 'You are already in a team. Leave it before creating your own.';
    end if;
    if exists(
      select 1 from private.listings
      where owner_id = uid and type = 'team' and id <> p_id
    ) then
      raise exception 'You already have a team. Open My Paddock to manage it.';
    end if;

    team_seeking := nullif(trim(p_data->>'seeking'),'');
    if team_seeking is not null
      and team_seeking <> 'Men'
      and team_seeking <> 'Women'
      and team_seeking <> 'Mixed' then
      raise exception 'Choose Men, Women or Mixed.';
    end if;

    if captain."riderGender" = 'Woman' then
      stored_categories := array['Women'];
    else
      stored_categories := array['Men'];
    end if;
  else
    raise exception 'Invalid profile type.';
  end if;

  first_publish := coalesce(old.published_at, case when p_publish then now() end);

  insert into private.listings (
    id,owner_id,type,name,region,description,languages,age,
    "ridersNeeded","riderGender",seeking,categories,vibes,
    strava,instagram,image_path,status,revision,published_at,expires_at,looking
  )
  values (
    p_id,
    uid,
    p_data->>'type',
    trim(p_data->>'name'),
    case when p_data->>'type'='rider' then trim(coalesce(p_data->>'region','')) else '' end,
    trim(coalesce(p_data->>'description','')),
    case when p_data->>'type'='rider' then trim(coalesce(p_data->>'languages','')) else '' end,
    case when p_data->>'type'='rider' then nullif(p_data->>'age','')::integer end,
    case when p_data->>'type'='team' and team_seeking is not null then nullif(p_data->>'ridersNeeded','')::integer end,
    case when p_data->>'type'='rider' then rider_gender end,
    case when p_data->>'type'='team' then team_seeking end,
    stored_categories,
    array(select distinct jsonb_array_elements_text(coalesce(p_data->'vibes','[]'::jsonb))),
    coalesce(p_data->>'strava',''),
    coalesce(p_data->>'instagram',''),
    photo,
    case when p_publish then 'active' else coalesce(old.status,'draft') end,
    coalesce(old.revision,0)+1,
    first_publish,
    coalesce(old.expires_at,(first_publish at time zone 'UTC' + interval '10 months') at time zone 'UTC'),
    case
      when p_data->>'type'='team' then team_seeking is not null
      else not exists(select 1 from private.team_members where rider_id=p_id and state='accepted')
    end
  )
  on conflict(id) do update set
    type=excluded.type,
    name=excluded.name,
    region=excluded.region,
    description=excluded.description,
    languages=excluded.languages,
    age=excluded.age,
    "ridersNeeded"=excluded."ridersNeeded",
    "riderGender"=excluded."riderGender",
    seeking=excluded.seeking,
    categories=excluded.categories,
    vibes=excluded.vibes,
    strava=excluded.strava,
    instagram=excluded.instagram,
    image_path=excluded.image_path,
    status=excluded.status,
    revision=excluded.revision,
    published_at=excluded.published_at,
    expires_at=excluded.expires_at,
    updated_at=now(),
    looking=excluded.looking
  returning * into saved;

  if saved.type='team' and p_publish then
    insert into private.team_members(team_id,rider_id,state)
    values(saved.id,captain.id,'accepted')
    on conflict(team_id,rider_id) do update set state='accepted',updated_at=now();

    update private.listings
    set looking=false,revision=revision+1,updated_at=now()
    where id=captain.id and looking;

    update private.team_members
    set state='cancelled',updated_at=now()
    where rider_id=captain.id and team_id<>saved.id and state='pending';
  end if;

  update private.feature_permissions set allowed=false where listing_id=p_id;

  if p_publish then
    insert into private.consents(listing_id,version,text,photo_consent)
    values(
      p_id,
      '2026-10-02-rider-first-v1',
      'I agree that my selected profile information will be shown publicly in the RAD RACE ONETWENTY Paddock. If a photo is included, I confirm that I may use it and that it can be shown publicly.',
      photo is not null and p_photo_consent
    );
  end if;

  return to_jsonb(saved)-'owner_id';
end
$fn$;

create or replace function private.paddock_request(
  p_team uuid,
  p_name text default '',
  p_consent boolean default false
) returns void
language plpgsql security definer set search_path='' as $fn$
declare
  uid uuid:=private.require_user();
  t private.listings;
  r private.listings;
  m private.team_members;
begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));

  select * into t
  from private.listings
  where id=p_team and type='team' and status='active' and expires_at>now()
  for share;

  if not found then raise exception 'This team is not available.'; end if;
  if not t.looking or t.seeking is null then raise exception 'This team is not looking for riders right now.'; end if;

  select * into r
  from private.listings
  where owner_id=uid and type='rider'
  for update;

  if not found then raise exception 'Create your rider profile before requesting to join a team.'; end if;
  if r.expires_at<=now() then raise exception 'Your rider profile has expired.'; end if;
  if r.status<>'active' then raise exception 'Publish your rider profile before requesting to join.'; end if;

  if exists(select 1 from private.listings where owner_id=uid and type='team' and id<>t.id) then
    raise exception 'You already have a team. Abandon or delete it before joining another.';
  end if;

  update private.team_members tm
  set state='left',updated_at=now()
  where tm.rider_id=r.id and tm.state='accepted'
    and exists(select 1 from private.listings x where x.id=tm.team_id and x.expires_at<=now());

  if exists(select 1 from private.team_members where rider_id=r.id and state='accepted' and team_id<>t.id) then
    raise exception 'You are already in a team. Leave it in My Paddock before joining another.';
  end if;

  select * into m
  from private.team_members
  where team_id=t.id and rider_id=r.id
  for update;

  if m.state in ('pending','accepted') then return; end if;
  if m.state in ('declined','removed') and m.updated_at>now()-interval '1 day' then
    raise exception 'Please wait a day before asking this team again.';
  end if;
  if exists(
    select 1 from private.conversations c
    where c.listing_id=t.id and c.starter_id=uid and (c.owner_blocked or c.starter_blocked)
  ) then
    raise exception 'Contact with this team is blocked.';
  end if;
  if (select count(*) from private.team_members where rider_id=r.id and requested_at>now()-interval '1 day')>=5 then
    raise exception 'You can request up to five teams per day.';
  end if;

  insert into private.team_members(team_id,rider_id,state)
  values(t.id,r.id,case when t.owner_id=uid then 'accepted' else 'pending' end)
  on conflict(team_id,rider_id) do update
    set state=excluded.state,requested_at=now(),updated_at=now();

  if t.owner_id=uid then
    update private.listings set looking=false,revision=revision+1,updated_at=now() where id=r.id;
    update private.team_members set state='cancelled',updated_at=now() where rider_id=r.id and state='pending';
  else
    insert into private.chat_email_settings(user_id) values(t.owner_id) on conflict do nothing;
    insert into private.paddock_events(recipient_id,team_id,rider_id,kind) values(t.owner_id,t.id,r.id,'requested');
  end if;
end
$fn$;

create or replace function private.paddock_leave(p_team uuid,p_rider uuid) returns void
language plpgsql security definer set search_path='' as $fn$
declare
  uid uuid:=private.require_user();
  t private.listings;
  r private.listings;
  previous text;
begin
  select * into r from private.listings where id=p_rider;
  if not found then raise exception 'Rider unavailable.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(r.owner_id::text,0));

  select * into t from private.listings where id=p_team;
  if t.id is null or (uid<>r.owner_id and uid<>t.owner_id) then
    raise exception 'Not your membership.' using errcode='42501';
  end if;

  select state into previous
  from private.team_members
  where team_id=p_team and rider_id=p_rider
  for update;

  if previous not in ('accepted','pending') or previous is null then return; end if;

  if previous='accepted' and uid=r.owner_id and t.owner_id=uid then
    raise exception 'Use Abandon team to hand over captaincy first.';
  end if;

  update private.team_members
  set state=case
    when previous='pending' then 'cancelled'
    when uid=r.owner_id then 'left'
    else 'removed'
  end,
  updated_at=now()
  where team_id=p_team and rider_id=p_rider;

  if previous='accepted' then
    update private.listings set looking=true,revision=revision+1,updated_at=now()
    where id=p_rider and type='rider';
  end if;

  update private.paddock_events set seen=true,email_done=true where team_id=p_team and rider_id=p_rider;

  if uid<>r.owner_id and previous='accepted' then
    insert into private.chat_email_settings(user_id) values(r.owner_id) on conflict do nothing;
    insert into private.paddock_events(recipient_id,team_id,rider_id,kind) values(r.owner_id,p_team,p_rider,'removed');
  end if;
end
$fn$;

create or replace function private.paddock_abandon_team(p_team uuid,p_new_captain uuid) returns void
language plpgsql security definer set search_path='' as $fn$
declare
  uid uuid:=private.require_user();
  t private.listings;
  old_captain private.listings;
  next_captain private.listings;
begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));

  select * into t
  from private.listings
  where id=p_team and type='team' and owner_id=uid
  for update;

  if not found then raise exception 'Only the captain can abandon this team.' using errcode='42501'; end if;

  select * into old_captain
  from private.listings
  where owner_id=uid and type='rider'
  for update;

  if not found then raise exception 'Your rider profile is missing.'; end if;
  if p_new_captain is null then raise exception 'Choose a new captain.'; end if;
  if p_new_captain=old_captain.id then raise exception 'Choose another team member.'; end if;

  select r.* into next_captain
  from private.team_members m
  join private.listings r on r.id=m.rider_id
  where m.team_id=p_team
    and m.rider_id=p_new_captain
    and m.state='accepted'
    and r.type='rider'
    and r.status='active'
    and r.expires_at>now()
  for update of r;

  if not found then raise exception 'Choose a current team member as the new captain.'; end if;

  if exists(select 1 from private.listings where owner_id=next_captain.owner_id and type='team' and id<>p_team) then
    raise exception 'That rider already captains another team.';
  end if;

  update private.listings
  set owner_id=next_captain.owner_id,revision=revision+1,updated_at=now()
  where id=p_team;

  update private.team_members
  set state='left',updated_at=now()
  where team_id=p_team and rider_id=old_captain.id and state='accepted';

  update private.listings set looking=true,revision=revision+1,updated_at=now() where id=old_captain.id;
  update private.listings set looking=false,revision=revision+1,updated_at=now() where id=next_captain.id;
end
$fn$;

create or replace function public.paddock_abandon_team(p_team uuid,p_new_captain uuid) returns void
language sql security invoker set search_path='' as $fn$
  select private.paddock_abandon_team(p_team,p_new_captain)
$fn$;

revoke all on function public.paddock_abandon_team(uuid,uuid) from public,anon,authenticated;
revoke all on function private.paddock_abandon_team(uuid,uuid) from public,anon,authenticated;
grant execute on function public.paddock_abandon_team(uuid,uuid) to authenticated;
grant execute on function private.paddock_abandon_team(uuid,uuid) to authenticated;

insert into private.team_members(team_id,rider_id,state)
select t.id,r.id,'accepted'
from private.listings t
join private.listings r on r.owner_id=t.owner_id and r.type='rider'
where t.type='team'
  and not exists(
    select 1 from private.team_members accepted
    where accepted.rider_id=r.id and accepted.state='accepted'
  )
on conflict(team_id,rider_id) do update set state='accepted',updated_at=now();

update private.listings r
set looking=false,revision=revision+1,updated_at=now()
where r.type='rider' and r.looking
  and exists(select 1 from private.team_members m where m.rider_id=r.id and m.state='accepted');

create or replace function private.delete_listing(p_id uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $fn$
declare
  uid uuid:=private.require_user();
  saved private.listings;
begin
  select * into saved from private.listings where id=p_id and owner_id=uid for update;
  if not found then raise exception 'Listing not found.' using errcode='42501'; end if;
  if p_revision is null or saved.revision<>p_revision or saved.status<>'closed' then
    raise exception 'Close and reload the listing before deleting.';
  end if;
  if exists(select 1 from storage.objects where bucket_id='listing-photos' and split_part(name,'/',1)=p_id::text) then
    raise exception 'Photo cleanup is incomplete. Please retry deletion.';
  end if;

  if saved.type='rider' then
    if exists(select 1 from private.team_members where rider_id=saved.id and state='accepted')
      or exists(select 1 from private.listings where owner_id=uid and type='team' and id<>saved.id) then
      raise exception 'Leave or abandon your team before deleting your rider profile.';
    end if;
  else
    update private.listings r
    set looking=true,revision=revision+1,updated_at=now()
    where r.type='rider'
      and r.id in (
        select m.rider_id from private.team_members m
        where m.team_id=saved.id and m.state='accepted'
      );
  end if;

  delete from private.listings where id=p_id;
end
$fn$;

create or replace function private.paddock_search(p_listing uuid,p_looking boolean,p_revision integer) returns void
language plpgsql security definer set search_path='' as $fn$
begin
  perform private.require_user();
  raise exception 'Your looking status follows your team membership automatically.';
end
$fn$;
