# 新增两种选择题巧记模式 (2026-08-01)

## 用户指令
"加一个看英文选对应的中文翻译和看中文选对应的英文的巧记"

## 实现
- 学习页新增两个 Tab：
  - **看英选中** (quizEn)：显示单词+音标+🔊朗读 → 4 选 1 中文释义
  - **看中选英** (quizCn)：显示中文释义 → 4 选 1 英文单词
- 干扰项：从 WORDS 随机抽 3 个不同词的文本（buildOptions），正确项随机混入，顺序洗牌。
- 批改：`answerQuiz(btn, correct)` → 锁定全部选项、高亮（对=绿 #dcfce7、错=红 #fee2e2 + 同步高亮正确项）、显示反馈、展开正确释义、展示评级。
- 快捷键：选择题模式按 `1/2/3/4` 选对应选项。
- 版本号 bump：learn.html css/learn.js v6/v10。

## 验证（多层）
- verify_quiz.py：4 选项、反馈文案、选项禁用、key2 选择、5 个 Tab 全存在，0 JS 错误。
- verify_quiz_px.py 像素级：
  - 答对 → 正确项中心像素 (220,252,231)=绿 ✅
  - 答错 → 错项 (254,226,226)=红 ❌ + 正确项绿 ✅
- 综合回归 verify_modes.py 全 PASS，0 错误。

## 关键教训（重要反转）
排查"选项高亮不生效"时，用 `getComputedStyle(el)` 在 `pg.evaluate` 里反复返回 white，包括 inline `!important` 绿都不生效——一度以为 CSS 没应用/被吞。
最终用 **截图+PIL 读按钮中心像素** 证明样式其实完全正确（绿/红像素真实存在）。
**结论**：本环境下 Playwright `evaluate` 里对刚 click 的元素二次 query 得到的 computed 样式不可信（疑似 detached 引用/序列化问题）。以后验证视觉生效**优先用"截图+PNG 中心像素"**，比 getComputedStyle 可靠；getComputedStyle 仅作辅助。

## 文件
- 改：learn.html（2 tab + v6/v10）、learn.js（showQuizEn/showQuizCn/answerQuiz/buildOptions/shuffle + 快捷键）、style.css（.quiz-opts/.opt/.opt.ok/.opt.bad + v6）
- 新建：verify_quiz.py / verify_quiz_style.py / verify_quiz_px.py / shot_quiz*.py / dbg_quiz*.py
