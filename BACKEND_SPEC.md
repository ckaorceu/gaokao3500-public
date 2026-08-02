# 后端实现规格 — 高考3500词巧记网站（给执行 claw）

> 本文档是**可执行规格**，另一个 claw 照此实现即可。不要臆测需求。

## 0. 目标（用户原话："做到完整后端"）
从「纯静态 + 浏览器 localStorage」升级为「带用户账号 + 服务端数据库 + 跨设备同步 + 多人隔离」的全栈站：
1. 用户注册 / 登录（邮箱+密码，或匿名游客 ID）
2. 每个用户的学习进度（间隔重复 SR）和巧记（tricks）存服务端，跨设备同步
3. 词库数据从服务端接口获取（前端不再内联 625KB 的 words.js——可选，见 §6）
4. 多人数据彼此隔离

约束：用 **Supabase**（免费版自带 Auth + Postgres + REST API），部署仍走 Vercel（静态前端 + Serverless Functions 转发 Supabase，或直接前端直连 Supabase JS SDK）。**不要自建服务器**。

---

## 1. 现有前端事实（必须兼容，不要重写 UI）
仓库：https://github.com/ckaorceu/gaokao3500 （main 分支 == Vercel 生产）
当前存储全在前端：
- `localStorage['gaokao3500.sr.v1']`：结构 `SR[mode][wordName] = { l, due, iv }`
  - mode ∈ `meaning|word|spelling|quizEn|quizCn`
  - `l` = 掌握等级（0 未学/1 不会/3 一般/5 熟记，离散值）
  - `due` = 下次复习时间戳(ms)；`iv` = 间隔天数
  - 详见 `learn.js` `rate()` 与 `buildQueue()`
- `localStorage['gaokao3500.tricks.v1']`：结构 `tricks[wordName] = { assoc, root, homo, ex }`
  - 四类巧记：联想/词根词缀/谐音/例句（见 `learn.js` `saveTrick()`）

关键文件（**不要改结构，只改数据来源**）：
- `index.html` / `learn.html` / `app.js` / `learn.js` / `style.css` / `words.js`（words.js 是 `const WORDS = [...]`）
- 改后端时，把 `app.js`/`learn.js` 里所有 `localStorage` 读写替换为「调用 sync 层」

---

## 2. Supabase 接入步骤
1. 注册 https://supabase.com 免费项目（用户需提供：SUPABASE_URL、SUPABASE_ANON_KEY、SUPABASE_SERVICE_ROLE_KEY）
2. SQL Editor 执行 §3 的建表 SQL
3. 开启 Email Auth（Auth → Providers → Email，关掉邮箱确认可选项，或保留）
4. 前端加 `@supabase/supabase-js`（在 `index.html`/`learn.html` 用 `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`，或 npm 打包——当前是纯静态无构建，建议用 CDN script 标签，零构建）
5. 新增 `sync.js`：封装 supabase 客户端 + 登录/注册/登出 + 拉取/推送 SR 与 tricks

---

## 3. 数据库 Schema（Postgres）
```sql
-- 用户表用 Supabase 内置 auth.users，无需自建

-- 间隔重复进度：每个用户每种模式每个词一条
CREATE TABLE sr_progress (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL,
  word        TEXT NOT NULL,
  l           INT  NOT NULL DEFAULT 0,
  due         BIGINT NOT NULL DEFAULT 0,   -- 毫秒时间戳
  iv          INT  NOT NULL DEFAULT 0,     -- 间隔天数
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, mode, word)
);
CREATE INDEX ON sr_progress (user_id, due);

-- 巧记：每个用户每个词一条
CREATE TABLE tricks (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word        TEXT NOT NULL,
  assoc       TEXT DEFAULT '',
  root        TEXT DEFAULT '',
  homo        TEXT DEFAULT '',
  ex          TEXT DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);
```

### Row Level Security（必须开，否则数据泄露）
```sql
ALTER TABLE sr_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE tricks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own sr" ON sr_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own tricks" ON tricks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

---

## 4. 前端 sync 层（新增 `sync.js`，全局 `window.Sync`）
接口契约（其他文件只调这些，方便替换实现）：
```js
Sync.init(url, anonKey)                 // 初始化客户端
Sync.onAuth(cb)                         // 登录态变化回调(user|null)
Sync.signUp(email, pw) -> Promise
Sync.signIn(email, pw) -> Promise
Sync.signOut() -> Promise
Sync.currentUser() -> {id,email}|null

