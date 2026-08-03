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
  meaning: 'icons/icon-word-to-meaning.svg',
  word: 'icons/icon-meaning-to-word.svg',
  spelling: 'icons/icon-listen-spell.svg',
  quizEn: 'icons/icon-en-to-cn.svg',
  quizCn: 'icons/icon-cn-to-en.svg',
};
function modeLabelHtml() {
  return '模式：<img class="mode-ico" src="' + (MODE_ICONS[mode] || '') + '" alt=""> ' + (MODE_LABELS[mode] || '看词记义');
}
let mode = params.get('mode') || 'meaning';
if (!MODE_LABELS[mode]) mode = 'meaning';
const shuffleOrder = params.get('order') === 'shuffle';
const weakOnly = params.get('drill') === 'weak';
const wrongOnly = params.get('drill') === 'wrong';
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
function flagOf(name) { const t = tricks[name]; return (t && t.flag) || null; }
function isEasy(name) { return flagOf(name) === 'easy'; }
function isHard(name) { return flagOf(name) === 'hard'; }
function isMastered(name) { return flagOf(name) === 'mastered'; }
// 切换单词标记；再次点击同一标记则取消。重难词/太简单会改变队列，故重建。
function setFlag(name, fv) {
  if (!tricks[name]) tricks[name] = {};
  const cur = tricks[name].flag || null;
  tricks[name].flag = (cur === fv) ? null : fv;
  Sync.saveTricks(tricks);
  queue = buildQueue();
  if (idx >= queue.length) idx = 0;
  show();
}
function renderFlagBar(name) {
  const el = document.getElementById('flagBar');
  if (!el) return;
  const f = flagOf(name);
  el.innerHTML =
    `<button class="flag-btn${f === 'easy' ? ' on easy' : ''}" onclick="setFlag('${escapeHtml(name)}','easy')">✅ 太简单</button>` +
    `<button class="flag-btn${f === 'hard' ? ' on hard' : ''}" onclick="setFlag('${escapeHtml(name)}','hard')">⭐ 重难词</button>` +
    `<button class="flag-btn${f === 'mastered' ? ' on mastered' : ''}" onclick="setFlag('${escapeHtml(name)}','mastered')">🟢 已掌握</button>`;
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
  arr = arr.filter(x => !isEasy(x.w.name));   // 太简单：整体退役，不再出现
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
let queue = [];
let idx = 0;
let studiedCount = 0;   // 本场已评词数，用于离开页面防误退提示

// 音标格式化（优先显示所选英美音，否则两者都显示）
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

// 例句 HTML（主卡片用）：高亮例句中的目标单词（先转义防 XSS，再注入 <mark>）
function exampleHtml(w) {
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

// 数组洗牌
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 从其他词抽 n 个干扰项，拼成 4 选 1（返回 [{label, correct}]）
function buildOptions(correctWord, correctText, distractorText) {
  const pool = shuffle(WORDS.filter(x => x.name !== correctWord.name));
  const distract = pool.slice(0, 3);
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
  const now = Date.now();
  // 遗忘曲线间隔（天）：不会(L1)→1，模糊(L2)→2，一般(L3)→4，熟记(L4)→15
  const SRS_IV = { 1: 1, 2: 2, 3: 4, 4: 15 };
  if (!SR[mode]) SR[mode] = {};
  if (newLv <= 0) {
    // 不会：降级为 L1 薄弱词，明天再练（进入错词本，不再清空中进度）
    SR[mode][w.name] = { l: 1, due: now + 1 * DAY, iv: 1 };
  } else {
    const iv = SRS_IV[newLv] || 1;
    SR[mode][w.name] = { l: newLv, due: now + iv * DAY, iv: iv };
  }
  saveSR();
  // 记录记忆历史（用于每词记忆曲线）：记得(r=1) / 遗忘(r=0)
  if (!tricks[w.name]) tricks[w.name] = {};
  const hh = tricks[w.name].h || [];
  hh.push({ t: now, r: newLv >= 3 ? 1 : 0 });
  if (hh.length > 30) hh.shift();
  tricks[w.name].h = hh;
  Sync.saveTricks(tricks);
  studiedCount++;
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
    alert('🎉 已完成本轮复习，队列已按掌握度重置。');
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
  Sync.saveTricks(tricks);
  closeTrick();
  renderTrick();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
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
  if (e.key === 'Escape') { closeTrick(); closeCurve(); return; }
  if (!queue[idx]) return;
  // 标记快捷键（Shift + E/H/G）
  if (e.shiftKey) {
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
// 离开页面防误退：本场已学过词则确认
window.addEventListener('beforeunload', function (e) {
  if (studiedCount > 0) { e.preventDefault(); e.returnValue = ''; }
});
// 启动：从云端或本地加载数据后再构建队列并渲染（只执行一次，避免双重 buildQueue/show）
let leBooted = false;
function leBoot(d) {
  if (leBooted) return;
  leBooted = true;
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
    show();
  });
}
Sync.onAuth(() => Sync.loadAll().then(leBoot));
Sync.loadAll().then(leBoot);
