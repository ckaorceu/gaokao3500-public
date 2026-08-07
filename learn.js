// learn.js — 学习页（多模式 + 多类巧记 + 间隔重复）
const $ = (s) => document.querySelector(s);
const MODES = ['meaning', 'word', 'spelling', 'quizEn', 'quizCn'];

const SR_KEY = 'gaokao3500.sr.v1';
const TRICK_KEY = 'gaokao3500.tricks.v1';
const DAY = 86400000;

// 初始为空，数据在 Sync.loadAll() 完成后填充（见文件末尾 init）
let SR = {};
let tricks = {};
function saveSR() { Sync.saveSR(SR); }

const params = new URLSearchParams(location.search);
const startName = params.get('w');
const rangeFrom = parseInt(params.get('from') || '', 10);  // 单元学习范围（含）
const rangeTo = parseInt(params.get('to') || '', 10);      // 单元学习范围（不含，WORDS 索引）
const MODE_LABELS = {
  meaning: '看词记义',
  word: '看义记词',
  spelling: '听音拼写',
  quizEn: '看英选中',
  quizCn: '看中选英',
};
const MODE_ICONS = {
  meaning: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiID8+PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iNjQiIGhlaWdodD0iNjQiPjxwYXRoIGZpbGw9IiM0RjQ2RTUiIHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIDEgNS4zMzMzMyAxMy4zMzMzKSIgZD0iTTQxLjUxMjMgMy41OTM0UTM1LjAyMTkgLTAuOSAyNi42NjY3IC0wLjlRMTguMzExNCAtMC45IDExLjgyMSAzLjU5MzRRNS4yNzU1IDguMTI0OSAtMC43NzE3IDE4LjIwMzZRLTAuOTAyNCAxOC40MTY3IC0wLjkgMTguNjY2N1EtMC45MDI0IDE4LjkxNjYgLTAuNzcxNyAxOS4xMjk3UTUuMjc1NSAyOS4yMDg1IDExLjgyMSAzMy43NFExOC4zMTE1IDM4LjIzMzMgMjYuNjY2NyAzOC4yMzMzUTM1LjAyMTkgMzguMjMzMyA0MS41MTIzIDMzLjc0UTQ4LjA1NzggMjkuMjA4NCA1NC4xMDUxIDE5LjEyOTdRNTQuMjM1NyAxOC45MTY2IDU0LjIzMzMgMTguNjY2N1E1NC4yMzU3IDE4LjQxNjcgNTQuMTA1MSAxOC4yMDM2UTQ4LjA1NzkgOC4xMjQ5IDQxLjUxMjMgMy41OTM0Wk0xMi44NDU2IDUuMDczM1ExOC44NzM3IDAuOSAyNi42NjY3IDAuOVEzNC40NTk2IDAuOSA0MC40ODc3IDUuMDczM1E0Ni41NjUxIDkuMjgwOCA1Mi4yODE3IDE4LjY2NjdRNDYuNTY1MiAyOC4wNTI1IDQwLjQ4NzcgMzIuMjZRMzQuNDU5NiAzNi40MzMzIDI2LjY2NjcgMzYuNDMzM1ExOC44NzM3IDM2LjQzMzMgMTIuODQ1NiAzMi4yNlE2Ljc2ODIgMjguMDUyNiAxLjA1MTcgMTguNjY2N1E2Ljc2ODEgOS4yODA4IDEyLjg0NTYgNS4wNzMzWiIgZmlsbC1ydWxlPSJldmVub2RkIi8+PGNpcmNsZSBmaWxsPSJub25lIiBzdHJva2U9IiM0RjQ2RTUiIHN0cm9rZS13aWR0aD0iMS44IiB0cmFuc2Zvcm09Im1hdHJpeCgxIDAgMCAxIDIzLjQ2NjcgMjMuNDY2NykiIGN4PSI4LjUzMzMiIGN5PSI4LjUzMzMiIHI9IjguNTMzMyIvPjwvc3ZnPg==',
  word: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiID8+PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iNjQiIGhlaWdodD0iNjQiPjxwYXRoIGZpbGw9IiM0RjQ2RTUiIHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIDEgMTAuNjY2NyAxMikiIGQ9Ik0wLjUyNDggMzAuMjcxMlEwLjQ1ODYgMzAuNDA2IDAuNDQwMyAzMC41NTVMLTAuODkzIDQxLjIyMTdRLTAuOTUwNiA0MS41OTQ3IC0wLjcxMDQgNDEuODg1OVEtMC40ODc0IDQyLjE5MDQgLTAuMTExNiA0Mi4yMjY0US0wLjA1NiA0Mi4yMzMzIDAgNDIuMjMzM1EwLjA1NiA0Mi4yMzMzIDAuMTExNiA0Mi4yMjY0TDEwLjc3ODMgNDAuODkzUTEwLjkyNzMgNDAuODc0OCAxMS4wNjIxIDQwLjgwODVRMTEuMTk3MSA0MC43NDI4IDExLjMwMzEgNDAuNjM2NEw0MS45Njk3IDkuOTY5N1E0Mi4yNDQyIDkuNzEwNiA0Mi4yMzMzIDkuMzMzM1E0Mi4yNDQyIDguOTU2IDQxLjk2OTcgOC42OTY5TDMyLjYzNjQgLTAuNjM2NFEzMi4zNzczIC0wLjkxMDkgMzIgLTAuOVEzMS42MjI3IC0wLjkxMDkgMzEuMzYzNiAtMC42MzY0TDAuNjk2OSAzMC4wMzAzUTAuNTkwNSAzMC4xMzYyIDAuNTI0OCAzMC4yNzEyWk0yLjE4ODEgMzEuMDg0N0wxLjAzNjYgNDAuMjk2OEwxMC4yNDg2IDM5LjE0NTJMNDAuMDYwNSA5LjMzMzNMMzIgMS4yNzI4TDIuMTg4MSAzMS4wODQ3WiIgZmlsbC1ydWxlPSJldmVub2RkIi8+PHBhdGggZmlsbD0iIzRGNDZFNSIgdHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgMSAzOC42NjY3IDE4LjY2NjcpIiBkPSJNOC42MzY0IDcuMzYzNkwwLjYzNjQgLTAuNjM2NFEwLjM3NzMgLTAuOTEwOSAwIC0wLjlRLTAuMzc3MyAtMC45MTA5IC0wLjYzNjQgLTAuNjM2NFEtMC45MTA5IC0wLjM3NzMgLTAuOSAwUS0wLjkxMDkgMC4zNzczIC0wLjYzNjQgMC42MzY0TDcuMzYzNiA4LjYzNjRRNy42MjI3IDguOTEwOSA4IDguOVE4LjM3NzMgOC45MTA5IDguNjM2NCA4LjYzNjRROC45MTA5IDguMzc3MyA4LjkgOFE4LjkxMDkgNy42MjI3IDguNjM2NCA3LjM2MzZaIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=',
  spelling: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiID8+PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iNjQiIGhlaWdodD0iNjQiPjxwYXRoIGZpbGw9IiM0RjQ2RTUiIHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIDEgMTAuNjY2NyAxMC42NjY3KSIgZD0iTS0wLjkgMTguNjY2N0wtMC45IDI0US0wLjkxMDkgMjQuMzc3MyAtMC42MzY0IDI0LjYzNjRRLTAuMzc3MyAyNC45MTA5IDAgMjQuOVEwLjM3NzMgMjQuOTEwOSAwLjYzNjQgMjQuNjM2NFEwLjkxMDkgMjQuMzc3MyAwLjkgMjRMMC45IDE4LjY2NjdRMC45IDE0LjkzNzEgMi40NTk3IDExLjYzNDNRMy45Njk4IDguNDM2MyA2Ljc1NzIgNi4wMTI1UTkuNTQ5NCAzLjU4NDUgMTMuMjQwNiAyLjI2NDFRMTcuMDUzOSAwLjkgMjEuMzMzMyAwLjlRMjUuNjEyOCAwLjkgMjkuNDI2IDIuMjY0MVEzMy4xMTczIDMuNTg0NSAzNS45MDk0IDYuMDEyNVEzOC42OTY4IDguNDM2MyA0MC4yMDcgMTEuNjM0M1E0MS43NjY3IDE0LjkzNzEgNDEuNzY2NyAxOC42NjY3TDQxLjc2NjcgMjRRNDEuNzU1OCAyNC4zNzczIDQyLjAzMDMgMjQuNjM2NFE0Mi4yODk0IDI0LjkxMDkgNDIuNjY2NyAyNC45UTQzLjA0NCAyNC45MTA5IDQzLjMwMzEgMjQuNjM2NFE0My41Nzc1IDI0LjM3NzMgNDMuNTY2NyAyNEw0My41NjY3IDE4LjY2NjdRNDMuNTY2NyAxNC41MzM1IDQxLjgzNDcgMTAuODY1N1E0MC4xNjMxIDcuMzI2IDM3LjA5MDUgNC42NTQyUTM0LjA0MjcgMi4wMDM5IDMwLjAzMjMgMC41NjkyUTI1LjkyNTEgLTAuOSAyMS4zMzMzIC0wLjlRMTYuNzQxNiAtMC45IDEyLjYzNDQgMC41NjkyUTguNjI0IDIuMDAzOSA1LjU3NjEgNC42NTQyUTIuNTAzNSA3LjMyNiAwLjgzMiAxMC44NjU3US0wLjkgMTQuNTMzNSAtMC45IDE4LjY2NjdaIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48cmVjdCBmaWxsPSJub25lIiBzdHJva2U9IiM0RjQ2RTUiIHN0cm9rZS13aWR0aD0iMS44IiB0cmFuc2Zvcm09Im1hdHJpeCgxIDAgMCAxIDggMzMuMzMzMykiIHdpZHRoPSIxMC42NjY3IiBoZWlnaHQ9IjE4LjY2NjciIHJ4PSIyIiByeT0iMiIvPjxyZWN0IGZpbGw9Im5vbmUiIHN0cm9rZT0iIzRGNDZFNSIgc3Ryb2tlLXdpZHRoPSIxLjgiIHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIDEgNDUuMzMzMyAzMy4zMzMzKSIgd2lkdGg9IjEwLjY2NjciIGhlaWdodD0iMTguNjY2NyIgcng9IjIiIHJ5PSIyIi8+PC9zdmc+',
  quizEn: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiID8+PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iNjQiIGhlaWdodD0iNjQiPjxyZWN0IGZpbGw9Im5vbmUiIHN0cm9rZT0iIzRGNDZFNSIgc3Ryb2tlLXdpZHRoPSIxLjgiIHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIDEgOCAxMC42NjY3KSIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjEzLjMzMzMiIHJ4PSIyLjUiIHJ5PSIyLjUiLz48cmVjdCBmaWxsPSJub25lIiBzdHJva2U9IiM0RjQ2RTUiIHN0cm9rZS13aWR0aD0iMS44IiB0cmFuc2Zvcm09Im1hdHJpeCgxIDAgMCAxIDggMzcuMzMzMykiIHdpZHRoPSI0OCIgaGVpZ2h0PSIxMy4zMzMzIiByeD0iMi41IiByeT0iMi41Ii8+PHBhdGggZmlsbD0iIzRGNDZFNSIgdHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgMSAxNy4zMzMzIDE0LjY2NjcpIiBkPSJNMi42NjY3IDQuMDYwNUwwLjYzNjQgMi4wMzAzUTAuMzc3MyAxLjc1NTggMCAxLjc2NjdRLTAuMzc3MyAxLjc1NTggLTAuNjM2NCAyLjAzMDNRLTAuOTEwOSAyLjI4OTQgLTAuOSAyLjY2NjdRLTAuOTEwOSAzLjA0NCAtMC42MzY0IDMuMzAzMUwyLjAzMDMgNS45Njk3UTIuMjg5NCA2LjI0NDIgMi42NjY3IDYuMjMzM1EzLjA0NCA2LjI0NDIgMy4zMDMxIDUuOTY5N0w4LjYzNjQgMC42MzY0UTguOTEwOSAwLjM3NzMgOC45IDBROC45MTA5IC0wLjM3NzMgOC42MzY0IC0wLjYzNjRROC4zNzczIC0wLjkxMDkgOCAtMC45UTcuNjIyNyAtMC45MTA5IDcuMzYzNiAtMC42MzY0TDIuNjY2NyA0LjA2MDVaIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48ZWxsaXBzZSBmaWxsPSIjRjU5RTBCIiB0cmFuc2Zvcm09Im1hdHJpeCgxIDAgMCAxIDI3LjczMzMgMzkuNzMzMykiIGN4PSI0LjI2NjciIGN5PSI0LjI2NjciIHJ4PSI0LjI2NjciIHJ5PSI0LjI2NjciLz48L3N2Zz4=',
  quizCn: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiID8+PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iNjQiIGhlaWdodD0iNjQiPjxwYXRoIGZpbGw9IiM0RjQ2RTUiIHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIDEgMTAuNjY2NyAyNCkiIGQ9Ik0yOS4zMzMzIC0wLjlMMCAtMC45US0wLjM3NzMgLTAuOTEwOSAtMC42MzY0IC0wLjYzNjRRLTAuOTEwOSAtMC4zNzczIC0wLjkgMFEtMC45MTA5IDAuMzc3MyAtMC42MzY0IDAuNjM2NFEtMC4zNzczIDAuOTEwOSAwIDAuOUwyOS4zMzMzIDAuOVEyOS43MTA2IDAuOTEwOSAyOS45Njk3IDAuNjM2NFEzMC4yNDQyIDAuMzc3MyAzMC4yMzMzIDBRMzAuMjQ0MiAtMC4zNzczIDI5Ljk2OTcgLTAuNjM2NFEyOS43MTA2IC0wLjkxMDkgMjkuMzMzMyAtMC45WiIgZmlsbC1ydWxlPSJldmVub2RkIi8+PHBhdGggZmlsbD0iIzRGNDZFNSIgdHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgMSAzMiAxNikiIGQ9Ik04LjYzNjQgNy4zNjM2TDAuNjM2NCAtMC42MzY0UTAuMzc3MyAtMC45MTA5IDAgLTAuOVEtMC4zNzczIC0wLjkxMDkgLTAuNjM2NCAtMC42MzY0US0wLjkxMDkgLTAuMzc3MyAtMC45IDBRLTAuOTEwOSAwLjM3NzMgLTAuNjM2NCAwLjYzNjRMNi43MjcyIDhMLTAuNjM2NCAxNS4zNjM2US0wLjkxMDkgMTUuNjIyNyAtMC45IDE2US0wLjkxMDkgMTYuMzc3MyAtMC42MzY0IDE2LjYzNjRRLTAuMzc3MyAxNi45MTA5IDAgMTYuOVEwLjM3NzMgMTYuOTEwOSAwLjYzNjQgMTYuNjM2NEw4LjYzNjQgOC42MzY0UTguOTEwOSA4LjM3NzMgOC45IDhROC45MTA5IDcuNjIyNyA4LjYzNjQgNy4zNjM2WiIgZmlsbC1ydWxlPSJldmVub2RkIi8+PHBhdGggZmlsbD0iIzRGNDZFNSIgdHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgMSAyNCA0MCkiIGQ9Ik0wIDAuOUwyOS4zMzMzIDAuOVEyOS43MTA2IDAuOTEwOSAyOS45Njk3IDAuNjM2NFEzMC4yNDQyIDAuMzc3MyAzMC4yMzMzIDBRMzAuMjQ0MiAtMC4zNzczIDI5Ljk2OTcgLTAuNjM2NFEyOS43MTA2IC0wLjkxMDkgMjkuMzMzMyAtMC45TDAgLTAuOVEtMC4zNzczIC0wLjkxMDkgLTAuNjM2NCAtMC42MzY0US0wLjkxMDkgLTAuMzc3MyAtMC45IDBRLTAuOTEwOSAwLjM3NzMgLTAuNjM2NCAwLjYzNjRRLTAuMzc3MyAwLjkxMDkgMCAwLjlaIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48cGF0aCBmaWxsPSIjNEY0NkU1IiB0cmFuc2Zvcm09Im1hdHJpeCgxIDAgMCAxIDI0IDMyKSIgZD0iTTEuMjcyOCA4TDguNjM2NCAwLjYzNjRROC45MTA5IDAuMzc3MyA4LjkgMFE4LjkxMDkgLTAuMzc3MyA4LjYzNjQgLTAuNjM2NFE4LjM3NzMgLTAuOTEwOSA4IC0wLjlRNy42MjI3IC0wLjkxMDkgNy4zNjM2IC0wLjYzNjRMLTAuNjM2NCA3LjM2MzZRLTAuOTEwOSA3LjYyMjcgLTAuOSA4US0wLjkxMDkgOC4zNzczIC0wLjYzNjQgOC42MzY0TDcuMzYzNiAxNi42MzY0UTcuNjIyNyAxNi45MTA5IDggMTYuOVE4LjM3NzMgMTYuOTEwOSA4LjYzNjQgMTYuNjM2NFE4LjkxMDkgMTYuMzc3MyA4LjkgMTZROC45MTA5IDE1LjYyMjcgOC42MzY0IDE1LjM2MzZMMS4yNzI4IDhaIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=',
};
function modeLabelHtml() {
  return '模式：<img class="mode-ico" src="' + (MODE_ICONS[mode] || '') + '" alt=""> ' + (MODE_LABELS[mode] || '看词记义');
}
let mode = params.get('mode') || 'meaning';
if (!MODE_LABELS[mode]) mode = 'meaning';
const shuffleOrder = params.get('order') === 'shuffle';
const weakOnly = params.get('drill') === 'weak';
const wrongOnly = params.get('drill') === 'wrong';
const easyOnly = params.get('drill') === 'easy';       // 太简单词本：只练太简单的词（可被取消标记）
const masteredOnly = params.get('drill') === 'mastered'; // 已掌握词本：只练已掌握的词（可被取消标记）
let repeatOn = params.get('repeat') === 'on';   // 重复记忆：评不会/模糊自动重练（运行时可按 R 切换）
const REPEAT_MAX = parseInt(params.get('rmax') || '', 10);  // 上限；NaN 或 -1 表示无限
const REPEAT_LIMIT_RAW = isNaN(REPEAT_MAX) || REPEAT_MAX < 0 ? Infinity : REPEAT_MAX;
// 安全上限：防止「重复记忆 + 无限次」下队列无限膨胀（review 建议的硬上限）
const REPEAT_HARD_CAP = 10;
const REPEAT_LIMIT = Math.min(REPEAT_LIMIT_RAW, REPEAT_HARD_CAP);
const repeatCount = {};                           // name -> 本轮已重复次数

