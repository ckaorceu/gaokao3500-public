-- ============================================================================
-- 高考3500词 · 后端建表 SQL
-- 在 Supabase 控制台 SQL Editor 中一次性执行本文件即可。
-- 用户表使用 Supabase 内置 auth.users，无需自建。
-- ============================================================================

-- 间隔重复进度：每个用户、每种模式、每个词一条
CREATE TABLE IF NOT EXISTS sr_progress (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL,
  word        TEXT NOT NULL,
  l           INT  NOT NULL DEFAULT 0,          -- 掌握等级 0/1/3/5
  due         BIGINT NOT NULL DEFAULT 0,        -- 下次复习时间戳(ms)
  iv          INT  NOT NULL DEFAULT 0,          -- 间隔天数
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, mode, word)
);
CREATE INDEX IF NOT EXISTS sr_progress_user_due_idx ON sr_progress (user_id, due);

-- 巧记：每个用户、每个词一条
CREATE TABLE IF NOT EXISTS tricks (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word        TEXT NOT NULL,
  assoc       TEXT DEFAULT '',                  -- 联想记忆
  root        TEXT DEFAULT '',                  -- 词根词缀
  homo        TEXT DEFAULT '',                  -- 谐音记忆
  ex          TEXT DEFAULT '',                  -- 例句
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);

-- ============================================================================
-- Row Level Security（必须开启，否则任意用户可读取他人数据）
-- ============================================================================
ALTER TABLE sr_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE tricks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own sr" ON sr_progress;
CREATE POLICY "own sr" ON sr_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own tricks" ON tricks;
CREATE POLICY "own tricks" ON tricks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
