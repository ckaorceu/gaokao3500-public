# 模式入口重构：巧记移出单词卡（2026-08-01）

## 用户需求
"巧记模式不应该在单词里面选" —— 选择题/练习类模式不应作为单词卡上的 Tab，
模式选择应移到学习页之外（首页先选模式再进单词流），单词卡回归干净的复习态。

## 方案
- **巧记面板（💡 巧记方法）保留在学习页单词卡内** —— 这是核心"巧记"功能，本就该跟着单词走。
- **5 种练习模式移回首页**：看词记义 / 看义记词 / 听音拼写 / 看英选中 / 看中选英。
- 首页新增「练习模式」区：5 个模式卡片（名称+一句说明），选中态高亮；下方「▶ 开始练习」按钮
  按当前筛选队列的第一个词进入 `learn.html?mode=xxx&w=首词`。
- 学习页顶部移除 mode-tabs，改为只读 URL 的 `?mode=` 参数，并显示「模式：xxx」标签，
  不再记忆 localStorage 模式（避免"上次模式"让用户困惑为何模式变了）。

## 改动文件
- `index.html`：progress-block 后新增 `.mode-picker`（版本号 v7）。
- `app.js`：新增 `MODES`/`renderModePicker()`/`currentFilteredNames()`，init 调用；
  点 chip 更新 `selectedMode`，点开始 → 带筛选首词跳 `learn.html?mode=`。
- `learn.html`：删除 `#modeTabs`，learn-meta 加 `#modeLabel`；learn.js 版本 v10→v11。
- `learn.js`：`mode` 仅从 URL 取（去掉 localStorage 记忆 + tabs 事件 + 默认高亮行）；
  `show()` 渲染 `#modeLabel`；`MODE_LABELS` 映射。
- `style.css`：新增 `.mode-picker`/`.mode-picker-chips`/`.mode-chip(.active)`/`.start-btn`/`.mode-label`。

## 验证（Playwright，全 PASS）
- `verify_home_mode.py`：首页 5 模式卡片；选「看英选中」→ 进 `learn.html?mode=quizEn&w=a`，
  无 #modeTabs，modeLabel=「模式：看英选中」，4 选项；再选「看词记义」→ 显示「显示释义」按钮；0 JS 错误。
- `verify_modes.py`（改 URL 切换模式）：meaning/word/spelling + 巧记保存与重载持久化，0 错误。
- `verify_quiz.py`（改 URL 切换模式）：quizEn/quizCn 选项/反馈/禁用/数字键，0 错误。

## 教训（延续）
- Playwright 对点击后元素二次 getComputedStyle 不可信 → 本环境视觉验证优先截图+PIL 像素。
- CSS 空块缺右括号会搞崩后续所有规则 → 改 CSS 必跑断言。
- browser 工具沙箱阻塞、Playwright 无 cache_enabled、PowerShell GBK、模型不能读图。