function srOf(name) { return (SR[mode] && SR[mode][name]) || { l: 0, due: 0, iv: 0 }; }
function bestLevel(name) { let m = 0; for (const k in SR) { const r = SR[k] && SR[k][name]; if (r && r.l > m) m = r.l; } return m; }

// ---- 标记体系（太简单 / 重难词 / 已掌握） ----
// 标记选项总开关：关闭后，学习页不再渲染标记按钮、也不应用「太简单退役 / 重难优先」逻辑
// 全局「标记体系」功能开关（后台 feature_flags 管理）；未配置时默认开
function marksFeatureOn() {
  try {
    if (window.Sync && typeof Sync.flagOn === 'function' && Sync.flagOn('learning.marks_enabled') === false) return false;
  } catch (e) {}
  return true;
}
function showMarks() {
  if (!marksFeatureOn()) return false;
  try { return localStorage.getItem('gaokao3500.showMarks') === '1'; } catch (e) { return false; }
}
function flagOf(name) { const t = tricks[name]; return (t && t.flag) || null; }
function isEasy(name) { return flagOf(name) === 'easy'; }
function isHard(name) { return flagOf(name) === 'hard'; }
function isMastered(name) { return flagOf(name) === 'mastered'; }
// 切换单词标记；再次点击同一标记则取消。重难词/太简单会改变队列，故重建。
function setFlag(name, fv) {
  if (!tricks[name]) tricks[name] = {};
  const cur = tricks[name].flag || null;
  tricks[name].flag = (cur === fv) ? null : fv;
  Sync.saveTricksNow(tricks);
  queue = buildQueue();
  if (idx >= queue.length) idx = 0;
  show();
}
function renderFlagBar(name) {
  const el = document.getElementById('flagBar');
  if (!el) return;
  if (!showMarks()) { el.style.display = 'none'; el.innerHTML = ''; el.onclick = null; return; }
  el.style.display = '';
  const f = flagOf(name);
  el.innerHTML =
    `<button class="flag-btn${f === 'easy' ? ' on easy' : ''}" data-name="${escapeHtml(name)}" data-flag="easy" title="点此标记；已选时再点取消">✅ 太简单</button>` +
    `<button class="flag-btn${f === 'hard' ? ' on hard' : ''}" data-name="${escapeHtml(name)}" data-flag="hard" title="点此标记；已选时再点取消">⭐ 重难词</button>` +
    `<button class="flag-btn${f === 'mastered' ? ' on mastered' : ''}" data-name="${escapeHtml(name)}" data-flag="mastered" title="点此标记；已选时再点取消">🟢 已掌握</button>` +
    `<button class="flag-btn clear${f ? ' on' : ''}" data-name="${escapeHtml(name)}" data-flag="clear" title="清除当前标记">✕ 清除标记</button>`;
  // 事件委托：避免 onclick 字符串拼接导致的撇号词（如 O'Brien）点击失效 / 注入
  el.onclick = function (e) {
    const b = e.target.closest('.flag-btn');
    if (!b) return;
    const nm = b.getAttribute('data-name');
    const fl = b.getAttribute('data-flag');
    if (fl === 'clear') clearFlag(nm); else setFlag(nm, fl);
  };
}
// 清除某词的标记（让 three 个开关都能关掉）
function clearFlag(name) {
  if (!tricks[name]) tricks[name] = {};
  if (!tricks[name].flag) return;   // 本就无标记
  tricks[name].flag = null;
  Sync.saveTricksNow(tricks);
  queue = buildQueue();
  if (idx >= queue.length) idx = 0;
  show();
}
// 自动打标：未掌握词（当前模式 SRS 等级 L1~L2）自动标记为重难词，
// 使其同时出现在「重难词本」；掌握（L>=3）则自动撤下重难标记。
// 仅当标记功能开启时生效；不覆盖用户主动标记的「太简单 / 已掌握」。
function applyAutoHard(name, resLv) {
  if (!marksFeatureOn()) return;                  // 标记功能关闭时不自动打标（重难词本本就隐藏）
  if (!tricks[name]) tricks[name] = {};
  const cur = tricks[name].flag || null;
  if (resLv >= 1 && resLv <= 2) {
    if (cur !== 'easy' && cur !== 'mastered') tricks[name].flag = 'hard';   // 薄弱 → 自动重难
  } else if (resLv >= 3) {
    if (cur === 'hard') tricks[name].flag = null;                            // 已掌握 → 撤下自动产生的重难标记
  }
}

