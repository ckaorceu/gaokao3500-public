(function () {
  var statusEl = document.getElementById('status');
  var newPw = document.getElementById('newPw');
  var setPw = document.getElementById('setPw');
  var cfg = window.APP_CONFIG;

  function fail(msg) { statusEl.className = 'auth-msg err'; statusEl.textContent = msg; }
  function showForm() {
    statusEl.className = 'auth-msg ok';
    statusEl.textContent = '链接有效，请设置新密码。';
    newPw.style.display = ''; setPw.style.display = '';
    try { newPw.focus(); } catch (e) {}
  }

  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase || !window.supabase.createClient) {
    fail('页面初始化失败（缺少 Supabase 配置）。');
    return;
  }
  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // 解析重置链接携带的令牌：隐式流程在 hash，PKCE 流程在 query(?code=)
  var hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  var queryParams = new URLSearchParams(location.search.replace(/^\?/, ''));
  var hasAccessToken = hashParams.has('access_token');
  var hasCode = queryParams.has('code');

  if (!hasAccessToken && !hasCode) {
    fail('这不是有效的密码重置链接，或链接已失效。请重新在登录页申请找回密码。');
    return;
  }

  var p = hasCode
    ? sb.auth.exchangeCodeForSession(queryParams.get('code'))
    : sb.auth.getSessionFromUrl();

  p.then(function (res) {
    if (res.error) { fail('链接无效或已过期：' + (res.error.message || res.error)); return; }
    showForm();
  }).catch(function (e) { fail('链接解析失败：' + (e && e.message ? e.message : e)); });

  function submit() {
    var pw = newPw.value || '';
    if (pw.length < 6) { fail('密码至少 6 位'); return; }
    statusEl.className = 'auth-msg'; statusEl.textContent = '更新中…';
    sb.auth.updateUser({ password: pw }).then(function (r) {
      if (r.error) { fail('更新失败：' + (r.error.message || r.error)); return; }
      statusEl.className = 'auth-msg ok';
      statusEl.textContent = '密码已更新，正在跳转到首页…';
      setTimeout(function () { location.href = 'index.html'; }, 1500);
    }).catch(function (e) { fail('更新失败：' + (e && e.message ? e.message : e)); });
  }

  setPw.onclick = submit;
  newPw.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
})();
