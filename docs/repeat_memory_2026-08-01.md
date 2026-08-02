# 增加"重复记忆"选项（2026-08-01，含上限可选）

## 需求
用户："增加一个重复记忆的选项" → 后续 "上限可以自由选择"

## 实现方案
**首页新增开关**：练习模式区 → 重复记忆（关/开）；开启后显示「重复次数上限」行，可选 `1次 / 2次 / 3次（默认）/ 5次 / ∞`。
开启后，本轮练习中你评 `不会(0)` 或 `模糊(1)` 的词，会自动重新排到队列末尾再练，直到评到 `一般/熟记` 或达到所选上限（∞ 表示不限次）。超限后正常推进。与间隔重复、薄弱词速攻正交。

## 改动
- `index.html`：mode-picker 内新增 `#repeatChips`（关/开）+ `#repeatMaxRow`（默认隐藏，含 `#repeatMaxChips` 1/2/3/5/∞）；app.js 版本 bump v15
- `app.js`：`selectedRepeat` / `selectedRepeatMax=3` 状态；repeat 开关事件控制 `#repeatMaxRow` 显隐；max 芯片事件存 `selectedRepeatMax`；开始练习 URL 追加 `&repeat=on` + 有限时 `&rmax=N`
- `learn.js`：`repeatOn=params.get('repeat')==='on'`；`REPEAT_LIMIT = (rmax 解析失败或<0) ? Infinity : rmax`；`rate()` 内判断 `(repeatCount[name]||0) < REPEAT_LIMIT` 才重排；learn.js 版本 bump v14
- `style.css`：复用 `.drill-row/.drill-chip`，无需新增

## 验证（verify_repeat.py，全 PASS，0 JS错误）
- 关：max 行隐藏；开：max 行可见、URL 带 `repeat=on`
- 上限=1：评不会 1 次入队（+1），第2次不再入队（rc=1）
- 上限=5：连续 5 次弱评 → rc=5、inQ=6
- ∞：连续 6 次弱评 → rc=6、inQ=7（持续重排）
- 回归：verify_sr / verify_drill / verify_quiz 全部 PASS

## 备注
测试通过 `evaluate` 直接定位 target 的 idx 并调用 `rate(0)`、读 `queue.filter`/`repeatCount` 状态断言；每次弱评前需重新定位 target（rate 会推进 idx）。