// ---- 每词记忆历史曲线 ----
// 把该词全部模式的记忆记录聚合成时序（t 时间戳, r 1=记得/0=遗忘）
function wordHistory(name) { return (tricks[name] && tricks[name].h) || []; }
function buildCurveSvg(h) {
  if (!h.length) return '<div class="empty">暂无记忆记录，多评几次就会出现曲线 📈</div>';
  const W = 320, H = 120, pad = 16, n = h.length;
  const xs = i => pad + (W - 2 * pad) * (n === 1 ? 0.5 : i / (n - 1));
  const ys = r => (r ? H - pad - 8 : pad + 8);
  const pts = h.map((e, i) => `${xs(i).toFixed(1)},${ys(e.r).toFixed(1)}`).join(' ');
  const dots = h.map((e, i) => `<circle cx="${xs(i).toFixed(1)}" cy="${ys(e.r).toFixed(1)}" r="3" fill="${e.r ? '#2f6bff' : '#e0533d'}"></circle>`).join('');
  const grid = `<line x1="${pad}" y1="${ys(1)}" x2="${W - pad}" y2="${ys(1)}" stroke="#e3e8f0" stroke-dasharray="3 3"></line>` +
    `<line x1="${pad}" y1="${ys(0)}" x2="${W - pad}" y2="${ys(0)}" stroke="#e3e8f0" stroke-dasharray="3 3"></line>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="curve-svg" preserveAspectRatio="xMidYMid meet">${grid}<polyline points="${pts}" fill="none" stroke="#9bb4ff" stroke-width="2"></polyline>${dots}</svg>`;
}
function curveStats(h) {
  if (!h.length) return '';
  const rate = (h.reduce((a, e) => a + e.r, 0) / h.length * 100).toFixed(0);
  let shape = '记忆较平稳';
  if (h.length >= 3) {
    const first = h[0].r, last = h[h.length - 1].r;
    if (first === 1 && last === 0) shape = '先会后忘，注意巩固';
    else if (h.some(e => e.r === 0) && h.some(e => e.r === 1)) shape = '起伏不定，建议重点练';
  }
  return `<div class="curve-stats">共 <b>${h.length}</b> 次 · 记忆率 <b>${rate}%</b> · ${shape}</div>`;
}
function showCurve() {
  if (window.Sync && typeof Sync.flagOn === 'function' && Sync.flagOn('learning.curve_enabled') === false) return;
  const { w } = queue[idx];
  const h = wordHistory(w.name);
  document.getElementById('curveWord').textContent = w.name;
  document.getElementById('curveBody').innerHTML = buildCurveSvg(h) + curveStats(h);
  document.getElementById('curveDlg').showModal();
}
function closeCurve() { const d = document.getElementById('curveDlg'); if (d) d.close(); }
function getDue(name) { const r = srOf(name); return r.due || 0; }
function modeLearned(m) { const mm = SR[m] || {}; let c = 0; for (const n in mm) if (mm[n].l > 0) c++; return c; }
function modeDue(m) { const now = Date.now(); const mm = SR[m] || {}; let c = 0; for (const n in mm) if (mm[n].due <= now) c++; return c; }

