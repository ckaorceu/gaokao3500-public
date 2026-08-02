# 高效学习模式 — 间隔重复 + 分模式进度 + 薄弱词速攻（2026-08-01）

## 用户需求
1. "有没有高效学习模式" → 指出核心缺失是**定时复习（spaced repetition）**
2. "两个一起，另外每个模式的进度单独计算" → ①遗忘曲线排程 ②薄弱/未掌握速攻 ③每模式进度独立

## 实现

### 1. 间隔重复排程（每模式独立）
- 存储结构 `gaokao3500.sr.v1`：`SR[mode][name] = { l, due, iv }`
  - `l` 掌握等级（艾宾浩斯 0~5），`due` 到期时间戳(ms)，`iv` 间隔(天)
- 评级→目标等级→间隔映射：
  - `不会`→L0：iv=0（当天，due=now）
  - `模糊`→L1：iv=1 天
  - `一般`→L3：iv=3 天
  - `熟记`→L5：iv=7 天
- 排程：打分写回 `due = now + iv*DAY`，`sessionDone` Set 防 weak-drill 同词重复

### 2. 队列排序（buildQueue）
- `weakOnly`（drill=weak）：仅 lv 0/1 词
- 排序：到点优先（due<=now，更早者先）→ 未到点按 lv 升序（未学/低级先）→ 按 due 临近先
- `order=shuffle`：Fisher–Yates 打乱（独立于模式）

### 3. 首页入口
- 5 张模式卡片（`.mode-chip`），点击高亮，含 per-mode meta：`已学 N/3893 · 待复习 M`
- 练习范围 chips：`全部` / `只练未掌握`（drill=weak）
- `.due-note`：今日待复习合计 `#dueTotal`
- 「▶ 开始练习」按 `currentFilteredNames()[0]` 进 `learn.html?mode=&w=&order=&drill=`

### 4. 学习页（learn.js）
- `mode` 仅从 URL（不再记 localStorage），`#modeLabel` 显示当前模式
- 顶部 `#learnStats` 显示当前模式已学
- 巧记方法面板（💡）保留在单词卡内（跟词走）

## 验证
- `verify_sr.py`：meaning/abandon 打熟记→L5、due=7天；word/abandon 打模糊→L1、due=1天；两模式独立（meaning 仍 L5）；首页 meta 更新；0 JS错误 ✓
- `verify_drill.py`：首页 3893 词卡正常（无回归）；weak-drill 进入 zebra；seq 首词 a、shuffle 首词 grain（乱序生效）✓
- `verify_home_mode.py` / `verify_order.py` / `verify_quiz.py`：全部回归 PASS，0 JS错误 ✓

## 关键坑
- serve.py 原为单线程 + keep-alive，多页面测试时卡死（10048/10061）。改为 ThreadingTCPServer + `Connection: close` 后稳定。
- Playwright `getComputedStyle`/evaluate 对点击后元素二次取值不可信 → 视觉验证用截图+PIL 像素；SR 数据验证改用 `evaluate(localStorage.getItem)` 直接读 JSON。
- PowerShell GBK 编码 print 音标/emoji 报 UnicodeEncodeError → 验证输出写文件读或避开非 ASCII。

## 文件改动
- `app.js` 全文重写（SR 模型、renderModePicker 加 drill chips、dueTotal、分模式 meta）；版本 v13
- `learn.js` 大改（SR 帮助函数、buildQueue 间隔排序、weakOnly、rate 分模式写回）；版本 v12
- `index.html` drill chips + due-note + 版本号 v13
- `style.css` drill/order/mode 样式 + 版本 v8
- `serve.py` 改线程化 + 关闭 keep-alive
- 新建 `verify_sr.py` `verify_drill.py`
