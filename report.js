// report.js — 首页「📊 我的学习报告」卡片 + AI 报告/计划弹窗
(function () {
  function el(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function showIfLoggedIn() {
    var card = el('reportCard');
    if (card && typeof Sync !== 'undefined' && Sync.currentUser && Sync.currentUser()) {
      card.style.display = '';
    }
  }
  function openReport() {
    var dlg = el('reportDlg');
    if (dlg && dlg.showModal) dlg.showModal();
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
      renderResult(d);
    }).catch(function (e) { if (st) st.innerHTML = '<div class="auth-msg err">⚠️ 生成失败：' + escapeHtml(e && e.message ? e.message : e) + '</div>'; });
  }
  function renderResult(d) {
    var st = el('reportBody');
    if (!st) return;
    if (d.action === 'report') {
      st.innerHTML = '<div class="report-text">' + escapeHtml(d.result || '') + '</div>';
    } else {
      var list = d.result || [];
      if (!list.length) { st.innerHTML = '<div class="auth-msg">暂无可推荐复习项 🎉</div>'; return; }
      st.innerHTML = '<ul class="plan-list">' + list.map(function (it) {
        var mode = it.mode || 'meaning';
        var href = 'learn.html?mode=' + encodeURIComponent(mode) + '&w=' + encodeURIComponent(it.word || '');
        return '<li><a href="' + href + '">📝 ' + escapeHtml(it.word) + ' <span class="reason">' + escapeHtml(it.reason || '') + '</span></a></li>';
      }).join('') + '</ul>';
    }
  }
  // 绑定
  var card = el('reportCard'); if (card) card.addEventListener('click', openReport);
  var b1 = el('reportGenBtn'); if (b1) b1.onclick = function () { gen('report'); };
  var b2 = el('reportPlanBtn'); if (b2) b2.onclick = function () { gen('plan'); };
  var bc = el('reportCloseBtn'); if (bc) bc.onclick = function () { var d = el('reportDlg'); if (d) d.close(); };
  showIfLoggedIn();
  if (typeof Sync !== 'undefined' && Sync.onAuth) Sync.onAuth(showIfLoggedIn);
})();
