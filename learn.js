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
const MODE_LABELS = {
  meaning: '看词记义',
  word: '看义记词',
  spelling: '听音拼写',
  quizEn: '看英选中',
  quizCn: '看中选英',
};
let mode = params.get('mode') || 'meaning';
if (!MODE_LABELS[mode]) mode = 'meaning';
const shuffleOrder = params.get('order') === 'shuffle';
const weakOnly = params.get('drill') === 'weak';
const wrongOnly = params.get('drill') === 'wrong';
const repeatOn = params.get('repeat') === 'on';   // 重复记忆：评不会/模糊自动重练
const REPEAT_MAX = parseInt(params.get('rmax') || '', 10);  // 上限；NaN 或 -1 表示无限
const REPEAT_LIMIT = isNaN(REPEAT_MAX) || REPEAT_MAX < 0 ? Infinity : REPEAT_MAX;
const repeatCount = {};                           // name -> 本轮已重复次数

function srOf(name) { return (SR[mode] && SR[mode][name]) || { l: 0, due: 0, iv: 0 }; }
function bestLevel(name) { let m = 0; for (const k in SR) { const r = SR[k] && SR[k][name]; if (r && r.l > m) m = r.l; } return m; }
function getDue(name) { const r = srOf(name); return r.due || 0; }
function modeLearned(m) { const mm = SR[m] || {}; let c = 0; for (const n in mm) if (mm[n].l > 0) c++; return c; }
function modeDue(m) { const now = Date.now(); const mm = SR[m] || {}; let c = 0; for (const n in mm) if (mm[n].due <= now) c++; return c; }

// 复习队列：待复习(到点)优先，其次未学，最后远期；乱序则打乱
function buildQueue() {
  let arr = WORDS.map(w => ({ w, lv: srOf(w.name).l || 0 }));
  if (weakOnly) arr = arr.filter(x => x.lv === 0 || x.lv === 1);
  if (wrongOnly) arr = arr.filter(x => { const b = bestLevel(x.w.name); return b >= 1 && b <= 2; });
  const now = Date.now();
  arr.sort((a, b) => {
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
const sessionDone = new Set();

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

// 例句 HTML（主卡片用）
function exampleHtml(w) {
  return w.ex ? '<div class="ex">📖 ' + escapeHtml(w.ex) + '</div>' : '';
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
  return `<button class="rbtn warn" onclick="rate(0)">不会</button>
    <button class="rbtn" onclick="rate(1)">模糊</button>
    <button class="rbtn" onclick="rate(3)">一般</button>
    <button class="rbtn primary" onclick="rate(5)">熟记</button>`;
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
  $('#modeLabel').textContent = '模式：' + (MODE_LABELS[mode] || '看词记义');
  $('#counter').textContent = `${idx + 1} / ${queue.length}`;
  const mc = modeLearned(mode);
  $('#learnStats').textContent = `${mc} 已学 · ${modeDue(mode)} 待复习`;
  if (repeatOn) {
    $('#modeLabel').textContent = '模式：' + (MODE_LABELS[mode] || '看词记义') + ' · 重复记忆开';
  }
  renderTrick();

  if (mode === 'meaning') showMeaning(w);
  else if (mode === 'word') showWord(w);
  else if (mode === 'spelling') showSpelling(w);
  else if (mode === 'quizEn') showQuizEn(w);
  else if (mode === 'quizCn') showQuizCn(w);
}

// 模式一：看词记义
function showMeaning(w) {
  $('#flashcard').innerHTML = `
    <div class="word-head">
      <div class="w">${escapeHtml(w.name)}</div>
      <button class="speak" onclick="speakWord()" title="朗读">🔊</button>
    </div>
    <div class="ph">${formatPhon(w)}</div>
    <div class="mn" id="mn" style="display:none">${(w.pos ? w.pos + ' ' : '') + escapeHtml(w.meaning || '')}${exampleHtml(w)}</div>`;
  $('#actions').innerHTML = `
    <button class="primary" id="revealBtn" onclick="revealMeaning()">显示释义</button>
    <div id="rateWrap" style="display:none;gap:8px">${rateButtons()}</div>`;
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
      <div class="ph">${formatPhon(w)}</div>${exampleHtml(w)}
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
      <div class="ph">${formatPhon(w)}</div>
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
    <div class="ph">${formatPhon(w)}</div>
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
      <div class="ph">${formatPhon(w)}</div>${exampleHtml(w)}
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
  const newLv = (typeof targetLv === 'number') ? targetLv : 0;
  const now = Date.now();
  // 遗忘曲线间隔（天）：不会→1，模糊→2，一般→4，熟记→15
  const SRS_IV = { 0: 1, 1: 2, 3: 4, 5: 15 };
  if (!SR[mode]) SR[mode] = {};
  if (newLv <= 0) {
    // 不会：降级为 L1 薄弱词，明天再练（进入错词本，不再清空中进度）
    SR[mode][w.name] = { l: 1, due: now + 1 * DAY, iv: 1 };
  } else {
    const iv = SRS_IV[newLv] || 1;
    SR[mode][w.name] = { l: newLv, due: now + iv * DAY, iv: iv };
  }
  saveSR();
  sessionDone.add(w.name);
  // 重复记忆：评 不会(0)/模糊(1) 且未达上限 -> 本轮稍后重练该词
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
  tricks[w.name] = {
    assoc: $('#trickAssoc').value.trim(),
    root: $('#trickRoot').value.trim(),
    homo: $('#trickHomo').value.trim(),
    ex: $('#trickEx').value.trim(),
  };
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
  if (mode === 'meaning') {
    if (e.key === ' ') { e.preventDefault(); revealMeaning(); }
    else if (e.key === 'ArrowRight') { if ($('#rateWrap') && $('#rateWrap').style.display !== 'none') rate(5); }
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
  if (e.key === 'Escape') closeTrick();
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