// 拉取整库（登录后首次），返回 { sr: {...}, tricks: {...} }，结构同现有 localStorage
Sync.loadAll() -> Promise<{sr, tricks}>
// 增量保存：把整份 SR/tricks 上传（数据量小，整体 upsert 即可，不必逐条 diff）
Sync.saveSR(srObj) -> Promise
Sync.saveTricks(tricksObj) -> Promise
```
- `srObj` / `tricksObj` 结构**必须与现有 localStorage 完全一致**（见 §1），这样 `app.js`/`learn.js` 只需把 `localStorage.getItem/setItem` 改成 `Sync.loadAll()/saveSR()/saveTricks()`，其余逻辑不动。
- `saveSR` 实现：遍历 `srObj[mode][word]`，`upsert` 到 `sr_progress`（用 `(user_id,mode,word)` 唯一键）。`l<=0` 的记录 `DELETE`。
- `saveTricks` 同理 upsert `tricks` 表；四类字段全空则 DELETE。
- 为减少频繁写入：debounce 保存（如 800ms）或在 `rate()`/`saveTrick()` 后触发。

---

## 5. 前端改动清单（最小侵入）
1. 在 `index.html`/`learn.html` 的 `<head>` 加载 Supabase CDN + `sync.js`（放在 words.js 之后、app.js/learn.js 之前）。
2. `app.js` / `learn.js`：
   - 删除 `let SR = JSON.parse(localStorage.getItem(SR_KEY)||'{}')` 等初始化，改为 `Sync.init(...)` 后在 `onAuth` 里 `Sync.loadAll().then(d => { SR = d.sr||{}; tricks = d.tricks||{}; 渲染 })`
   - `saveSR()` → `Sync.saveSR(SR)`
   - `saveTricks()`（app.js 与 learn.js 两处）→ `Sync.saveTricks(tricks)`
3. `index.html` 顶部加「登录/注册」入口（模态框或简单表单），登录后才启用同步；未登录则**降级为 localStorage 本地模式**（保持现有行为，不破坏无账号用户体验）。
4. 登录态变化时：若从本地切到云端，做一次「本地 → 云端」合并上传（可选，先实现单向：登录后云端覆盖本地即可，简单可靠）。
5. 首页「重置进度」按钮逻辑保留，但需同时清除云端（调 delete 或 SaveSR 空）。

> 严禁改动：`words.js` 数据结构、`MODES`/`MODE_LABELS`、五种练习模式的渲染与评级逻辑、`.vercelignore`、Vercel 部署方式。

---

## 6. 验收（必须全部通过才算完成）
- [ ] 注册新账号 → 学习 3 个词（含 1 个巧记）→ 登出
- [ ] 另一浏览器/隐身窗口登录同一账号 → 进度与巧记完整恢复（证明跨设备同步 + 服务端持久化）
- [ ] 未登录用户：功能与改造前完全一致（localStorage 降级）
- [ ] RLS 验证：用 A 账号 token 无法读取 B 账号数据（可用 Supabase SQL 或 API 实测）
- [ ] `npx vercel deploy --prod --yes --scope ckaorceus-projects` 部署成功，https://word.tutw.fun 仍正常
- [ ] 保留原有 9 个 `verify_*.py` 能跑通（前端无回归）

---

## 7. 交付物要求
- 执行 claw 改完代码后，必须：① 把 `sync.js`、改动后的 `index.html`/`learn.html`/`app.js`/`learn.js` 推到 GitHub main 分支（本仓库已 `vercel git connect`，push 即部署）；② 提交一个 `SUPABASE_SETUP.md` 记录建表 SQL 与所需环境变量；③ 在对话里明确列出「需要用户提供的信息」（SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY、是否开启 Email 确认）。
- 若执行 claw 没有 Supabase 凭证，应**先把所有前端代码改好并推送**（用占位 env 或 localStorage 降级默认开启），并清晰告知用户去 Supabase 建项目后填入凭证即可生效——不要卡在等凭证。

---

## 8. 已知环境坑（给执行 claw，避免踩）
- 本机（原开发机）`git push` 被墙，推送 GitHub 只能走 GitHub Contents API（PowerShell + PAT）。**执行 claw 若在别的机器，正常 git push 即可。**
- Vercel 部署用 `.vercelignore` 限制只传运行时文件；新增 `sync.js` 必须加进 `.vercelignore` 的白名单（或改为不忽略 js）。**注意：当前 `.vercelignore` 是 `*` 然后白名单放行，新增根目录 js 文件需同步更新白名单，否则部署丢失该文件。**
- 浏览器 `speechSynthesis`、音标 charset 等已有逻辑不要动。
- 验证 UI 用 Playwright 时，`getComputedStyle` 对点击后元素二次取值不可信，用截图+像素法。
