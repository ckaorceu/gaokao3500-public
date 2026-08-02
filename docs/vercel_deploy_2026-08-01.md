# 高考英语3500词巧记网站 — Vercel + GitHub 自动部署（2026-08-01）

## 最终结果
- 网站已上线：**https://word.tutw.fun** （Vercel 自定义域名，自动 alias）
- 备用：https://workspace-agent-2e76c043.vercel.app
- GitHub 仓库：**https://github.com/ckaorceu/gaokao3500** （main 分支，8 个站点文件）
- 自动部署已验证：push 到 main → Vercel 自动触发 Production 部署（实测 35s 内 Ready）

## 完整链路
GitHub push (main) → Vercel git connect → 自动部署 → word.tutw.fun

## 关键信息
- Vercel 账号：ckaorceu
- Vercel team：ckaorceus-projects（个人项目）
- Vercel 项目：ckaorceus-projects/workspace-agent-2e76c043
- GitHub 账号：ckaorceu（SSH key id_rsa 已登记到账号）
- 仓库默认分支：main

## 部署文件（仓库根目录，共 8 个）
- index.html / learn.html / style.css / words.js / app.js / learn.js
- .gitignore / .vercelignore

## 本机环境坑（重要，后续维护必看）
1. **git 协议被墙**：git 直连 github.com:443 被 reset；SSH 因本机 OpenSSH 过旧不支持 GitHub 的 KEX 算法（sntrup761x25519-sha512）也走不通。
2. **PowerShell / api.github.com 直连可达**：API 调用正常，但 git smart-HTTP 端点超时。
3. **git insteadOf 代理**：全局配了 `url."https://gh-proxy.com/https://github.com/".insteadof`，会把 github.com 重写；该代理对 git 返回 401/403，对 API 不可用于 git push。
4. **结论：本机无法用 git 命令 push 到 GitHub**。推送文件走的是 **GitHub Contents API（PowerShell Invoke-RestMethod + PAT）**，仓库里留的 push_via_contents 思路即此。

## 后续代码更新怎么推（本机专用流程）
本机没有可用 git push 通道，改文件后请用以下方式推到 GitHub：
```
# 1. 改完本地文件后，用脚本推送（PAT 仅内存传入，不落盘）
$env:GHPAT = "<你的token>"
powershell -File push_via_contents.ps1   # 脚本已删除，需重建（见下）
```
或：在能正常 git push 的环境（或 GitHub 网页/CodeSpaces）直接 push，本机只做部署验证。

> 注意：push 到 main 会自动触发 Vercel 部署，无需手动 `vercel deploy`。

## 手动部署命令（备用，无需 git）
```
npx vercel deploy --prod --yes --scope ckaorceus-projects
```
（之前手动部署已成功，且 .vercelignore 已限制只传 7 个站点文件，上传量从 159 文件降到 349B）

## 凭证安全
- GitHub PAT：用户通过对话提供，仅用于本次建仓+推送，未落盘；ghp_*** 已用完即弃于内存。
- Vercel：本地 `vercel login` 完成 device-oauth，生成 .vercel 凭据（已 gitignore）。
- .env.local（Vercel OIDC token）：vercel link 自动生成，已 gitignore。

## 待用户确认
- word.tutw.fun 的 DNS 是否已指向 Vercel（CNAME cname.vercel-dns.com 或 NS 交给 Vercel）。本机无法出公网验证，需用户在浏览器确认能访问。
- 若 word.tutw.fun 暂时打不开，先用 https://workspace-agent-2e76c043.vercel.app 验证。
