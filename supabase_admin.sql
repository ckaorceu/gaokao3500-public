-- supabase_admin.sql：站长后台（数据看板 / 用户管理 / 内容管理）
-- 依赖 supabase_profiles.sql（user_profiles 表已存在）

-- 1) user_profiles 增加管理员标记
alter table public.user_profiles add column if not exists is_admin boolean not null default false;

-- 2) 通用管理员校验（内部使用，非管理员抛 42501）
create or replace function public._require_admin() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
end;
$$;

-- 3) 当前用户是否管理员（客户端自检，任何人可调用）
create or replace function public.am_i_admin() returns boolean
language sql security definer set search_path = public as $$
  select coalesce((select is_admin from public.user_profiles where user_id = auth.uid()), false);
$$;

-- 4) 设置 / 取消某用户管理员（仅管理员可调用）
create or replace function public.admin_set_admin(p_uid uuid, p_flag boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  insert into public.user_profiles(user_id, is_admin) values (p_uid, p_flag)
  on conflict (user_id) do update set is_admin = excluded.is_admin;
end;
$$;

-- 5) 内容管理：单词覆盖表（所有人可读，仅管理员可写）
create table if not exists public.word_overrides (
  word text primary key,
  pos text,
  meaning text,
  phonetic text,
  assoc text,
  root text,
  homo text,
  ex text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.word_overrides enable row level security;
drop policy if exists "word_overrides read" on public.word_overrides;
create policy "word_overrides read" on public.word_overrides for select using (true);
drop policy if exists "word_overrides admin write" on public.word_overrides;
create policy "word_overrides admin write" on public.word_overrides for all
  using ( exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin) )
  with check ( exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin) );

-- 6) sr_progress 增加 updated_at 用于活跃度统计
alter table public.sr_progress add column if not exists updated_at timestamptz not null default now();
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists sr_progress_touch on public.sr_progress;
create trigger sr_progress_touch before insert or update on public.sr_progress
  for each row execute function public.set_updated_at();
create index if not exists sr_progress_updated_at_idx on public.sr_progress(updated_at);

-- 7) 数据看板聚合 RPC
create or replace function public.admin_overview()
returns json language sql security definer set search_path = public as $$
  select public._require_admin();
  select json_build_object(
    'users', (select count(*) from auth.users),
    'profiles', (select count(*) from public.user_profiles),
    'progress_rows', (select count(*) from public.sr_progress),
    'tricks', (select count(*) from public.tricks),
    'overrides', (select count(*) from public.word_overrides)
  );
$$;

create or replace function public.admin_mastery_distribution()
returns json language sql security definer set search_path = public as $$
  select public._require_admin();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select l as level, count(*) as cnt from public.sr_progress group by l order by l
  ) t;
$$;

create or replace function public.admin_recent_activity(p_days int default 30)
returns json language sql security definer set search_path = public as $$
  select public._require_admin();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select date_trunc('day', updated_at)::date as day, count(*) as updates
    from public.sr_progress
    where updated_at > now() - (p_days || ' days')::interval
    group by 1 order by 1
  ) t;
$$;

-- 8) 用户管理 RPC
create or replace function public.admin_user_count()
returns int language sql security definer set search_path = public as $$
  select public._require_admin();
  select count(*)::int from auth.users;
$$;

create or replace function public.admin_list_users(p_limit int default 50, p_offset int default 0)
returns json language sql security definer set search_path = public as $$
  select public._require_admin();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select u.id, u.email, u.created_at, u.last_sign_in_at,
           p.username, coalesce(p.is_admin, false) as is_admin
    from auth.users u
    left join public.user_profiles p on p.user_id = u.id
    order by u.created_at desc
    limit p_limit offset p_offset
  ) t;
$$;

create or replace function public.admin_reset_user(p_uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  delete from public.sr_progress where user_id = p_uid;
  delete from public.tricks where user_id = p_uid;
end;
$$;

-- ============ 增强版后台 RPC（v2，2026-08-01）============

-- 7) admin_overview 增强：增加近 7/30 日活跃用户（按 sr_progress.updated_at 去重）
create or replace function public.admin_overview()
returns json language sql security definer set search_path = public as $$
  select public._require_admin();
  select json_build_object(
    'users', (select count(*) from auth.users),
    'profiles', (select count(*) from public.user_profiles),
    'progress_rows', (select count(*) from public.sr_progress),
    'tricks', (select count(*) from public.tricks),
    'overrides', (select count(*) from public.word_overrides),
    'active_7d', (select count(distinct user_id) from public.sr_progress where updated_at > now() - interval '7 days'),
    'active_30d', (select count(distinct user_id) from public.sr_progress where updated_at > now() - interval '30 days')
  );
