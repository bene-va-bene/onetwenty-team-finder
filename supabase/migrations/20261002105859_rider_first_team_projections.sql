create or replace function private.paddock_team_region(p_team uuid) returns text
language sql stable security definer set search_path='' as $fn$
  with member_places as (
    select m.rider_id, trim(r.region) as label, lower(trim(r.region)) as key
    from private.team_members m
    join private.listings r on r.id=m.rider_id
    where m.team_id=p_team
      and m.state='accepted'
      and r.type='rider'
      and r.status='active'
      and r.expires_at>now()
      and trim(r.region)<>''
  ),
  ranked as (
    select key,min(label) as label,count(*) as frequency
    from member_places
    group by key
  )
  select coalesce(string_agg(label,', ' order by frequency desc,lower(label)),'')
  from ranked
$fn$;

create or replace function private.paddock_team_languages(p_team uuid) returns text
language sql stable security definer set search_path='' as $fn$
  with member_languages as (
    select distinct
      m.rider_id,
      lower(trim(lang.value)) as key,
      trim(lang.value) as label
    from private.team_members m
    join private.listings r on r.id=m.rider_id
    cross join lateral regexp_split_to_table(r.languages,'[,;/|]+') as lang(value)
    where m.team_id=p_team
      and m.state='accepted'
      and r.type='rider'
      and r.status='active'
      and r.expires_at>now()
      and trim(lang.value)<>''
  ),
  ranked as (
    select key,min(label) as label,count(*) as frequency
    from member_languages
    group by key
  )
  select coalesce(string_agg(label,', ' order by frequency desc,lower(label)),'')
  from ranked
$fn$;

create or replace function private.paddock_team_category(p_team uuid) returns text
language sql stable security definer set search_path='' as $fn$
  with genders as (
    select r."riderGender" as gender
    from private.team_members m
    join private.listings r on r.id=m.rider_id
    where m.team_id=p_team
      and m.state='accepted'
      and r.type='rider'
      and r.status='active'
      and r.expires_at>now()
      and r."riderGender" in ('Man','Woman')
  )
  select case
    when coalesce(bool_or(gender='Man'),false) and coalesce(bool_or(gender='Woman'),false) then 'Mixed'
    when coalesce(bool_or(gender='Woman'),false) then 'Women'
    when coalesce(bool_or(gender='Man'),false) then 'Men'
    else null
  end
  from genders
$fn$;

create or replace function private.paddock_listing_json(p_listing private.listings) returns jsonb
language sql stable security definer set search_path='' as $fn$
  select case
    when p_listing.type='team' then
      (to_jsonb(p_listing)-'owner_id')
      || jsonb_build_object(
        'region',private.paddock_team_region(p_listing.id),
        'languages',private.paddock_team_languages(p_listing.id),
        'categories',
          case
            when private.paddock_team_category(p_listing.id) is null then '[]'::jsonb
            else jsonb_build_array(private.paddock_team_category(p_listing.id))
          end
      )
    else to_jsonb(p_listing)-'owner_id'
  end
$fn$;

revoke all on function private.paddock_team_region(uuid) from public,anon,authenticated;
revoke all on function private.paddock_team_languages(uuid) from public,anon,authenticated;
revoke all on function private.paddock_team_category(uuid) from public,anon,authenticated;
revoke all on function private.paddock_listing_json(private.listings) from public,anon,authenticated;

create or replace function private.read_listings(p_mine boolean,p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
begin
  if p_mine then perform private.require_user(); end if;
  return coalesce(
    (
      select jsonb_agg(private.paddock_listing_json(l) order by l.created_at desc)
      from private.listings l
      where (p_id is null or l.id=p_id)
        and (
          case
            when p_mine then l.owner_id=auth.uid()
            else l.status='active' and l.expires_at>now()
          end
        )
    ),
    '[]'::jsonb
  );
end
$fn$;

create or replace function private.paddock_list(
  p_type text default 'all',
  p_search text default '',
  p_looking boolean default false,
  p_vibe text default '',
  p_gender text default 'all',
  p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare
  result jsonb;
  total bigint;
begin
  with matches as (
    select l.*
    from private.listings l
    where l.status='active'
      and l.expires_at>now()
      and (p_type='all' or l.type=p_type)
      and (not coalesce(p_looking,false) or l.looking)
      and (
        coalesce(p_search,'')=''
        or l.name ilike '%'||left(p_search,100)||'%'
        or (l.type='rider' and l.region ilike '%'||left(p_search,100)||'%')
        or (l.type='team' and private.paddock_team_region(l.id) ilike '%'||left(p_search,100)||'%')
      )
      and (coalesce(p_vibe,'')='' or p_vibe=any(l.vibes))
      and (
        p_gender='all'
        or (l.type='rider' and l.looking and p_gender=any(l.categories))
        or (l.type='team' and l.looking and l.seeking=p_gender)
      )
  ),
  page as (
    select *
    from matches
    order by created_at desc,id
    limit 24
    offset greatest(0,least(coalesce(p_offset,0),10000))
  )
  select
    coalesce(
      (select jsonb_agg(private.paddock_listing_json(t) order by t.created_at desc,t.id) from page t),
      '[]'::jsonb
    ),
    (select count(*) from matches)
  into result,total;

  return jsonb_build_object('items',result,'total',total);
end
$fn$;