// 复习队列：待复习(到点)优先，其次未学，最后远期；乱序则打乱
function buildQueue() {
  const baseWords = (isNaN(rangeFrom) && isNaN(rangeTo)) ? WORDS
    : WORDS.slice(isNaN(rangeFrom) ? 0 : rangeFrom, isNaN(rangeTo) ? WORDS.length : rangeTo);
  let arr = baseWords.map(w => ({ w, lv: srOf(w.name).l || 0 }));
  if (weakOnly) arr = arr.filter(x => x.lv === 1 || x.lv === 2);
  if (wrongOnly) arr = arr.filter(x => { const b = bestLevel(x.w.name); return b >= 1 && b <= 2; });
  if (showMarks()) {
    if (easyOnly) arr = arr.filter(x => isEasy(x.w.name));
    else if (masteredOnly) arr = arr.filter(x => isMastered(x.w.name));
    else arr = arr.filter(x => !isEasy(x.w.name));   // 太简单：整体退役，不再出现
  }
  const now = Date.now();
  arr.sort((a, b) => {
    const ha = isHard(a.w.name) ? 0 : 1, hb = isHard(b.w.name) ? 0 : 1;
    if (ha !== hb) return ha - hb;            // 重难词优先
    const da = getDue(a.w.name), db = getDue(b.w.name);
    const oa = da <= now ? 0 : 1, ob = db <= now ? 0 : 1;
    if (oa !== ob) return oa - ob;            // 到点优先
    if (oa === 0) return da - db;             // 都到点，更早的先
    const la = srOf(a.w.name).l || 0, lb = srOf(b.w.name).l || 0;
    if (la !== lb) return la - lb;            // 未学/低级优先
    return da - db;                           // 未到的，临近先
  });
  if (shuffleOrder) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  return arr;
}

