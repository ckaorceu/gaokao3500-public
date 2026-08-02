# 多种巧记模式 — 实现 (2026-08-01)

## 需求
用户要求「多种巧记模式」，经确认 = 两类都要：
A) 多种记忆方法模板（每词可填多种巧记）
B) 多种学习测试方向

## A. 多类巧记模板（每词 4 类）
存储结构：`tricks[name] = {assoc, root, homo, ex}`（原为单一字符串）
- 🧠 联想记忆
- 🌱 词根词缀
- 🔊 谐音记忆
- 📖 例句

编辑入口：学习页底部「巧记方法」面板 → 编辑 → `<dialog>` 弹窗四栏输入，保存后展示在面板。
持久化：localStorage `gaokao3500.tricks.v1`。

## B. 三种学习测试方向
顶部 `mode-tabs` 切换，记忆在 localStorage `gaokao3500.mode`：
1. **看词记义**（meaning）：显示单词+音标+朗读，点「显示释义」才揭晓，再出现评级按钮（不认识/模糊/一般/熟记）
2. **看义记词**（word）：显示释义，输入框写英文，回车/核对 → 即时反馈对错，揭晓答案
3. **听音拼写**（spelling）：自动朗读单词，无文字，输入框拼写，核对反馈

## 文件改动
- `learn.html`：重写，加 mode-tabs + trick-panel + dialog
- `learn.js`：重写，showMeaning / showWord / showSpelling 三个渲染分支 + checkWord / checkSpelling 核对 + 4 类巧记读写
- `style.css`：加 `.mode-tabs`、`.answer-input`、`.check-result`、`.trick-panel`、`.trick-form` dialog 等样式
- `index.html` / `app.js`：未改（首页词卡仍进学习页，模式页内切换）

## 验证（verify_modes.py, headless chromium）
- ✅ 看词记义：单词 a、音标 `美 /ə, eɪ/ 英 /ə; eɪ/`、揭释义 OK
- ✅ 看义记词：提示释义显示、正确拼写 → ✅ 正确
- ✅ 听音拼写：错误输入 → ❌ 正确拼写：a
- ✅ 巧记 4 类编辑保存 → 面板 2 项展示
- ✅ 重载后巧记持久化
- ✅ 0 个 JS 错误

截图：shot_mode_meaning.png / shot_mode_word.png / shot_mode_spelling.png / shot_trick_dlg.png
