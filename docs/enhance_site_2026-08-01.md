# 高考3500词巧记网站 — 增强改动 (2026-08-01)

## 本次三处改动

### 1. 音标优化：美/英分标
- 根因：`words.json` 原 `phonetic` 字段把 us+uk 拼成一个字符串（如 `ə, eɪ`），显示含义不明
- 修复：
  - `convert_words.py` 改为分别保留 `usphone` / `ukphone` 字段，重新生成 `words.json` 和 `words.js`
  - `app.js` 新增 `formatPhon()`：渲染为 `美 /us/  英 /uk/`，只显示有的（315 词无英音、15 词无美音）
  - `learn.js` 同样加 `formatPhon()`，学习页显示 `美 /ə, eɪ/  英 /ə; eɪ/`
- 统计：total 3893，无释义 0，无美音 15，无英音 315

### 2. 🔊 朗读按钮（浏览器内置 TTS，免后端）
- `learn.html` 卡片加 `<button class="speak" onclick="speakWord()">🔊</button>`，与单词名并排
- `learn.js` 新增 `speakWord()`：用 `SpeechSynthesisUtterance` + `lang='en-US'` 朗读当前词
- 样式在 `style.css`：圆形 38px 描边按钮，hover 变蓝

### 3. 闪卡紧凑化
- `style.css`：`.flashcard` padding 56→36、min-height 320→240；`.w` 字号 44→38px；`.ph`/`.pos` margin 缩小
- 新增 `.word-head` flex 布局（词名+朗读按钮并排）
- 验证：卡片高度 320 → 240

## 验证结果（Playwright, headless chromium）
- ✅ 学习页音标 `美 /ə, eɪ/  英 /ə; eɪ/`
- ✅ 朗读按钮存在 + speechSynthesis 支持
- ✅ 评级推进 1→2
- ✅ 0 个 JS 错误

## 当前网站文件
- `index.html` / `learn.html` / `style.css` / `app.js` / `learn.js` / `words.js` (3893 词)
- `serve.py`（本地 UTF-8 server，端口 8765，pid 10828）
- 数据源：`GaoKao_3500_raw.json`（qwerty-learner 高考词库，3893 条）
