// report.js — 首页「📊 我的学习报告」卡片 + AI 报告/计划弹窗
(function () {
  function el(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // —— 本地持久化：把 AI 报告/计划按用户存到 localStorage，刷新/重开仍可见 ——
  function cacheKey() {
    var u = (typeof Sync !== 'undefined' && Sync.currentUser) ? Sync.currentUser() : null;
    if (!u || !u.id) return null;
    return 'gaokao3500.aiReport.' + u.id;
  }
  function loadCache() {
    var k = cacheKey(); if (!k) return null;
    try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; }
  }
  function saveCache(kind, result) {
    var k = cacheKey(); if (!k) return;
    var c = loadCache() || {};
    c[kind] = { result: result, ts: Date.now() };
    try { localStorage.setItem(k, JSON.stringify(c)); } catch (e) {}
  }
  function fmtTs(ts) {
    if (!ts) return '';
    try { return new Date(ts).toLocaleString(); } catch (e) { return ''; }
  }
  function cacheHint(ts) {
    var t = fmtTs(ts);
    if (!t) return '';
    return '<div class="report-cache-hint">已保存到本机 · 上次生成于 ' + escapeHtml(t) + ' · 点上方按钮可重新生成</div>';
  }
  function showIfLoggedIn() {
    var card = el('reportCard');
    if (card && typeof Sync !== 'undefined' && Sync.currentUser && Sync.currentUser()) {
      card.style.display = '';
    }
  }
  function openReport() {
    var dlg = el('reportDlg');
    if (!dlg || !dlg.showModal) return;
    var c = loadCache();
    var st = el('reportBody');
    if (!st) { dlg.showModal(); return; }
    // 打开时先回填本地缓存（按当前登录用户隔离），无需重新请求
    // 报告与计划都已持久化：两者均存在时一并呈现，互不覆盖（旧逻辑 if/else 会让报告遮盖计划）
    var parts = [];
    if (c && c.report && c.report.result) {
      parts.push('<div class="rp-block"><h4 class="rp-h">📊 学习报告</h4><div class="report-text">' + escapeHtml(c.report.result) + '</div>' + cacheHint(c.report.ts) + '</div>');
    }
    if (c && c.plan && c.plan.result && c.plan.result.length) {
      var items = (c.plan.result || []).map(function (it) {
        var mode = it.mode || 'meaning';
        var href = 'learn.html?mode=' + encodeURIComponent(mode) + '&w=' + encodeURIComponent(it.word || '');
        return '<li><a href="' + href + '">📝 ' + escapeHtml(it.word) + ' <span class="reason">' + escapeHtml(it.reason || '') + '</span></a></li>';
      }).join('');
      parts.push('<div class="rp-block"><h4 class="rp-h">📝 复习计划</h4><ul class="plan-list">' + items + '</ul>' + cacheHint(c.plan.ts) + '</div>');
    }
    if (parts.length) {
      st.innerHTML = parts.join('');
    } else {
      st.innerHTML = '<div class="auth-msg">点击「生成报告」或「生成复习计划」，AI 会汇总你的学习数据并保存到本机 📊</div>';
    }
    dlg.showModal();
  }
  function gen(kind) {
    var st = el('reportBody');
    var token = (typeof Sync !== 'undefined' && Sync.jwt) ? Sync.jwt() : '';
    if (!token) { if (st) st.innerHTML = '<div class="auth-msg err">请先登录</div>'; return; }
    if (st) st.innerHTML = '<div class="auth-msg">✨ AI 生成中…</div>';
    fetch('https://bkuvirojzuetweondgrx.supabase.co/functions/v1/ai_report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action: kind, range: 'week' })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) { if (st) st.innerHTML = '<div class="auth-msg err">⚠️ ' + escapeHtml(d.error) + '</div>'; return; }
      saveCache(kind, d.result);
      renderResult(d, Date.now());
    }).catch(function (e) { if (st) st.innerHTML = '<div class="auth-msg err">⚠️ 生成失败：' + escapeHtml(e && e.message ? e.message : e) + '</div>'; });
  }
  function renderResult(d, ts) {
    var st = el('reportBody');
    if (!st) return;
    if (d.action === 'report') {
      st.innerHTML = '<div class="report-text">' + escapeHtml(d.result || '') + '</div>' + cacheHint(ts);
    } else {
      var list = d.result || [];
      if (!list.length) { st.innerHTML = '<div class="auth-msg">暂无可推荐复习项 🎉</div>'; return; }
      st.innerHTML = '<ul class="plan-list">' + list.map(function (it) {
        var mode = it.mode || 'meaning';
        var href = 'learn.html?mode=' + encodeURIComponent(mode) + '&w=' + encodeURIComponent(it.word || '');
        return '<li><a href="' + href + '">📝 ' + escapeHtml(it.word) + ' <span class="reason">' + escapeHtml(it.reason || '') + '</span></a></li>';
      }).join('') + '</ul>' + cacheHint(ts);
    }
  }
  // 绑定
  var card = el('reportCard'); if (card) card.addEventListener('click', openReport);
  var b1 = el('reportGenBtn'); if (b1) b1.onclick = function () { gen('report'); };
  var b2 = el('reportPlanBtn'); if (b2) b2.onclick = function () {
    if (!(window.Sync && typeof Sync.isMember === 'function' && Sync.isMember())) {
      var rb = el('reportBody'); if (rb) rb.innerHTML = '<div class="auth-msg err">👑 「个性化复习计划」为会员专属功能，请联系管理员开通会员后使用。</div>';
      return;
    }
    gen('plan');
  };
  var bc = el('reportCloseBtn'); if (bc) bc.onclick = function () { var d = el('reportDlg'); if (d) d.close(); };
  showIfLoggedIn();
  if (typeof Sync !== 'undefined' && Sync.onAuth) Sync.onAuth(showIfLoggedIn);
})();
