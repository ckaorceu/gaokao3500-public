// app.js — 主入口（每模式独立间隔重复 + 进度）
const SR_KEY = 'gaokao3500.sr.v1';
const TRICK_KEY = 'gaokao3500.tricks.v1';
const DAY = 86400000;

// SR 结构：SR[mode][name] = { l: 掌握等级 0-5, due: 下次复习时间戳, iv: 间隔(天) }
// 初始为空，云端/本地数据在 Sync.loadAll() 完成后填充（见文件末尾 init）
let SR = {};
let tricks = {};

function saveSR() { Sync.saveSR(SR); }
function saveTricks() { Sync.saveTricks(tricks); }

function srOf(mode, name) { return (SR[mode] && SR[mode][name]) || { l: 0, due: 0, iv: 0 }; }
// 跨模式最高等级（用于单词表展示/筛选）。带缓存：渲染前 invalidateSrCache，渲染内 O(1) 查表
let _bestCache = null, _revCache = null;
function invalidateSrCache() { _bestCache = null; _revCache = null; }
function buildSrCaches() {
  _bestCache = new Map();
  _revCache = new Map();
  const now = Date.now();
  for (const k in SR) {
    const mm = SR[k]; if (!mm) continue;
    for (const n in mm) {
      const rec = mm[n]; if (!rec) continue;
      const l = rec.l || 0;
      if (l > (_bestCache.get(n) || 0)) _bestCache.set(n, l);
      if (rec.due <= now) _revCache.set(n, (_revCache.get(n) || 0) + 1);
    }
  }
}
function bestLevel(name) {
  if (!_bestCache) buildSrCaches();
  return _bestCache.get(name) || 0;
}
function modeLearned(mode) { const mm = SR[mode] || {}; let c = 0; for (const n in mm) if (mm[n].l > 0) c++; return c; }
function modeDue(mode) { const now = Date.now(); const mm = SR[mode] || {}; let c = 0; for (const n in mm) if (mm[n].due <= now) c++; return c; }
function totalLearned() { const s = new Set(); for (const k in SR) for (const n in SR[k]) if (SR[k][n].l > 0) s.add(n); return s.size; }
function totalDue() { let c = 0; MODES.forEach(m => c += modeDue(m.id)); return c; }

// 英美音切换时重渲染词表音标
window.onAccentChange = function () { try { if (typeof renderList === 'function') renderList(); } catch (e) {} };