// 错词本列表视图（drill=wrong 且无指定词 w 时进入，先列清单再选模式纠错）
let listMode = '';   // '' = 全部模式（bestLevel L1~L2）；'meaning'/'word'/... = 该模式下 L1~L2 的错词
let wrongPage = 0;   // 错词本列表分页当前页（每页 20 条）
function wrongListFilter(w) {
  if (listMode === '') { const b = bestLevel(w.name); return b >= 1 && b <= 2; }
  const r = (SR[listMode] && SR[listMode][w.name]) || { l: 0 };
  return r.l >= 1 && r.l <= 2;
}
function showCurveFor(name) {
  if (window.Sync && typeof Sync.flagOn === 'function' && Sync.flagOn('learning.curve_enabled') === false) return;
  const h = wordHistory(name);
  document.getElementById('curveWord').textContent = name;
  document.getElementById('curveBody').innerHTML = buildCurveSvg(h) + curveStats(h);
  document.getElementById('curveDlg').showModal();
}
function renderWrongList() {
  const fc = $('#flashcard'), act = $('#actions'), tp = $('#trickPanel');
  if (fc) fc.style.display = 'none';
  if (act) act.style.display = 'none';
  if (tp) tp.style.display = 'none';
  const wl = $('#wrongList');
  wl.hidden = false;
  const curveOn = !(window.Sync && typeof Sync.flagOn === 'function' && Sync.flagOn('learning.curve_enabled') === false);
  const modes = [{ k: '', label: '全部模式' }].concat(MODES.map(m => ({ k: m, label: MODE_LABELS[m] })));
  const chips = modes.map(mo => `<div class="drill-chip ${listMode === mo.k ? 'active' : ''}" data-lm="${escapeHtml(mo.k)}">${escapeHtml(mo.label)}</div>`).join('');
  const list = WORDS.filter(wrongListFilter);
  const PAGE = 20;
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE));
  if (wrongPage >= totalPages) wrongPage = totalPages - 1;
  if (wrongPage < 0) wrongPage = 0;
  const pageItems = list.slice(wrongPage * PAGE, wrongPage * PAGE + PAGE);
  const items = pageItems.map(w => {
    const lv = listMode === '' ? bestLevel(w.name) : ((SR[listMode] && SR[listMode][w.name]) || { l: 0 }).l;
    const h = wordHistory(w.name);
    const rate = h.length ? Math.round(h.reduce((a, e) => a + e.r, 0) / h.length * 100) : 0;
    const curveBtn = curveOn ? `<button class="wl-curve" data-name="${escapeHtml(w.name)}">📈 曲线</button>` : '';
    return `<div class="wl-item collapsed" data-name="${escapeHtml(w.name)}">
      <div class="wl-main">
        <div class="wl-word"><span class="wl-arrow">▸</span>${escapeHtml(w.name)}<span class="wl-pos">${escapeHtml(w.pos || '')}</span></div>
        <div class="wl-mean">${escapeHtml(w.mean || '')}</div>
      </div>
      <div class="wl-meta">L${lv} · 记忆率 ${rate}%</div>
      <div class="wl-acts">
        <button class="wl-fix" data-name="${escapeHtml(w.name)}">纠错</button>
        ${curveBtn}
      </div>
    </div>`;
  }).join('');
  const pager = list.length > 0 ? `<div class="wl-pager">
      <button class="wl-prev" ${wrongPage === 0 ? 'disabled' : ''}>‹ 上一页</button>
      <span class="wl-page">第 ${wrongPage + 1} / ${totalPages} 页</span>
      <button class="wl-next" ${wrongPage >= totalPages - 1 ? 'disabled' : ''}>下一页 ›</button>
    </div>` : '';
  wl.innerHTML = `<div class="wl-head"><div class="wl-title">错词本 · 共 <b>${list.length}</b> 词</div>
      <button class="wl-start" id="wlStart">开始练习</button></div>
    <div class="wl-modes">${chips}</div>
    <div class="wl-items">${items || '<div class="empty">暂无错词 🎉 去练练别的吧</div>'}</div>${pager}`;
  wl.querySelectorAll('.drill-chip').forEach(c => c.onclick = () => { listMode = c.dataset.lm; wrongPage = 0; renderWrongList(); });
  const start = document.getElementById('wlStart');
  if (start) start.onclick = () => { location.href = 'learn.html?mode=' + (listMode || 'meaning') + '&drill=wrong'; };
  wl.querySelectorAll('.wl-fix').forEach(b => b.onclick = () => { location.href = 'learn.html?mode=' + (listMode || 'meaning') + '&drill=wrong&w=' + encodeURIComponent(b.dataset.name); });
  wl.querySelectorAll('.wl-curve').forEach(b => b.onclick = () => showCurveFor(b.dataset.name));
  // 点击行（除按钮外）折叠/展开释义
  wl.querySelectorAll('.wl-item').forEach(it => it.onclick = (e) => {
    if (e.target.closest('button')) return;
    it.classList.toggle('collapsed');
  });
  const prev = wl.querySelector('.wl-prev');
  if (prev) prev.onclick = () => { if (wrongPage > 0) { wrongPage--; renderWrongList(); } };
  const next = wl.querySelector('.wl-next');
  if (next) next.onclick = () => { if (wrongPage < totalPages - 1) { wrongPage++; renderWrongList(); } };
  applyLearnGates();
}
let queue = [];
let idx = 0;


// 例句 HTML（主卡片用）：高亮例句中的目标单词（先转义防 XSS，再注入 <mark>）
function exampleHtml(w) {
  if (window.Sync && typeof Sync.flagOn === 'function' && Sync.flagOn('content.examples_enabled') === false) return '';
  if (!w.ex) return '';
  let html = escapeHtml(w.ex);
  const term = escapeHtml(w.name);
  if (term) {
    try {
      const re = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      html = html.replace(re, '<mark>$1</mark>');
    } catch (e) {}
  }
  return '<div class="ex">📖 ' + html + '</div>';
}

// 朗读（真人发音：有道 dictvoice，回退浏览器 TTS）
function speakWord() {
  if (window.Sync && typeof Sync.flagOn === 'function' && Sync.flagOn('content.realvoice_enabled') === false) return;
  const { w } = queue[idx];
  if (!w || !w.name) return;
  speakText(w.name, getAccent());
}

// 英美音切换时重渲染当前卡片音标
window.onAccentChange = function () { try { if (typeof show === 'function') show(); } catch (e) {} };

// 评级按钮（共用）
function rateButtons() {
  return `<button class="rbtn warn" onclick="rate(1)">不会</button>
    <button class="rbtn" onclick="rate(2)">模糊</button>
    <button class="rbtn" onclick="rate(3)">一般</button>
    <button class="rbtn primary" onclick="rate(4)">熟记</button>`;
}


