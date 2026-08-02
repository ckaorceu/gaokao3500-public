-- ============================================================
-- 高考3500词 · 用户名登录 & 修改密码 后端支持（public 表方案）
-- 说明：Management API 的 database/query 角色不是 auth.users 的属主，
--       无法直接在其上建索引/触发器，故改用 public.user_profiles 表存用户名。
-- 执行方式（二选一）：
--   1) Supabase 控制台 SQL Editor 全选执行；
--   2) 经 Management API：POST /v1/projects/{ref}/database/query
--      请求体 { "query": "<本文件内容>" }
-- ============================================================

-- 1) 用户名表（属主为 postgres，可建唯一索引 + RLS）
create table if not exists public.user_profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  username  text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists user_profiles_username_idx
  on public.user_profiles (username);

alter table public.user_profiles enable row level security;

drop policy if exists up_select on public.user_profiles;
create policy up_select on public.user_profiles
  for select using (auth.uid() = user_id);
drop policy if exists up_insert on public.user_profiles;
create policy up_insert on public.user_profiles
  for insert with check (auth.uid() = user_id);
drop policy if exists up_update on public.user_profiles;
create policy up_update on public.user_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists up_delete on public.user_profiles;
create policy up_delete on public.user_profiles
  for delete using (auth.uid() = user_id);

-- 2) email_for_username：用户名 -> 邮箱（SECURITY DEFINER，仅 SELECT，不触 auth.users 属主限制）
create or replace function public.email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select u.email
  from auth.users u
  join public.user_profiles p on p.user_id = u.id
  where p.username = p_username
  limit 1;
$$;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- 3) my_username：当前登录用户的用户名
create or replace function public.my_username()
returns text
language sql
security definer
set search_path = public, auth
as $$
  select username from public.user_profiles where user_id = auth.uid() limit 1;
$$;
grant execute on function public.my_username() to authenticated;

-- 4) username_taken：用户名是否已存在（仅返回存在性，不泄露列表；anon 可调用用于注册前校验）
create or replace function public.username_taken(p_username text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists(select 1 from public.user_profiles where username = p_username);
$$;
grant execute on function public.username_taken(text) to anon, authenticated;
