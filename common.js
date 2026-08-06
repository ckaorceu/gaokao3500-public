/* common.js — 跨页面公共工具（挂全局 window.*）
 * 须在 sync.js / app.js / learn.js / admin.js / calendar.js 之前引入。
 * 抽取自各页面重复的 escapeHtml / formatPhon / localDateStr / shuffle / toast / bootSafe，
 * 统一为单一事实来源，消除多处实现漂移。
 */
(function (root) {
  'use strict';

  // ---------- 转义（采用最完整的 null 安全实现） ----------
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- 音标格式化（优先所选英美音，否则两者都显示） ----------
  function formatPhon(w) {
    if (!w) return '';
    var acc = (typeof getAccent === 'function') ? getAccent() : 'us';
    if (acc === 'uk' && w.ukphone) return '英 /' + w.ukphone + '/';
    if (acc === 'us' && w.usphone) return '美 /' + w.usphone + '/';
    var parts = [];
    if (w.usphone) parts.push('美 /' + w.usphone + '/');
    if (w.ukphone) parts.push('英 /' + w.ukphone + '/');
    if (!parts.length && w.phonetic) parts.push('/' + w.phonetic + '/');
    return parts.join('  ');
  }

  // ---------- 本地日期 'yyyy-mm-dd' ----------
  function localDateStr(d) {
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    var y = dt.getFullYear();
    var m = ('0' + (dt.getMonth() + 1)).slice(-2);
    var day = ('0' + dt.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }

  // ---------- Fisher–Yates 洗牌（返回新数组） ----------
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------- 非阻塞轻提示（供 learn.js 等复用） ----------
  function toast(msg, type) {
    try {
      var box = document.getElementById('toast-box');
      if (!box) {
        box = document.createElement('div');
        box.id = 'toast-box';
        box.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
        document.body.appendChild(box);
      }
      var t = document.createElement('div');
      t.textContent = msg;
      var bg = type === 'err' ? 'rgba(220,38,38,.95)' : type === 'ok' ? 'rgba(22,163,74,.95)' : 'rgba(30,41,59,.92)';
      t.style.cssText = 'background:' + bg + ';color:#fff;padding:9px 16px;border-radius:10px;font-size:14px;box-shadow:0 6px 20px rgba(0,0,0,.18);max-width:80vw;opacity:1;transition:opacity .3s;';
      box.appendChild(t);
      setTimeout(function () { t.style.opacity = '0'; }, 2200);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
    } catch (e) {}
  }

  // ---------- 加载失败兜底（替代裸 loadAll().then(boot)） ----------
  function bootSafe(loader, bootFn, container) {
    return loader().then(bootFn).catch(function (err) {
      var msg = (err && err.message) ? err.message : String(err);
      var el = container || document.getElementById('app') || document.body;
      if (el && el.innerHTML !== undefined) {
        el.innerHTML = '<div class="empty" style="padding:40px;text-align:center;">' +
          '<p style="margin-bottom:14px">加载失败：' + escapeHtml(msg) + '</p>' +
          '<button class="auth-btn ok" onclick="location.reload()">重试</button></div>';
      }
    });
  }

  // ---------- 导出全局 ----------
  root.escapeHtml = escapeHtml;
  root.formatPhon = formatPhon;
  root.localDateStr = localDateStr;
  root.shuffle = shuffle;
  root.toast = toast;
  root.bootSafe = bootSafe;
})(typeof window !== 'undefined' ? window : this);