// 从其他词随机抽 3 个不重复干扰项（O(3) 抽样，避免每次全量洗牌 3500 词）
function buildOptions(correctWord, correctText, distractorText) {
  const n = WORDS.length, used = new Set(), distract = [];
  while (distract.length < 3 && used.size < n) {
    const i = Math.floor(Math.random() * n);
    if (used.has(i)) continue;
    used.add(i);
    const x = WORDS[i];
    if (x.name === correctWord.name) continue;
    distract.push(x);
  }
  const opts = shuffle([
    { text: correctText, correct: true },
    ...distract.map(x => ({ text: distractorText(x), correct: false }))
  ]);
  return opts;
}

// 显示选择题（通用）

// 渲染巧记面板
function renderTrick() {
  const { w } = queue[idx];
  const t = tricks[w.name] || {};
  // 若用户未写自己的巧记，使用后台「内容管理」设置的官方巧记作兜底
  let assoc = t.assoc || '', root = t.root || '', homo = t.homo || '', ex = t.ex || '';
  if ((!assoc || !root || !homo || !ex) && window.WORD_OVR_TRICK && window.WORD_OVR_TRICK[w.name]) {
    const o = window.WORD_OVR_TRICK[w.name];
    assoc = assoc || o.assoc || ''; root = root || o.root || ''; homo = homo || o.homo || ''; ex = ex || o.ex || '';
  }
  const merged = { assoc: assoc, root: root, homo: homo, ex: ex };
  const items = [
    ['assoc', '🧠 联想', merged.assoc],
    ['root', '🌱 词根词缀', merged.root],
    ['homo', '🔊 谐音', merged.homo],
    ['ex', '📖 例句', merged.ex],
  ];
  $('#trickBody').innerHTML = items.map(([k, label, v]) =>
    v ? `<div class="trick-item"><span class="tk">${label}</span><span class="tv">${escapeHtml(v)}</span></div>` : ''
  ).join('') || '<div class="trick-empty">暂无巧记，点「编辑」添加</div>';
}

function show() {
  if (!queue.length) {
    const fc = document.getElementById('flashcard');
    if (fc) fc.innerHTML = '<div class="empty-state">🎉 这个标记本里的词都处理完啦！<br><a class="link-btn" href="index.html">返回首页</a></div>';
    const ab = document.getElementById('actions'); if (ab) ab.innerHTML = '';
    const fb = document.getElementById('flagBar'); if (fb) fb.innerHTML = '';
    const c = document.getElementById('counter'); if (c) c.textContent = '0 / 0';
    return;
  }
  const { w, lv } = queue[idx];
  const due = getDue(w.name);
  const dueText = due && Date.now() >= due ? '待复习' : (due ? `下次 ${Math.ceil((due - Date.now()) / DAY)} 天` : '未排程');
  $('#posIndicator').textContent = (lv ? `当前 L${lv}` : '未学') + ' · ' + dueText;
  $('#modeLabel').innerHTML = modeLabelHtml() + (repeatOn ? ' · 重复记忆开' : '');
  $('#counter').textContent = `${idx + 1} / ${queue.length}`;
  const mc = modeLearned(mode);
  $('#learnStats').textContent = `${mc} 已学 · ${modeDue(mode)} 待复习`;
  renderTrick();

  if (mode === 'meaning') showMeaning(w);
  else if (mode === 'word') showWord(w);
  else if (mode === 'spelling') showSpelling(w);
  else if (mode === 'quizEn') showQuizEn(w);
  else if (mode === 'quizCn') showQuizCn(w);
  // 在评级区下方挂载标记工具条（每次重建 actions 后会丢失，故重新创建并渲染）
  let fb = document.getElementById('flagBar');
  if (!fb) {
    const ab = document.getElementById('actions');
    if (ab) { fb = document.createElement('div'); fb.id = 'flagBar'; fb.className = 'flag-bar'; ab.appendChild(fb); }
  }
  renderFlagBar(w.name);
  applyLearnGates();
}

// 后台功能开关：按 flag 显隐学习页各模块（每张卡渲染后调用）
// 另外在页面加载时会先用 localStorage 缓存应用一次，网络结果回来后由 Sync.onFlags 校正（防闪现）
function applyLearnGates() {
  if (!window.Sync || typeof Sync.flagOn !== 'function') {
    if (typeof window.__flagsBootDone === 'function') window.__flagsBootDone();
    return;
  }
  const on = k => Sync.flagOn(k);
  const hide = el => { if (el) el.style.display = 'none'; };
  const show = el => { if (el) el.style.display = ''; };
  on('content.ukus_enabled') ? show($('#accentToggle')) : hide($('#accentToggle'));
  if (!on('content.realvoice_enabled')) $$('.speak').forEach(b => { b.style.display = 'none'; });
  if (!on('content.examples_enabled')) $$('.ex').forEach(e => { e.style.display = 'none'; });
  on('content.tricks_enabled') ? show($('#trickPanel')) : hide($('#trickPanel'));
  on('learning.curve_enabled') ? show($('#curveBtn')) : hide($('#curveBtn'));
  // 开关已落到行内 style，移除 flags-boot.js 注入的临时 !important 样式（否则打开的模块显示不出来）
  if (typeof window.__flagsBootDone === 'function') window.__flagsBootDone();
}
// 模式一：看词记义
function showMeaning(w) {
  $('#flashcard').innerHTML = `
    <div class="word-head">
      <div class="w">${escapeHtml(w.name)}</div>
      <button class="speak" onclick="speakWord()" title="朗读">🔊</button>
    </div>
    <div class="ph">${escapeHtml(formatPhon(w))}</div>
    <div class="mn" id="mn" style="display:none">${(w.pos ? w.pos + ' ' : '') + escapeHtml(w.meaning || '')}${exampleHtml(w)}</div>`;
  $('#actions').innerHTML = `
    <button class="primary" id="revealBtn" onclick="revealMeaning()">显示释义</button>
    <div id="rateWrap" style="display:none;gap:10px;flex-direction:column;align-items:center">
      <div class="rate-prompt">自测：你刚才记住了吗？这决定下次复习时间</div>
      <div class="rate-row">${rateButtons()}</div>
    </div>`;
}

function revealMeaning() {
  $('#mn').style.display = 'block';
  $('#revealBtn').style.display = 'none';
  $('#rateWrap').style.display = 'flex';
}

// 模式二：看义记词
function showWord(w) {
  $('#flashcard').innerHTML = `
    <div class="ph">根据释义写出单词</div>
    <div class="mn">${(w.pos ? w.pos + ' ' : '') + escapeHtml(w.meaning || '')}</div>
    <div class="answer-input">
      <input id="typeInput" type="text" autocomplete="off" placeholder="输入英文单词…" onkeydown="if(event.key==='Enter')checkWord()">
      <button class="primary" onclick="checkWord()">核对</button>
    </div>
    <div class="check-result" id="checkResult"></div>
    <div id="revealWord" style="display:none">
      <div class="word-head"><div class="w">${escapeHtml(w.name)}</div><button class="speak" onclick="speakWord()" title="朗读">🔊</button></div>
      <div class="ph">${escapeHtml(formatPhon(w))}</div>${exampleHtml(w)}
    </div>`;
  setTimeout(() => $('#typeInput') && $('#typeInput').focus(), 30);
  $('#actions').innerHTML = `<div id="rateWrap" style="display:none;gap:8px">${rateButtons()}</div>`;
}