// 工具
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// 状态
let activeLetter = 'all';
let filterMode = 'all';
let searchText = '';
let selectedMode = 'meaning';
let selectedOrder = 'seq';
let selectedDrill = 'all';
let selectedRepeat = 'off';
let selectedRepeatMax = 3;
let listMode = 'all';     // all | hard（重难词本）
let sortMode = 'default'; // default | shuffle | rate | reviews
// 单词列表按需加载：默认不渲染，点击「列出单词」后分页展示
const LIST_PAGE_SIZE = 60;
let listShown = false;
let listPage = 0;
const MODES = [
  { id: 'meaning', name: '看词记义', desc: '看单词记释义', icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiID8+PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iNjQiIGhlaWdodD0iNjQiPjxwYXRoIGZpbGw9IiM0RjQ2RTUiIHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIDEgNS4zMzMzMyAxMy4zMzMzKSIgZD0iTTQxLjUxMjMgMy41OTM0UTM1LjAyMTkgLTAuOSAyNi42NjY3IC0wLjlRMTguMzExNCAtMC45IDExLjgyMSAzLjU5MzRRNS4yNzU1IDguMTI0OSAtMC43NzE3IDE4LjIwMzZRLTAuOTAyNCAxOC40MTY3IC0wLjkgMTguNjY2N1EtMC45MDI0IDE4LjkxNjYgLTAuNzcxNyAxOS4xMjk3UTUuMjc1NSAyOS4yMDg1IDExLjgyMSAzMy43NFExOC4zMTE1IDM4LjIzMzMgMjYuNjY2NyAzOC4yMzMzUTM1LjAyMTkgMzguMjMzMyA0MS41MTIzIDMzLjc0UTQ4LjA1NzggMjkuMjA4NCA1NC4xMDUxIDE5LjEyOTdRNTQuMjM1NyAxOC45MTY2IDU0LjIzMzMgMTguNjY2N1E1NC4yMzU3IDE4LjQxNjcgNTQuMTA1MSAxOC4yMDM2UTQ4LjA1NzkgOC4xMjQ5IDQxLjUxMjMgMy41OTM0Wk0xMi44NDU2IDUuMDczM1ExOC44NzM3IDAuOSAyNi42NjY3IDAuOVEzNC40NTk2IDAuOSA0MC40ODc3IDUuMDczM1E0Ni41NjUxIDkuMjgwOCA1Mi4yODE3IDE4LjY2NjdRNDYuNTY1MiAyOC4wNTI1IDQwLjQ4NzcgMzIuMjZRMzQuNDU5NiAzNi40MzMzIDI2LjY2NjcgMzYuNDMzM1ExOC44NzM3IDM2LjQzMzMgMTIuODQ1NiAzMi4yNlE2Ljc2ODIgMjguMDUyNiAxLjA1MTcgMTguNjY2N1E2Ljc2ODEgOS4yODA4IDEyLjg0NTYgNS4wNzMzWiIgZmlsbC1ydWxlPSJldmVub2RkIi8+PGNpcmNsZSBmaWxsPSJub25lIiBzdHJva2U9IiM0RjQ2RTUiIHN0cm9rZS13aWR0aD0iMS44IiB0cmFuc2Zvcm09Im1hdHJpeCgxIDAgMCAxIDIzLjQ2NjcgMjMuNDY2NykiIGN4PSI4LjUzMzMiIGN5PSI4LjUzMzMiIHI9IjguNTMzMyIvPjwvc3ZnPg==' },
  { id: 'word', name: '看义记词', desc: '看释义写单词', icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiID8+PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iNjQiIGhlaWdodD0iNjQiPjxwYXRoIGZpbGw9IiM0RjQ2RTUiIHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIDEgMTAuNjY2NyAxMikiIGQ9Ik0wLjUyNDggMzAuMjcxMlEwLjQ1ODYgMzAuNDA2IDAuNDQwMyAzMC41NTVMLTAuODkzIDQxLjIyMTdRLTAuOTUwNiA0MS41OTQ3IC0wLjcxMDQgNDEuODg1OVEtMC40ODc0IDQyLjE5MDQgLTAuMTExNiA0Mi4yMjY0US0wLjA1NiA0Mi4yMzMzIDAgNDIuMjMzM1EwLjA1NiA0Mi4yMzMzIDAuMTExNiA0Mi4yMjY0TDEwLjc3ODMgNDAuODkzUTEwLjkyNzMgNDAuODc0OCAxMS4wNjIxIDQwLjgwODVRMTEuMTk3MSA0MC43NDI4IDExLjMwMzEgNDAuNjM2NEw0MS45Njk3IDkuOTY5N1E0Mi4yNDQyIDkuNzEwNiA0Mi4yMzMzIDkuMzMzM1E0Mi4yNDQyIDguOTU2IDQxLjk2OTcgOC42OTY5TDMyLjYzNjQgLTAuNjM2NFEzMi4zNzczIC0wLjkxMDkgMzIgLTAuOVEzMS42MjI3IC0wLjkxMDkgMzEuMzYzNiAtMC42MzY0TDAuNjk2OSAzMC4wMzAzUTAuNTkwNSAzMC4xMzYyIDAuNTI0OCAzMC4yNzEyWk0yLjE4ODEgMzEuMDg0N0wxLjAzNjYgNDAuMjk2OEwxMC4yNDg2IDM5LjE0NTJMNDAuMDYwNSA5LjMzMzNMMzIgMS4yNzI4TDIuMTg4MSAzMS4wODQ3WiIgZmlsbC1ydWxlPSJldmVub2RkIi8+PHBhdGggZmlsbD0iIzRGNDZFNSIgdHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgMSAzOC42NjY3IDE4LjY2NjcpIiBkPSJNOC42MzY0IDcuMzYzNkwwLjYzNjQgLTAuNjM2NFEwLjM3NzMgLTAuOTEwOSAwIC0wLjlRLTAuMzc3MyAtMC45MTA5IC0wLjYzNjQgLTAuNjM2NFEtMC45MTA5IC0wLjM3NzMgLTAuOSAwUS0wLjkxMDkgMC4zNzczIC0wLjYzNjQgMC42MzY0TDcuMzYzNiA4LjYzNjRRNy42MjI3IDguOTEwOSA4IDguOVE4LjM3NzMgOC45MTA5IDguNjM2NCA4LjYzNjRROC45MTA5IDguMzc3MyA4LjkgOFE4LjkxMDkgNy42MjI3IDguNjM2NCA3LjM2MzZaIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=' },
  { id: 'spelling', name: '听音拼写', desc: '听发音拼写', icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiID8+PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iNjQiIGhlaWdodD0iNjQiPjxwYXRoIGZpbGw9IiM0RjQ2RTUiIHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIDEgMTAuNjY2NyAxMC42NjY3KSIgZD0iTS0wLjkgMTguNjY2N0wtMC45IDI0US0wLjkxMDkgMjQuMzc3MyAtMC42MzY0IDI0LjYzNjRRLTAuMzc3MyAyNC45MTA5IDAgMjQuOVEwLjM3NzMgMjQuOTEwOSAwLjYzNjQgMjQuNjM2NFEwLjkxMDkgMjQuMzc3MyAwLjkgMjRMMC45IDE4LjY2NjdRMC45IDE0LjkzNzEgMi40NTk3IDExLjYzNDNRMy45Njk4IDguNDM2MyA2Ljc1NzIgNi4wMTI1UTkuNTQ5NCAzLjU4NDUgMTMuMjQwNiAyLjI2NDFRMTcuMDUzOSAwLjkgMjEuMzMzMyAwLjlRMjUuNjEyOCAwLjkgMjkuNDI2IDIuMjY0MVEzMy4xMTczIDMuNTg0NSAzNS45MDk0IDYuMDEyNVEzOC42OTY4IDguNDM2MyA0MC4yMDcgMTEuNjM0M1E0MS43NjY3IDE0LjkzNzEgNDEuNzY2NyAxOC42NjY3TDQxLjc2NjcgMjRRNDEuNzU1OCAyNC4zNzczIDQyLjAzMDMgMjQuNjM2NFE0Mi4yODk0IDI0LjkxMDkgNDIuNjY2NyAyNC45UTQzLjA0NCAyNC45MTA5IDQzLjMwMzEgMjQuNjM2NFE0My41Nzc1IDI0LjM3NzMgNDMuNTY2NyAyNEw0My41NjY3IDE4LjY2NjdRNDMuNTY2NyAxNC41MzM1IDQxLjgzNDcgMTAuODY1N1E0MC4xNjMxIDcuMzI2IDM3LjA5MDUgNC42NTQyUTM0LjA0MjcgMi4wMDM5IDMwLjAzMjMgMC41NjkyUTI1LjkyNTEgLTAuOSAyMS4zMzMzIC0wLjlRMTYuNzQxNiAtMC45IDEyLjYzNDQgMC41NjkyUTguNjI0IDIuMDAzOSA1LjU3NjEgNC42NTQyUTIuNTAzNSA3LjMyNiAwLjgzMiAxMC44NjU3US0wLjkgMTQuNTMzNSAtMC45IDE4LjY2NjdaIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48cmVjdCBmaWxsPSJub25lIiBzdHJva2U9IiM0RjQ2RTUiIHN0cm9rZS13aWR0aD0iMS44IiB0cmFuc2Zvcm09Im1hdHJpeCgxIDAgMCAxIDggMzMuMzMzMykiIHdpZHRoPSIxMC42NjY3IiBoZWlnaHQ9IjE4LjY2NjciIHJ4PSIyIiByeT0iMiIvPjxyZWN0IGZpbGw9Im5vbmUiIHN0cm9rZT0iIzRGNDZFNSIgc3Ryb2tlLXdpZHRoPSIxLjgiIHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIDEgNDUuMzMzMyAzMy4zMzMzKSIgd2lkdGg9IjEwLjY2NjciIGhlaWdodD0iMTguNjY2NyIgcng9IjIiIHJ5PSIyIi8+PC9zdmc+' },
  { id: 'quizEn', name: '看英选中', desc: '选正确中文', icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiID8+PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iNjQiIGhlaWdodD0iNjQiPjxyZWN0IGZpbGw9Im5vbmUiIHN0cm9rZT0iIzRGNDZFNSIgc3Ryb2tlLXdpZHRoPSIxLjgiIHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIDEgOCAxMC42NjY3KSIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjEzLjMzMzMiIHJ4PSIyLjUiIHJ5PSIyLjUiLz48cmVjdCBmaWxsPSJub25lIiBzdHJva2U9IiM0RjQ2RTUiIHN0cm9rZS13aWR0aD0iMS44IiB0cmFuc2Zvcm09Im1hdHJpeCgxIDAgMCAxIDggMzcuMzMzMykiIHdpZHRoPSI0OCIgaGVpZ2h0PSIxMy4zMzMzIiByeD0iMi41IiByeT0iMi41Ii8+PHBhdGggZmlsbD0iIzRGNDZFNSIgdHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgMSAxNy4zMzMzIDE0LjY2NjcpIiBkPSJNMi42NjY3IDQuMDYwNUwwLjYzNjQgMi4wMzAzUTAuMzc3MyAxLjc1NTggMCAxLjc2NjdRLTAuMzc3MyAxLjc1NTggLTAuNjM2NCAyLjAzMDNRLTAuOTEwOSAyLjI4OTQgLTAuOSAyLjY2NjdRLTAuOTEwOSAzLjA0NCAtMC42MzY0IDMuMzAzMUwyLjAzMDMgNS45Njk3UTIuMjg5NCA2LjI0NDIgMi42NjY3IDYuMjMzM1EzLjA0NCA2LjI0NDIgMy4zMDMxIDUuOTY5N0w4LjYzNjQgMC42MzY0UTguOTEwOSAwLjM3NzMgOC45IDBROC45MTA5IC0wLjM3NzMgOC42MzY0IC0wLjYzNjRROC4zNzczIC0wLjkxMDkgOCAtMC45UTcuNjIyNyAtMC45MTA5IDcuMzYzNiAtMC42MzY0TDIuNjY2NyA0LjA2MDVaIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48ZWxsaXBzZSBmaWxsPSIjRjU5RTBCIiB0cmFuc2Zvcm09Im1hdHJpeCgxIDAgMCAxIDI3LjczMzMgMzkuNzMzMykiIGN4PSI0LjI2NjciIGN5PSI0LjI2NjciIHJ4PSI0LjI2NjciIHJ5PSI0LjI2NjciLz48L3N2Zz4=' },
  { id: 'quizCn', name: '看中选英', desc: '选正确英文', icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiID8+PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iNjQiIGhlaWdodD0iNjQiPjxwYXRoIGZpbGw9IiM0RjQ2RTUiIHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIDEgMTAuNjY2NyAyNCkiIGQ9Ik0yOS4zMzMzIC0wLjlMMCAtMC45US0wLjM3NzMgLTAuOTEwOSAtMC42MzY0IC0wLjYzNjRRLTAuOTEwOSAtMC4zNzczIC0wLjkgMFEtMC45MTA5IDAuMzc3MyAtMC42MzY0IDAuNjM2NFEtMC4zNzczIDAuOTEwOSAwIDAuOUwyOS4zMzMzIDAuOVEyOS43MTA2IDAuOTEwOSAyOS45Njk3IDAuNjM2NFEzMC4yNDQyIDAuMzc3MyAzMC4yMzMzIDBRMzAuMjQ0MiAtMC4zNzczIDI5Ljk2OTcgLTAuNjM2NFEyOS43MTA2IC0wLjkxMDkgMjkuMzMzMyAtMC45WiIgZmlsbC1ydWxlPSJldmVub2RkIi8+PHBhdGggZmlsbD0iIzRGNDZFNSIgdHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgMSAzMiAxNikiIGQ9Ik04LjYzNjQgNy4zNjM2TDAuNjM2NCAtMC42MzY0UTAuMzc3MyAtMC45MTA5IDAgLTAuOVEtMC4zNzczIC0wLjkxMDkgLTAuNjM2NCAtMC42MzY0US0wLjkxMDkgLTAuMzc3MyAtMC45IDBRLTAuOTEwOSAwLjM3NzMgLTAuNjM2NCAwLjYzNjRMNi43MjcyIDhMLTAuNjM2NCAxNS4zNjM2US0wLjkxMDkgMTUuNjIyNyAtMC45IDE2US0wLjkxMDkgMTYuMzc3MyAtMC42MzY0IDE2LjYzNjRRLTAuMzc3MyAxNi45MTA5IDAgMTYuOVEwLjM3NzMgMTYuOTEwOSAwLjYzNjQgMTYuNjM2NEw4LjYzNjQgOC42MzY0UTguOTEwOSA4LjM3NzMgOC45IDhROC45MTA5IDcuNjIyNyA4LjYzNjQgNy4zNjM2WiIgZmlsbC1ydWxlPSJldmVub2RkIi8+PHBhdGggZmlsbD0iIzRGNDZFNSIgdHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgMSAyNCA0MCkiIGQ9Ik0wIDAuOUwyOS4zMzMzIDAuOVEyOS43MTA2IDAuOTEwOSAyOS45Njk3IDAuNjM2NFEzMC4yNDQyIDAuMzc3MyAzMC4yMzMzIDBRMzAuMjQ0MiAtMC4zNzczIDI5Ljk2OTcgLTAuNjM2NFEyOS43MTA2IC0wLjkxMDkgMjkuMzMzMyAtMC45TDAgLTAuOVEtMC4zNzczIC0wLjkxMDkgLTAuNjM2NCAtMC42MzY0US0wLjkxMDkgLTAuMzc3MyAtMC45IDBRLTAuOTEwOSAwLjM3NzMgLTAuNjM2NCAwLjYzNjRRLTAuMzc3MyAwLjkxMDkgMCAwLjlaIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48cGF0aCBmaWxsPSIjNEY0NkU1IiB0cmFuc2Zvcm09Im1hdHJpeCgxIDAgMCAxIDI0IDMyKSIgZD0iTTEuMjcyOCA4TDguNjM2NCAwLjYzNjRROC45MTA5IDAuMzc3MyA4LjkgMFE4LjkxMDkgLTAuMzc3MyA4LjYzNjQgLTAuNjM2NFE4LjM3NzMgLTAuOTEwOSA4IC0wLjlRNy42MjI3IC0wLjkxMDkgNy4zNjM2IC0wLjYzNjRMLTAuNjM2NCA3LjM2MzZRLTAuOTEwOSA3LjYyMjcgLTAuOSA4US0wLjkxMDkgOC4zNzczIC0wLjYzNjQgOC42MzY0TDcuMzYzNiAxNi42MzY0UTcuNjIyNyAxNi45MTA5IDggMTYuOVE4LjM3NzMgMTYuOTEwOSA4LjYzNjQgMTYuNjM2NFE4LjkxMDkgMTYuMzc3MyA4LjkgMTZROC45MTA5IDE1LjYyMjcgOC42MzY0IDE1LjM2MzZMMS4yNzI4IDhaIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=' },
];

function renderModePicker() {
  const box = $('#modePicker');
  const total = WORDS.length;
  box.innerHTML = MODES.map(m => {
    const lc = modeLearned(m.id), dc = modeDue(m.id);
    const pct = ((lc / total) * 100).toFixed(lc > 0 && lc < total*0.01 ? 1 : 0);
    return `<div class="mode-chip${m.id === selectedMode ? ' active' : ''}" data-mode="${m.id}">
       <img class="mc-icon" src="${m.icon}" alt="">
       <div class="mc-name">${m.name}</div>
       <div class="mc-desc">${m.desc}</div>
       <div class="mc-meta">已学 ${lc}/${total} · 待复习 ${dc}</div>
     </div>`;
  }).join('');
  box.addEventListener('click', e => {
    const chip = e.target.closest('.mode-chip');
    if (!chip) return;
    selectedMode = chip.dataset.mode;
    $$('#modePicker .mode-chip').forEach(c => c.classList.toggle('active', c.dataset.mode === selectedMode));
  });
  // 顺序 / 乱序
  const oc = $('#orderChips');
  oc.addEventListener('click', e => {
    const chip = e.target.closest('.order-chip');
    if (!chip) return;
    selectedOrder = chip.dataset.order;
    $$('#orderChips .order-chip').forEach(c => c.classList.toggle('active', c.dataset.order === selectedOrder));
  });
  // 范围：全部 / 只练未掌握
  const dc2 = $('#drillChips');
  dc2.addEventListener('click', e => {
    const chip = e.target.closest('.drill-chip');
    if (!chip) return;
    selectedDrill = chip.dataset.drill;
    $$('#drillChips .drill-chip').forEach(c => c.classList.toggle('active', c.dataset.drill === selectedDrill));
  });
  // 重复记忆开关：关 / 开
  const rc = $('#repeatChips');
  rc.addEventListener('click', e => {
    const chip = e.target.closest('.drill-chip');
    if (!chip) return;
    selectedRepeat = chip.dataset.repeat;
    $$('#repeatChips .drill-chip').forEach(c => c.classList.toggle('active', c.dataset.repeat === selectedRepeat));
    $('#repeatMaxRow').style.display = selectedRepeat === 'on' ? 'flex' : 'none';
  });
  // 重复次数上限
  const rmc = $('#repeatMaxChips');
  rmc.addEventListener('click', e => {
    const chip = e.target.closest('.drill-chip');
    if (!chip) return;
    selectedRepeatMax = parseInt(chip.dataset.max, 10);
    $$('#repeatMaxChips .drill-chip').forEach(c => c.classList.toggle('active', c.dataset.max === chip.dataset.max));
  });
  $('#startBtn').addEventListener('click', () => {
    const names = currentFilteredNames();
    const first = names[0];
    let base = `learn.html?mode=${selectedMode}`;
    if (selectedOrder === 'shuffle') base += '&order=shuffle';
    if (selectedDrill !== 'all') base += '&drill=' + encodeURIComponent(selectedDrill);
    if (selectedRepeat === 'on') {
      base += '&repeat=on';
      if (selectedRepeatMax > 0) base += '&rmax=' + selectedRepeatMax;
    }
    // 默认（全词表、无筛选、顺序）"开始练习"不指定 w：让学习页从 SRS 队列首个未掌握/到点词续练，
    // 避免每次都从字典序首个 a 词开始。仅在主动缩窄范围或选乱序时从范围顶部开始。
    const narrowed = listMode === 'hard' || activeLetter !== 'all' || selectedDrill !== 'all' || filterMode !== 'all' || selectedOrder === 'shuffle';
    const url = (!narrowed && first) ? base : (first ? `${base}&w=${encodeURIComponent(first)}` : base);
    location.href = url;
  });
  // 待复习合计提示
  $('#dueTotal').textContent = totalDue();
}

function filteredItems() {
  let items;
  if (listMode === 'hard') {
    items = WORDS.filter(w => { const t = tricks[w.name]; return t && t.flag === 'hard'; });
  } else {
    items = WORDS;
    if (activeLetter !== 'all') {
      items = items.filter(w => (w.name[0] || '').toLowerCase() === activeLetter);
    }
    if (filterMode !== 'all') {
      if (filterMode === 'new') items = items.filter(w => bestLevel(w.name) === 0);
      else if (filterMode.startsWith('l')) {
        const lv = parseInt(filterMode.slice(1));
        items = items.filter(w => Math.min(bestLevel(w.name), 4) === lv);
      }
    }
  }
  const kw = searchText.trim().toLowerCase();
  if (kw) items = items.filter(w => w.name.toLowerCase().includes(kw) || (w.meaning || '').toLowerCase().includes(kw));
  items = sortItems(items);
  return items;
}

// 复习次数（跨模式已学次数 + 记忆历史条数）。复用 _revCache（与 bestLevel 同一次重建）
function reviewCount(name) {
  if (!_revCache) buildSrCaches();
  const t = tricks[name];
  if (t && t.h) return (_revCache.get(name) || 0) + t.h.length;
  return _revCache.get(name) || 0;
}
function aShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sortItems(items) {
  if (sortMode === 'shuffle') return aShuffle(items);
  if (sortMode === 'rate') return items.slice().sort((a, b) => bestLevel(a.name) - bestLevel(b.name)); // 记忆率低→高
  if (sortMode === 'reviews') return items.slice().sort((a, b) => reviewCount(b.name) - reviewCount(a.name)); // 复习多→少
  return items;
}
// 重难词本：作为「用户可开关」的筛选项。开启后单词表（及开始练习）只显示重难词，状态持久化。
function setListMode(m, reveal) {
  listMode = m;
  try { localStorage.setItem('gaokao3500.hardFilter', m === 'hard' ? '1' : '0'); } catch (e) {}
  const cb = document.getElementById('hardToggle');
  if (cb) cb.checked = (m === 'hard');
  if (reveal) listShown = true;
  listPage = 0;
  renderList();
}
function clearListMode() {
  listMode = 'all';
  try { localStorage.setItem('gaokao3500.hardFilter', '0'); } catch (e) {}
  const cb = document.getElementById('hardToggle');
  if (cb) cb.checked = false;
  listPage = 0;
  renderList();
}
function toggleHard() {
  setListMode(listMode === 'hard' ? 'all' : 'hard', true);
}
// 标记选项总开关：关闭后，首页隐藏相关词本入口、学习页隐藏标记按钮
const SHOW_MARKS_KEY = 'gaokao3500.showMarks';
// 全局「标记体系」功能开关（后台 feature_flags 管理）；未配置时默认开
function marksFeatureOn() {
  try {
    if (window.Sync && typeof Sync.flagOn === 'function' && Sync.flagOn('learning.marks_enabled') === false) return false;
  } catch (e) {}
  return true;
}
function showMarks() {
  if (!marksFeatureOn()) return false;
  try { return localStorage.getItem(SHOW_MARKS_KEY) === '1'; } catch (e) { return false; }
}
function applyMarksVisibility() {
  const globalOn = marksFeatureOn();
  const row = document.querySelector('.marks-toggle-row');
  if (row) row.style.display = globalOn ? '' : 'none';
  const ids = ['hardToggleCard', 'easyCard', 'masteredCard', 'weakToggleCard'];
  if (!globalOn) {
    ids.forEach(function (id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    return;
  }
  const show = showMarks();
  ids.forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });
}
// 后台功能开关：按 flag 显隐各模块
// 会被调用两次：① 页面加载时用 localStorage 缓存立即应用（防闪现）② 网络结果回来后由 Sync.onFlags 校正
function applyFeatureGates() {
  if (!window.Sync || typeof Sync.flagOn !== 'function') {
    if (typeof window.__flagsBootDone === 'function') window.__flagsBootDone();
    return;
  }
  const on = k => Sync.flagOn(k);
  const hide = el => { if (el) el.style.display = 'none'; };
  const show = el => { if (el) el.style.display = ''; };
  on('content.ukus_enabled') ? show($('#accentToggle')) : hide($('#accentToggle'));   // 英美音切换
  on('learning.quotes_enabled') ? show($('#quote')) : hide($('#quote'));               // 每日名言
  on('nav.bookunits_enabled') ? show($('#unitBlock')) : hide($('#unitBlock'));         // 词书进度单元
  on('nav.sort_enabled') ? show($('#sortRow')) : hide($('#sortRow'));                  // 列表排序
  on('nav.sort_enabled') ? show($('#orderChips')) : hide($('#orderChips'));            // 练习顺序
  on('learning.calendar_enabled') ? show($('#calendarCard')) : hide($('#calendarCard')); // 复习日历入口
  applyMarksVisibility();
  // 开关已落到各元素的行内 style 上，移除 flags-boot.js 注入的临时 !important 样式，
  // 否则后续被「打开」的模块会因 !important 而无法显示
  if (typeof window.__flagsBootDone === 'function') window.__flagsBootDone();
}
// 重难词本：跨模式标记为重难词的词数
function hardCount() {
  var c = 0;
  WORDS.forEach(function (w) { var t = tricks[w.name]; if (t && t.flag === 'hard') c++; });
  return c;
}
// 太简单 / 已掌握 词本计数（供首页入口显示）
function easyCount() {
  var c = 0;
  WORDS.forEach(function (w) { var t = tricks[w.name]; if (t && t.flag === 'easy') c++; });
  return c;
}
function masteredCount() {
  var c = 0;
  WORDS.forEach(function (w) { var t = tricks[w.name]; if (t && t.flag === 'mastered') c++; });
  return c;
}

function currentFilteredNames() {
  return filteredItems().map(w => w.name);
}

function renderStats() {
  invalidateSrCache();
  const total = WORDS.length;
  const learned = totalLearned();
  $('#pct-total').textContent = ((learned / total) * 100).toFixed(1) + '%';
  $('#bar-total').style.width = (learned / total) * 100 + '%';
  $('#stats').textContent = `${learned} / ${total} 已掌握`;

  const counts = [0, 0, 0, 0, 0];
  WORDS.forEach(w => { counts[Math.min(bestLevel(w.name), 4)]++; });
  $('#levels').innerHTML =
    `<div class="level-group">
      <div class="level-sub">学习状态</div>
      <div class="level-row">
        <div class="level-chip"><div class="name">未学</div><div class="count">${counts[0]}</div></div>
      </div>
    </div>
    <div class="level-group">
      <div class="level-sub">复习等级（跨模式最高）</div>
      <div class="level-row">
        ${[1,2,3,4].map(i => `<div class="level-chip" style="cursor:pointer" onclick="filterByL(${i})"><div class="name">L${i}</div><div class="count">${counts[i]}</div></div>`).join('')}
      </div>
    </div>`;
}

function filterByL(lv) {
  $('#filter').value = 'l' + lv;
  filterMode = 'l' + lv;
  listPage = 0;
  renderList();
}

function renderLetters() {
  const letters = Array.from(new Set(WORDS.map(w => (w.name[0] || '').toLowerCase()))).sort();
  const nav = $('#letterNav');
  nav.innerHTML = `<button data-l="all" class="active">全部</button>` +
    letters.map(l => `<button data-l="${l}">${l.toUpperCase()}</button>`).join('');
  nav.addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    $$('#letterNav button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeLetter = e.target.dataset.l;
    clearListMode();
  });
}

function renderList() {
  invalidateSrCache();
  const list = $('#wordList');
  const items = filteredItems();

  if (!items.length) {
    list.innerHTML = '<div class="empty">没有匹配的单词</div>';
    return;
  }

  // 未点击「列出单词」前，不渲染任何卡片，只显示触发按钮与数量
  if (!listShown) {
    const note = (WORDS.length !== items.length) ? '（已按当前筛选 / 搜索）' : '';
    list.innerHTML =
      '<div class="list-cue">' +
        '<p>共 <b>' + items.length + '</b> 个单词' + note + '</p>' +
        '<button class="start-btn" id="showListBtn">📋 列出单词</button>' +
      '</div>';
    const btn = document.getElementById('showListBtn');
    if (btn) btn.onclick = function () { listShown = true; listPage = 0; renderList(); };
    return;
  }

  const limit = (listPage + 1) * LIST_PAGE_SIZE;
  const shown = items.slice(0, limit);
  let html = shown.map(w => {
    const lv = bestLevel(w.name);
    const phonetic = formatPhon(w);
    const meaning = (w.pos ? w.pos + ' ' : '') + (w.meaning || '');
    return `<a class="word-card" data-level="${lv}" data-name="${w.name}" href="learn.html?mode=${encodeURIComponent(selectedMode)}&w=${encodeURIComponent(w.name)}">
      <span class="level-dot" title="${lv ? 'L' + lv : '未学'}"></span>
      <div class="name">${w.name}<button class="speak-mini" type="button" data-word="${escapeHtml(w.name)}" onclick="event.preventDefault();event.stopPropagation();speakText(this.getAttribute('data-word'), getAccent())" title="朗读">🔊</button></div>
      <div class="phonetic">${escapeHtml(phonetic)}</div>
      <div class="meaning">${escapeHtml(meaning)}</div>
      ${w.ex ? '<div class="ex">📖 ' + escapeHtml(w.ex) + '</div>' : ''}
    </a>`;
  }).join('');

  if (limit < items.length) {
    const remaining = items.length - limit;
    html += '<button class="load-more" id="loadMoreBtn">加载更多（还有 ' + remaining + ' 个）</button>';
  }
  list.innerHTML = html;
  const more = document.getElementById('loadMoreBtn');
  if (more) more.onclick = function () { listPage++; renderList(); };
}


// 错词本：跨模式掌握度落在 L1~L2（学过但没记牢）的词数
function wrongCount() {
  var c = 0;
  WORDS.forEach(function (w) { var b = bestLevel(w.name); if (b >= 1 && b <= 2) c++; });
  return c;
}

// 词书进度单元折叠：默认折叠，状态持久化
function toggleUnit() {
  const el = document.getElementById('unitCollapsible');
  if (!el) return;
  const collapsed = el.classList.toggle('collapsed');
  const caret = document.getElementById('unitCaret');
  if (caret) caret.classList.toggle('collapsed', collapsed);
  const head = document.getElementById('unitHead');
  if (head) head.setAttribute('aria-expanded', String(!collapsed));
  try { localStorage.setItem('gaokao3500.unitsCollapsed', collapsed ? '1' : '0'); } catch (e) {}
}

// 词书进度（按单元）：蓝条=历史记忆率，绿条=本轮(熟记)记忆率
function renderUnitProgress() {
  invalidateSrCache();
  var el = document.getElementById('unitProgress');
  if (!el) return;
  var SIZE = 50, units = [], total = WORDS.length;
  for (var i = 0; i < total; i += SIZE) {
    var chunk = WORDS.slice(i, i + SIZE), learned = 0, mastered = 0;
    chunk.forEach(function (w) { var b = bestLevel(w.name); if (b > 0) learned++; if (b >= 4) mastered++; });
    units.push({ i: i, n: chunk.length, learned: learned, mastered: mastered,
      hist: chunk.length ? learned / chunk.length * 100 : 0,
      cur: chunk.length ? mastered / chunk.length * 100 : 0 });
  }
  el.innerHTML = units.map(function (u) {
    var idx = Math.floor(u.i / SIZE) + 1;
    var end = Math.min(u.i + SIZE, total) - 1;
    return '<div class="unit-row" onclick="startUnit(' + u.i + ',' + end + ')">' +
      '<div class="unit-name">第 ' + idx + ' 单元</div>' +
      '<div class="unit-bars">' +
        '<div class="ubar blue" style="width:' + u.hist.toFixed(0) + '%"></div>' +
        '<div class="ubar green" style="width:' + u.cur.toFixed(0) + '%"></div>' +
      '</div>' +
      '<div class="unit-meta">' + u.learned + '/' + u.n + ' · 熟 ' + u.mastered + '</div>' +
    '</div>';
  }).join('');
}
function startUnit(from, to) {
  var base = 'learn.html?mode=' + selectedMode + '&from=' + from + '&to=' + (to + 1);
  if (selectedOrder === 'shuffle') base += '&order=shuffle';
  if (selectedRepeat === 'on') { base += '&repeat=on'; if (selectedRepeatMax > 0) base += '&rmax=' + selectedRepeatMax; }
  location.href = base;
}
function renderQuote() {
  var el = document.getElementById('quote');
  if (!el) return;
  if (window.QUOTES && window.QUOTES.length) {
    el.textContent = '“' + window.QUOTES[Math.floor(Math.random() * window.QUOTES.length)] + '”';
  }
}
// 顶栏连续打卡徽章（登录后显示）
function renderStreak() {
  var el = document.getElementById('streak');
  if (!el) return;
  if (!Sync.currentUser()) { el.style.display = 'none'; return; }
  var n = (typeof Sync.streak === 'function') ? Sync.streak() : 0;
  el.style.display = 'inline-flex';
  el.innerHTML = n > 0 ? ('🔥 连续 ' + n + ' 天') : '📅 今天还没学';
}

// events
let searchTimer = null;
$('#search').addEventListener('input', e => {
  searchText = e.target.value;
  listPage = 0;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderList, 120);
});
$('#filter').addEventListener('change', e => { filterMode = e.target.value; clearListMode(); });
$('#sortChips').addEventListener('click', e => {
  const chip = e.target.closest('.order-chip');
  if (!chip) return;
  sortMode = chip.dataset.sort;
  $$('#sortChips .order-chip').forEach(c => c.classList.toggle('active', c.dataset.sort === sortMode));
  renderList();
});
$('#reset').addEventListener('click', () => {
  if (confirm('确定清空所有学习进度和巧记？')) {
    Sync.resetAll().then(() => location.reload()).catch(() => location.reload());
  }
});

// init：从云端或本地加载数据后再渲染（只渲染一次，避免双重绑定事件 / 重复遍历全量单词）
let booted = false;
function boot(d) {
  if (booted) return;
  booted = true;
  // CSP 兼容：unitHead 内联 onclick 改为 JS 绑定（严格 CSP 下内联事件会被拦截）
  (function () {
    var uh = document.getElementById('unitHead');
    if (uh) {
      uh.onclick = toggleUnit;
      uh.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleUnit(); }
      });
    }
  })();
  // 应用后台「内容管理」对词库的覆盖（影响展示与测验）
  Sync.loadWordOverrides().then(function (ovr) {
    Sync.applyWordOverrides(ovr);
    SR = d.sr || {};
    tricks = d.tricks || {};
    // 重难词本开关：恢复持久化状态
    try { if (localStorage.getItem('gaokao3500.hardFilter') === '1') listMode = 'hard'; } catch (e) {}
    var ht = document.getElementById('hardToggle');
    if (ht) {
      if (listMode === 'hard') ht.checked = true;
      ht.addEventListener('change', function () { setListMode(this.checked ? 'hard' : 'all', true); });
    }
    // 标记选项总开关：恢复持久化状态 + 监听 + 应用首页入口显隐
    var mt = document.getElementById('marksToggle');
    if (mt) {
      mt.checked = showMarks();
      mt.addEventListener('change', function () {
        try { localStorage.setItem(SHOW_MARKS_KEY, this.checked ? '1' : '0'); } catch (e) {}
        applyMarksVisibility();
      });
      applyMarksVisibility();
    }
    // 词书进度默认折叠（可记忆展开状态）
    try {
      var uc = localStorage.getItem('gaokao3500.unitsCollapsed');
      var coll = (uc !== '0');
      var uEl = document.getElementById('unitCollapsible');
      var uCaret = document.getElementById('unitCaret');
      if (coll) { if (uEl) uEl.classList.add('collapsed'); if (uCaret) uCaret.classList.add('collapsed'); }
      else { if (uEl) uEl.classList.remove('collapsed'); if (uCaret) uCaret.classList.remove('collapsed'); }
      var uHead = document.getElementById('unitHead');
      if (uHead) uHead.setAttribute('aria-expanded', String(!coll));
    } catch (e) {}
    renderStats(); renderLetters(); renderList(); renderModePicker();
    renderStreak();
    renderUnitProgress(); renderQuote();
    // 列表/统计重渲染后再按开关校正一次（最新值已由文件末尾的 Sync.onFlags 订阅保证）
    applyFeatureGates();
    var wc = document.getElementById('wrongCount');
    if (wc) wc.textContent = wrongCount();
    var hc = document.getElementById('hardCount');
    if (hc) hc.textContent = hardCount();
    var ec = document.getElementById('easyCount');
    if (ec) ec.textContent = easyCount();
    var mc = document.getElementById('masteredCount');
    if (mc) mc.textContent = masteredCount();
    Sync.onStudy(renderStreak);
  });
}
// 首屏防闪现三步走（避免后台已关闭的模块先显示一下再消失）：
//   ① flags-boot.js 在 <head> 同步执行，用缓存注入 CSS 抢在首次绘制前隐藏
//   ② 这里立即用缓存中的开关值应用一次（不等登录态、不等 loadAll），并移除 ① 的临时样式
//   ③ 网络结果回来后由 Sync.onFlags 再校正一次（缓存与线上不一致时生效）
applyFeatureGates();
if (typeof Sync.onFlags === 'function') Sync.onFlags(applyFeatureGates);
Sync.ensureFlags();
Sync.onAuth(() => Sync.loadAll().then(boot).catch(err => { console.error('[app] loadAll 失败', err); toast('数据加载失败，请检查网络后刷新'); }));
Sync.loadAll().then(boot);