$$;

-- 8) admin_list_users 增强：支持邮箱/用户名搜索过滤
drop function if exists public.admin_list_users(int, int);
create function public.admin_list_users(p_limit int default 50, p_offset int default 0, p_search text default '')
returns json language sql security definer set search_path = public as $$
  select public._require_admin();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select u.id, u.email, u.created_at, u.last_sign_in_at,
           p.username, coalesce(p.is_admin, false) as is_admin
    from auth.users u
    left join public.user_profiles p on p.user_id = u.id
    where (p_search = '' or u.email ilike '%' || p_search || '%' or coalesce(p.username,'') ilike '%' || p_search || '%')
    order by u.created_at desc
    limit p_limit offset p_offset
  ) t;
$$;

-- 9) 单用户学习详情（用于用户管理「查看详情」）
create or replace function public.admin_user_detail(p_uid uuid)
returns json language sql security definer set search_path = public as $$
  select public._require_admin();
  select json_build_object(
    'email', u.email,
    'username', p.username,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'is_admin', coalesce(p.is_admin, false),
    'sr_total', (select count(*) from public.sr_progress s where s.user_id = p_uid),
    'sr_by_mode', coalesce(
      (select json_agg(row_to_json(t)) from (
        select mode, count(*) as cnt, round(avg(l)::numeric,2) as avg_l
        from public.sr_progress where user_id = p_uid group by mode order by mode
      ) t), '[]'::json),
    'tricks', (select count(*) from public.tricks t where t.user_id = p_uid),
    'overrides', (select count(*) from public.word_overrides o where o.updated_by = p_uid),
    'last_active', (select max(updated_at) from public.sr_progress where user_id = p_uid)
  )
  from auth.users u
  left join public.user_profiles p on p.user_id = u.id
  where u.id = p_uid;
$$;

-- 10) 每日活跃用户 DAU / 滚动 7 日活跃 WAU
create or replace function public.admin_active_users(p_days int default 30)
returns json language sql security definer set search_path = public as $$
  select public._require_admin();
  select coalesce(json_agg(row_to_json(t) order by t.day), '[]'::json) from (
    with days as (
      select (current_date - g.n::int) as day from generate_series(0, p_days - 1) g(n)
    ),
    act as (
      select date_trunc('day', updated_at)::date as d, user_id
      from public.sr_progress
      where updated_at >= (current_date - (p_days - 1))
    )
    select days.day,
           count(distinct case when a.d = days.day then a.user_id end) as dau,
           count(distinct case when a.d >= days.day - 6 and a.d <= days.day then a.user_id end) as wau
    from days
    left join act a on true
    group by days.day
  ) t;
$$;

-- 11) 薄弱词 Top（l<=2 的进度条目最多的单词）
create or replace function public.admin_top_struggling(p_limit int default 20)
returns json language sql security definer set search_path = public as $$
  select public._require_admin();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select word, count(*) as strugglers, round(avg(l)::numeric, 2) as avg_l
    from public.sr_progress
    where l <= 2
    group by word
    order by strugglers desc, avg_l asc
    limit p_limit
  ) t;
$$;

-- 12) 学习量分布（按用户进度条数分桶）
create or replace function public.admin_engagement_distribution()
returns json language sql security definer set search_path = public as $$
  select public._require_admin();
  with buckets as (
    select user_id, count(*) as n from public.sr_progress group by user_id
  )
  select coalesce(json_agg(row_to_json(t) order by t.ord), '[]'::json) from (
    select label, cnt, ord from (values
      ('0 条（未学习）', (select count(*) from auth.users) - (select count(distinct user_id) from public.sr_progress), 0),
      ('1–50', (select count(*) from buckets where n between 1 and 50), 1),
      ('51–200', (select count(*) from buckets where n between 51 and 200), 2),
      ('201–500', (select count(*) from buckets where n between 201 and 500), 3),
      ('500+', (select count(*) from buckets where n > 500), 4)
    ) v(label, cnt, ord)
  ) t;
$$;