function checkWord() {
  const { w } = queue[idx];
  const inp = $('#typeInput');
  if (!inp) return;
  const ok = inp.value.trim().toLowerCase() === w.name.toLowerCase();
  $('#checkResult').textContent = ok ? '✅ 正确！' : `❌ 正确答案：${w.name}`;
  $('#checkResult').className = 'check-result ' + (ok ? 'ok' : 'bad');
  $('#revealWord').style.display = 'block';
  $('#rateWrap').style.display = 'flex';
}

// 模式三：听音拼写
function showSpelling(w) {
  $('#flashcard').innerHTML = `
    <div class="ph">听发音，写出拼写</div>
    <div class="answer-input">
      <button class="speak big" onclick="speakWord()" title="再听一次">🔊 播放</button>
      <input id="typeInput" type="text" autocomplete="off" placeholder="输入听到的单词…" onkeydown="if(event.key==='Enter')checkSpelling()">
      <button class="primary" onclick="checkSpelling()">核对</button>
    </div>
    <div class="check-result" id="checkResult"></div>
    <div id="revealWord" style="display:none">
      <div class="word-head"><div class="w">${escapeHtml(w.name)}</div></div>
      <div class="ph">${escapeHtml(formatPhon(w))}</div>
      <div class="mn">${(w.pos ? w.pos + ' ' : '') + escapeHtml(w.meaning || '')}</div>${exampleHtml(w)}
    </div>`;
  setTimeout(() => { speakWord(); $('#typeInput') && $('#typeInput').focus(); }, 30);
  $('#actions').innerHTML = `<div id="rateWrap" style="display:none;gap:8px">${rateButtons()}</div>`;
}

// 模式四：看英选中文
function showQuizEn(w) {
  const opts = buildOptions(w, w.meaning || '(无释义)', x => x.meaning || '(无释义)');
  const btns = opts.map((o, i) =>
    `<button class="rbtn opt" data-i="${i}" data-correct="${o.correct ? 1 : 0}" onclick="answerQuiz(this, ${o.correct})">${i + 1}. ${escapeHtml(o.text)}</button>`
  ).join('');
  $('#flashcard').innerHTML = `
    <div class="ph">选择正确的中文释义</div>
    <div class="word-head"><div class="w">${escapeHtml(w.name)}</div><button class="speak" onclick="speakWord()" title="朗读">🔊</button></div>
    <div class="ph">${escapeHtml(formatPhon(w))}</div>
    <div class="quiz-opts" id="quizOpts">${btns}</div>
    <div class="check-result" id="checkResult"></div>
    <div id="revealWord" style="display:none">
      <div class="mn">${(w.pos ? w.pos + ' ' : '') + escapeHtml(w.meaning || '')}</div>${exampleHtml(w)}
    </div>`;
  $('#actions').innerHTML = `<div id="rateWrap" style="display:none;gap:8px">${rateButtons()}</div>`;
}

// 模式五：看中选英文
function showQuizCn(w) {
  const opts = buildOptions(w, w.name, x => x.name);
  const btns = opts.map((o, i) =>
    `<button class="rbtn opt" data-i="${i}" data-correct="${o.correct ? 1 : 0}" onclick="answerQuiz(this, ${o.correct})">${i + 1}. ${escapeHtml(o.text)}</button>`
  ).join('');
  $('#flashcard').innerHTML = `
    <div class="ph">选择正确的英文单词</div>
    <div class="mn">${(w.pos ? w.pos + ' ' : '') + escapeHtml(w.meaning || '')}</div>
    <div class="quiz-opts" id="quizOpts">${btns}</div>
    <div class="check-result" id="checkResult"></div>
    <div id="revealWord" style="display:none">
      <div class="word-head"><div class="w">${escapeHtml(w.name)}</div></div>
      <div class="ph">${escapeHtml(formatPhon(w))}</div>${exampleHtml(w)}
    </div>`;
  $('#actions').innerHTML = `<div id="rateWrap" style="display:none;gap:8px">${rateButtons()}</div>`;
}

// 选择题批改（共用）
function answerQuiz(btn, correct) {
  $('#quizOpts').querySelectorAll('button').forEach(b => {
    b.disabled = true;
    b.onclick = null;
  });
  const { w } = queue[idx];
  if (correct) {
    btn.classList.add('ok');
    $('#checkResult').textContent = '✅ 正确！';
    $('#checkResult').className = 'check-result ok';
  } else {
    btn.classList.add('bad');
    $('#checkResult').textContent = `❌ 正确答案：${mode === 'quizEn' ? escapeHtml(w.meaning || '') : escapeHtml(w.name)}`;
    $('#checkResult').className = 'check-result bad';
    // 高亮正确项
    $('#quizOpts').querySelectorAll('button').forEach(b => {
      if (b.getAttribute('data-correct') === '1') b.classList.add('ok');
    });
  }
  $('#revealWord').style.display = 'block';
  $('#rateWrap').style.display = 'flex';
}

function checkSpelling() {
  const { w } = queue[idx];
  const inp = $('#typeInput');
  if (!inp) return;
  const ok = inp.value.trim().toLowerCase() === w.name.toLowerCase();
  $('#checkResult').textContent = ok ? '✅ 拼写正确！' : `❌ 正确拼写：${w.name}`;
  $('#checkResult').className = 'check-result ' + (ok ? 'ok' : 'bad');
  $('#revealWord').style.display = 'block';
  $('#rateWrap').style.display = 'flex';
}

function rate(targetLv) {
  const { w } = queue[idx];
  let newLv = (typeof targetLv === 'number') ? targetLv : 0;
  if (newLv > 4) newLv = 4;          // 评级体系仅 L1~L4，防御越界（快捷键曾误用 rate(5)）
  if (newLv < 0) newLv = 0;
  const resLv = newLv <= 0 ? 1 : newLv;   // 不会 → L1 薄弱；用于「未掌握词自动打标」判定
  const now = Date.now();
  // 遗忘曲线间隔改由 srs-core.js 的 srsInterval() 提供（见 <script src="srs-core.js">）
  if (!SR[mode]) SR[mode] = {};
  if (newLv <= 0) {
    // 不会：降级为 L1 薄弱词，明天再练（进入错词本，不再清空中进度）
    SR[mode][w.name] = { l: 1, due: now + 1 * DAY, iv: 1 };
  } else {
    const iv = srsInterval(newLv);
    SR[mode][w.name] = { l: newLv, due: now + iv * DAY, iv: iv };
  }
  saveSR();
  // 记录记忆历史（用于每词记忆曲线）：记得(r=1) / 遗忘(r=0)
  if (!tricks[w.name]) tricks[w.name] = {};
  const hh = tricks[w.name].h || [];
  hh.push({ t: now, r: recallFlag(newLv) });
  if (hh.length > 30) hh.shift();
  tricks[w.name].h = hh;
  applyAutoHard(w.name, resLv);      // 未掌握词自动标记为重难词（仅标记功能开启时生效）
  Sync.saveTricksNow(tricks);
  // 重复记忆：评 不会(L1)/模糊(L2) 且未达上限 -> 本轮稍后重练该词
  if (repeatOn && (newLv === 0 || newLv === 1) && (repeatCount[w.name] || 0) < REPEAT_LIMIT) {
    repeatCount[w.name] = (repeatCount[w.name] || 0) + 1;
    queue.push({ w, lv: newLv });
  }
  nextCard();
}

