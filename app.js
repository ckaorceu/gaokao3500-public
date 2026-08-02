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
// 跨模式最高等级（用于单词表展示/筛选）
function bestLevel(name) {
  let m = 0;
  for (const k in SR) { const r = SR[k] && SR[k][name]; if (r && r.l > m) m = r.l; }
  return m;
}
function modeLearned(mode) { const mm = SR[mode] || {}; let c = 0; for (const n in mm) if (mm[n].l > 0) c++; return c; }
function modeDue(mode) { const now = Date.now(); const mm = SR[mode] || {}; let c = 0; for (const n in mm) if (mm[n].due <= now) c++; return c; }
function totalLearned() { const s = new Set(); for (const k in SR) for (const n in SR[k]) if (SR[k][n].l > 0) s.add(n); return s.size; }
function totalDue() { let c = 0; MODES.forEach(m => c += modeDue(m.id)); return c; }

// 音标格式化：优先显示所选英美音，否则两者都显示
function formatPhon(w) {
  const acc = (typeof getAccent === 'function') ? getAccent() : 'us';
  if (acc === 'uk' && w.ukphone) return '英 /' + w.ukphone + '/';
  if (acc === 'us' && w.usphone) return '美 /' + w.usphone + '/';
  const parts = [];
  if (w.usphone) parts.push('美 /' + w.usphone + '/');
  if (w.ukphone) parts.push('英 /' + w.ukphone + '/');
  if (!parts.length && w.phonetic) parts.push('/' + w.phonetic + '/');
  return parts.join('  ');
}
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
// 单词列表按需加载：默认不渲染，点击「列出单词」后分页展示
const LIST_PAGE_SIZE = 60;
let listShown = false;
let listPage = 0;
const MODES = [
  { id: 'meaning', name: '看词记义', desc: '看单词记释义' },
  { id: 'word', name: '看义记词', desc: '看释义写单词' },
  { id: 'spelling', name: '听音拼写', desc: '听发音拼写' },
  { id: 'quizEn', name: '看英选中', desc: '选正确中文' },
  { id: 'quizCn', name: '看中选英', desc: '选正确英文' },
];

function renderModePicker() {
  const box = $('#modePicker');
  const total = WORDS.length;
  box.innerHTML = MODES.map(m => {
    const lc = modeLearned(m.id), dc = modeDue(m.id);
    const pct = ((lc / total) * 100).toFixed(lc > 0 && lc < total*0.01 ? 1 : 0);
    return `<div class="mode-chip${m.id === selectedMode ? ' active' : ''}" data-mode="${m.id}">
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
    const first = currentFilteredNames()[0];
    let base = `learn.html?mode=${selectedMode}`;
    if (selectedOrder === 'shuffle') base += '&order=shuffle';
    if (selectedDrill === 'weak') base += '&drill=weak';
    if (selectedRepeat === 'on') {
      base += '&repeat=on';
      if (selectedRepeatMax > 0) base += '&rmax=' + selectedRepeatMax;
    }
    const url = first ? `${base}&w=${encodeURIComponent(first)}` : base;
    location.href = url;
  });
  // 待复习合计提示
  $('#dueTotal').textContent = totalDue();
}

function filteredItems() {
  let items = WORDS;
  if (activeLetter !== 'all') {
    items = items.filter(w => (w.name[0] || '').toLowerCase() === activeLetter);
  }
  if (filterMode !== 'all') {
    if (filterMode === 'new') items = items.filter(w => bestLevel(w.name) === 0);
    else if (filterMode.startsWith('l')) {
      const lv = parseInt(filterMode.slice(1));
      items = items.filter(w => bestLevel(w.name) === lv);
    }
  }
  const kw = searchText.trim().toLowerCase();
  if (kw) items = items.filter(w => w.name.toLowerCase().includes(kw) || (w.meaning || '').toLowerCase().includes(kw));
  return items;
}

function currentFilteredNames() {
  return filteredItems().map(w => w.name);
}

function renderStats() {
  const total = WORDS.length;
  const learned = totalLearned();
  $('#pct-total').textContent = ((learned / total) * 100).toFixed(1) + '%';
  $('#bar-total').style.width = (learned / total) * 100 + '%';
  $('#stats').textContent = `${learned} / ${total} 已掌握`;

  const counts = [0, 0, 0, 0, 0, 0];
  WORDS.forEach(w => { counts[bestLevel(w.name)]++; });
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
        ${[1,2,3,4,5].map(i => `<div class="level-chip" style="cursor:pointer" onclick="filterByL(${i})"><div class="name">L${i}</div><div class="count">${counts[i]}</div></div>`).join('')}
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
    listPage = 0;
    renderList();
  });
}

function renderList() {
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
      <div class="phonetic">${phonetic}</div>
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// 错词本：跨模式掌握度落在 L1~L2（学过但没记牢）的词数
function wrongCount() {
  var c = 0;
  WORDS.forEach(function (w) { var b = bestLevel(w.name); if (b >= 1 && b <= 2) c++; });
  return c;
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
$('#filter').addEventListener('change', e => { filterMode = e.target.value; listPage = 0; renderList(); });
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
  // 应用后台「内容管理」对词库的覆盖（影响展示与测验）
  Sync.loadWordOverrides().then(function (ovr) {
    Sync.applyWordOverrides(ovr);
    SR = d.sr || {};
    tricks = d.tricks || {};
    renderStats(); renderLetters(); renderList(); renderModePicker();
    renderStreak();
    var wc = document.getElementById('wrongCount');
    if (wc) wc.textContent = wrongCount();
    Sync.onStudy(renderStreak);
  });
}
Sync.onAuth(() => Sync.loadAll().then(boot));
Sync.loadAll().then(boot);
