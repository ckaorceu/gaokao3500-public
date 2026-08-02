# SUPABASE_SETUP.md — 高考3500词后端配置说明

本文件记录把「高考3500词巧记」从纯静态升级为「账号 + 服务端数据库 + 跨设备同步」所需的
Supabase 配置步骤。前端代码改动见 `sync.js` / `config.js` 及已改动的 `app.js` `learn.js`
`index.html` `learn.html` `style.css` `.vercelignore`。

## 1. 已掌握的信息
- **SUPABASE_URL**：`https://bkuvirojzuetweondgrx.supabase.co`（已写入 `config.js`）
- **SUPABASE_SERVICE_ROLE_KEY**：已提供（仅用于服务端 / SQL，绝不下发前端）
- **SUPABASE_ANON_KEY**：⚠️ **待用户填写**，见第 3 步

## 2. 建表 + 开启 RLS（只需做一次）
1. 打开 Supabase 控制台 → 你的项目 → **SQL Editor**。
2. 新建查询，把 `supabase_schema.sql` 的完整内容粘贴进去，点击 **Run**。
   - 会创建两张表：`sr_progress`（间隔重复进度）、`tricks`（巧记）。
   - 自动开启 RLS，并建立两条 policy：`own sr` / `own tricks`，保证「只能访问自己的数据」。
3. 验证：在 **Table Editor** 中应能看到 `sr_progress` 与 `tricks` 两张空表。

## 3. 获取并填入 anon key（必做，否则站点以本地模式运行）
1. Supabase 控制台 → **Project Settings → API**。
2. 复制 **anon public** / **publishable** key（形如 `eyJ...` 或 `sb_publishable_...`）。
3. 打开仓库根目录 `config.js`，把：
   ```js
   SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY'
   ```
   替换为你的 anon key（**不是** service_role key）。
4. 提交并部署。部署后右上角出现「登录 / 注册」，即已接入云端。

> 若暂不填 anon key，站点自动降级为「本地 localStorage 模式」，功能与改造前完全一致，
> 等填入 key 后即自动启用云端同步，无需改其他代码。

## 4. 开启 Email 认证
- **Authentication → Providers → Email**：默认开启。
- 邮箱确认（Confirm emails）：建议**关闭**（否则注册后需点确认邮件才能登录，影响验收体验）。
  如需开启，请在 Supabase 配置 SMTP 或接受 Supabase 自带测试邮件限制。
- 请告知是否开启邮箱确认，以便验收清单对应调整。

## 5. 环境变量 / 密钥清单
| 名称 | 用途 | 位置 |
|------|------|------|
| SUPABASE_URL | 项目地址 | `config.js`（已填） |
| SUPABASE_ANON_KEY | 前端直连、受 RLS 保护 | `config.js`（**待填**） |
| SUPABASE_SERVICE_ROLE_KEY | 仅服务端 / SQL 管理，绕过 RLS | **绝不出现在前端** |

## 6. 安全红线
- ❌ 不要把 `service_role` 密钥写进 `config.js`、`sync.js` 或任何打包产物。
- ✅ 前端只用 anon key，所有写操作受 RLS 约束。
- ✅ 已对 `sr_progress` / `tricks` 开启 RLS 与 `auth.uid() = user_id` policy。

## 7. 验收（对应 BACKEND_SPEC.md §6）
- [ ] 注册新账号 → 学习 3 个词（含 1 个巧记）→ 登出
- [ ] 另一浏览器 / 隐身窗口登录同一账号 → 进度与巧记完整恢复
- [ ] 未登录用户：功能与改造前完全一致（localStorage 降级）
- [ ] RLS 验证：用 A 账号 token 无法读取 B 账号数据
- [ ] `npx vercel deploy --prod --yes --scope ckaorceus-projects` 部署成功，`https://word.tutw.fun` 正常
- [ ] 原有 `verify_*.py` 跑通

## 8. 部署注意（来自 BACKEND_SPEC.md §8）
- 本仓库 `.vercelignore` 为「黑名单 + 白名单」：已在白名单中加入 `!sync.js` 与 `!config.js`，
  否则这两个新文件部署时会丢失。
- 原开发机 `git push` 被墙，推送走 GitHub Contents API（PowerShell + PAT）；其他机器可正常 `git push`。
- 验证 UI 用 Playwright 时，`getComputedStyle` 点击后二次取值不可信，用截图 + 像素法。
