// calendar.js — 复习日历（艾宾浩斯待复习分布 + 学习历史）
const DAY = 86400000;
let SR = {};
let studiedSet = new Set();
let view = new Date(); view.setDate(1);   // 当前月首日
let booted = false;

function localDateStr(d) {
  const dt = new Date(d);
  return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2);
}
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 由 SR 的 due 时间戳，聚合「未来每天待复习的单词」
function dueWordsByDay() {
  const map = {};
  const now = Date.now();
  for (const m in SR) {
    const mm = SR[m] || {};
    for (const w in mm) {
      const r = mm[w];
      if (r && r.due && r.due > now) {
        const key = localDateStr(r.due);
        (map[key] = map[key] || []).push(w);
      }
    }
  }
  return map;
}

function renderCalendar() {
  const dueMap = dueWordsByDay();
  const y = view.getFullYear(), mo = view.getMonth();
  document.getElementById('calTitle').textContent = y + '年 ' + (mo + 1) + '月 · 待复习分布';
  const first = new Date(y, mo, 1);
  const startW = first.getDay();
  const days = new Date(y, mo + 1, 0).getDate();
  const maxc = Math.max(1, ...Object.values(dueMap).map(a => a.length));
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  for (let i = 0; i < startW; i++) {
    const e = document.createElement('div');
    e.className = 'cal-cell'; e.style.background = 'transparent'; e.style.border = 'none';
    grid.appendChild(e);
  }
  const today = startOfDay(new Date());
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, mo, d);
    const key = localDateStr(date);
    const list = dueMap[key] || [];
    const cnt = list.length;
    const studied = studiedSet.has(key);
    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (cnt ? ' has-due' : '') + (studied ? ' studied' : '') + (date.getTime() === today.getTime() ? ' today' : '');
    let html = '<div class="dnum">' + d + '</div>';
    if (studied) html += '<span class="studied-dot"></span>';
    if (cnt) {
      const op = 0.2 + 0.8 * (cnt / maxc);
      cell.style.background = 'rgba(47,107,255,' + op.toFixed(2) + ')';
      html += '<span class="cnt">' + cnt + '</span>';
    }
    cell.innerHTML = html;
    if (cnt) cell.onclick = () => showDay(key, list);
    grid.appendChild(cell);
  }
}

function showDay(key, list) {
  const detail = document.getElementById('calDetail');
  if (!list.length) { detail.innerHTML = '<div class="cal-empty">' + key + ' 没有待复习单词。</div>'; return; }
  const items = list.map(name => {
    const w = (window.WORDS || []).find(x => x.name === name) || { name: name, meaning: '' };
    return '<a href="learn.html?mode=meaning&w=' + encodeURIComponent(name) + '"><div class="w">' + escapeHtml(name) + '</div><div class="m">' + (w.meaning ? escapeHtml(w.meaning) : '点击学习') + '</div></a>';
  }).join('');
  detail.innerHTML = '<h3>' + key + ' · 待复习 ' + list.length + ' 个</h3><div class="cal-wordlist">' + items + '</div>';
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function boot(d) {
  if (booted) return;
  booted = true;
  SR = (d && d.sr) || {};
  try { studiedSet = new Set(JSON.parse(localStorage.getItem('gaokao3500.streak.v1') || '[]')); } catch (e) { studiedSet = new Set(); }
  renderCalendar();
}

document.getElementById('prevM').onclick = () => { view.setMonth(view.getMonth() - 1); renderCalendar(); };
document.getElementById('nextM').onclick = () => { view.setMonth(view.getMonth() + 1); renderCalendar(); };

Sync.onAuth(() => Sync.loadAll().then(boot));
Sync.loadAll().then(boot);