function nextCard() {
  if (idx < queue.length - 1) {
    idx++;
    show();
  } else {
    queue = buildQueue();
    idx = 0;
    toast('🎉 已完成本轮复习，队列已按掌握度重置。', 'ok');
    show();
  }
}
function prevCard() {
  if (idx > 0) { idx--; show(); }
}
function toggleRepeat() {
  repeatOn = !repeatOn;
  queue = buildQueue();
  idx = 0;
  show();
}

// 巧记编辑
function openTrick() {
  const { w } = queue[idx];
  const t = tricks[w.name] || {};
  $('#trickWordName').textContent = w.name;
  $('#trickAssoc').value = t.assoc || '';
  $('#trickRoot').value = t.root || '';
  $('#trickHomo').value = t.homo || '';
  $('#trickEx').value = t.ex || '';
  $('#trickDlg').showModal();
}
function closeTrick() { $('#trickDlg').close(); }
function saveTrick() {
  const { w } = queue[idx];
  const cur = tricks[w.name] || {};
  // 合并而非覆盖，保留 flag / h 等字段
  tricks[w.name] = Object.assign({}, cur, {
    assoc: $('#trickAssoc').value.trim(),
    root: $('#trickRoot').value.trim(),
    homo: $('#trickHomo').value.trim(),
    ex: $('#trickEx').value.trim(),
  });
  Sync.saveTricksNow(tricks);
  closeTrick();
  renderTrick();
}

function renderStreak() {
  var el = document.getElementById('streak');
  if (!el) return;
  if (!Sync.currentUser()) { el.style.display = 'none'; return; }
  var n = (typeof Sync.streak === 'function') ? Sync.streak() : 0;
  el.style.display = 'inline-flex';
  el.innerHTML = n > 0 ? ('🔥 连续 ' + n + ' 天') : '📅 今天还没学';
}

// 模式切换（已移到首页选择，学习页只读 URL 参数）
function $$(s) { return Array.from(document.querySelectorAll(s)); }

// 快捷键
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (!window.Sync || !Sync.flagOn || !Sync.flagOn('nav.keyboard_enabled')) return;
  if (e.key === 'Escape') { closeTrick(); closeCurve(); return; }
  if (!queue[idx]) return;
  // 标记快捷键（Shift + E/H/G）；标记选项关闭时不响应
  if (e.shiftKey) {
    if (!showMarks()) return;
    const k = e.key.toLowerCase();
    if (k === 'e') { e.preventDefault(); setFlag(queue[idx].w.name, 'easy'); return; }
    if (k === 'h') { e.preventDefault(); setFlag(queue[idx].w.name, 'hard'); return; }
    if (k === 'g') { e.preventDefault(); setFlag(queue[idx].w.name, 'mastered'); return; }
  }
  if (e.key === 'n' || e.key === 'N') { openTrick(); return; }
  if (e.key === 'r' || e.key === 'R') { toggleRepeat(); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); prevCard(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); nextCard(); return; }
  if (mode === 'meaning') {
    if (e.key === ' ') { e.preventDefault(); revealMeaning(); }
    else if (e.key === 'ArrowRight') { if ($('#rateWrap') && $('#rateWrap').style.display !== 'none') rate(4); }
    else if (e.key === 'ArrowLeft' || e.key === '0') { if ($('#rateWrap') && $('#rateWrap').style.display !== 'none') rate(0); }
  } else if (e.key === ' ') {
    e.preventDefault();
    if (mode === 'spelling') speakWord();
  } else if (mode === 'quizEn' || mode === 'quizCn') {
    if (['1','2','3','4'].includes(e.key)) {
      const opts = $('#quizOpts');
      if (opts) {
        const b = opts.querySelector('button[data-i="' + (parseInt(e.key) - 1) + '"]');
        if (b && !b.disabled) b.click();
      }
    }
  }
});
// 不再拦截 beforeunload：进度已通过 saveSRNow/saveTricksNow 即时落云，
// 且 pagehide/visibilitychange 会兜底 flush()，无需再弹"更改未保存"确认框。
// 启动：从云端或本地加载数据后再构建队列并渲染（只执行一次，避免双重 buildQueue/show）
let leBooted = false;
function leBoot(d) {
  if (leBooted) return;
  leBooted = true;
  // CSP 兼容：内联 onclick 改为 JS 绑定（严格 CSP 下内联事件会被拦截）
  (function () {
    var b;
    if ((b = document.getElementById('curveBtn'))) b.onclick = showCurve;
    if ((b = document.getElementById('trickEditBtn'))) b.onclick = openTrick;
    if ((b = document.getElementById('trickCancelBtn'))) b.onclick = closeTrick;
    if ((b = document.getElementById('trickSaveBtn'))) b.onclick = saveTrick;
    if ((b = document.getElementById('curveCloseBtn'))) b.onclick = closeCurve;
    var tf = document.getElementById('trickForm');
    if (tf) tf.addEventListener('submit', function (e) { e.preventDefault(); });
  })();
  // 应用后台「内容管理」对词库的覆盖（影响展示与测验）
  Sync.loadWordOverrides().then(function (ovr) {
    Sync.applyWordOverrides(ovr);
    SR = d.sr || {};
    tricks = d.tricks || {};
    queue = buildQueue();
    if (startName) {
      const i = queue.findIndex(x => x.w.name === startName);
      idx = i >= 0 ? i : 0;
    }
    renderStreak();
    Sync.onStudy(renderStreak);
    if (wrongOnly && !startName) { renderWrongList(); return; }
    show();
    // 卡片渲染后再校正一次（最新开关值已由文件末尾的 Sync.onFlags 订阅保证）
    applyLearnGates();
  });
}
// 首屏防闪现：先用 localStorage 缓存的开关立即应用（不等登录态与 loadAll），
// 网络结果回来后由 Sync.onFlags 校正。详见 flags-boot.js 的说明。
applyLearnGates();
if (typeof Sync.onFlags === 'function') Sync.onFlags(applyLearnGates);
Sync.ensureFlags();
Sync.onAuth(() => Sync.loadAll().then(leBoot).catch(e => { console.error(e); toast('学习页加载失败，请刷新重试'); }));
Sync.loadAll().then(leBoot).catch(e => { console.error(e); toast('学习页加载失败，请刷新重试'); });
