/* sync.js — 高考3500词 云端同步层（全局 window.Sync）
 *
 * 设计要点：
 *  - 已配置 Supabase(anon key) 且已登录  -> 云端读写（RLS 保证只访问本人数据）
 *  - 未配置 anon key 或 未登录            -> 降级 localStorage（保持改造前体验）
 *  - 对外数据结构 { sr, tricks } 与改造前 localStorage 完全一致，
 *    app.js / learn.js 只需把 localStorage 读写换成 Sync.loadAll / saveSR / saveTricks
 */
(function () {
  'use strict';

  var SR_KEY = 'gaokao3500.sr.v1';
  var TRICK_KEY = 'gaokao3500.tricks.v1';
  var PLACEHOLDER = 'YOUR_SUPABASE_ANON_KEY';
  var SAVE_DEBOUNCE = 800;
  var DAY = 86400000;
  var STREAK_KEY = 'gaokao3500.streak.v1';

  var sb = null;          // supabase client
  var user = null;        // 当前登录用户
  var authCbs = [];       // onAuth 回调列表
  var studyCbs = [];      // onStudy 回调列表（打卡实时更新）
  var studyDates = (typeof Set !== 'undefined') ? new Set() : {}; // 学习过的本地日期集合 'yyyy-mm-dd'
  var saveTimerSR = null;
  var saveTimerTricks = null;

  // ---------- 配置读取 ----------
  function config() {
    var c = window.APP_CONFIG;
    if (c && c.SUPABASE_URL && c.SUPABASE_ANON_KEY && c.SUPABASE_ANON_KEY !== PLACEHOLDER) {
      return { url: c.SUPABASE_URL, key: c.SUPABASE_ANON_KEY };
    }
    return null;
  }

  // 仅在「已配置 key 且已登录」时才是云端模式
  function cloudEnabled() { return !!sb && !!user; }

  function localGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); }
    catch (e) { return {}; }
  }
  function localSet(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj || {})); } catch (e) {}
  }

  // ---------- 真人发音 + 英美音切换（全局，首页/学习页共用） ----------
  var ACCENT = (function () { try { return localStorage.getItem('accent') || 'us'; } catch (e) { return 'us'; } })();
  var pendingReg = null;
  window.getAccent = function () { return ACCENT; };
  window.setAccent = function (a) {
    ACCENT = (a === 'uk') ? 'uk' : 'us';
    try { localStorage.setItem('accent', ACCENT); } catch (e) {}
    var t = document.getElementById('accentToggle');
    if (t) Array.prototype.forEach.call(t.querySelectorAll('button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-accent') === ACCENT);
    });
    if (typeof window.onAccentChange === 'function') { try { window.onAccentChange(ACCENT); } catch (e) {} }
    try { document.dispatchEvent(new CustomEvent('accentchange', { detail: ACCENT })); } catch (e) {}
  };
  function speakFallback(text, acc) {
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = (acc === 'uk') ? 'en-GB' : 'en-US';
      u.rate = 0.9;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  // 真人发音：有道 dictvoice 真实录音（无需密钥）；失败回退浏览器 TTS
  window.speakText = function (text, accent) {
    text = (text || '').trim();
    if (!text) return;
    var acc = accent || ACCENT || 'us';
    var type = (acc === 'uk') ? 2 : 1;
    try {
      var url = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(text) + '&type=' + type;
      var audio = new Audio(url);
      audio.play().catch(function () { speakFallback(text, acc); });
    } catch (e) { speakFallback(text, acc); }
  };
  function wireAccentToggle() {
    var t = document.getElementById('accentToggle');
    if (!t) return;
    Array.prototype.forEach.call(t.querySelectorAll('button'), function (b) {
      if (b.getAttribute('data-accent') === ACCENT) b.classList.add('active');
      b.addEventListener('click', function () { window.setAccent(b.getAttribute('data-accent')); });
    });
  }

  // ---------- Cloudflare Turnstile 人机验证（Supabase 原生校验） ----------
  // 配置来自 config.js：window.CF_TURNSTILE_SITEKEY（Secret 配置在 Supabase 后台）。
  // 未配置（占位/空）时自动跳过验证，便于渐进式上线，不会破坏现有注册/找回密码。
  function cfKeyReal() {
    var k = window.CF_TURNSTILE_SITEKEY;
    return !!(k && k.indexOf('PLACEHOLDER') !== 0);
  }
  var _cfWidgets = {};   // action -> widgetId
  function cfRender(action) {
    if (!cfKeyReal()) return null;   // 仅 sitekey 真实才渲染；占位则跳过（渐进式上线）
    var el = document.getElementById('cfBox');
    if (!el) return null;
    el.innerHTML = '';
    _cfWidgets[action] = null;
    function doRender() {
      try {
        _cfWidgets[action] = window.turnstile.render(el, {
          sitekey: window.CF_TURNSTILE_SITEKEY,
          action: action,
          'refresh-expired': 'manual',
          'expired-callback': function () { _cfWidgets[action] = null; }
        });
      } catch (e) { _cfWidgets[action] = null; }
    }
    // 兼容 Turnstile 脚本晚于弹窗打开才加载：立即渲染 / ready 回调 / 轮询兜底（~5s）
    if (window.turnstile && window.turnstile.render) {
      doRender();
    } else if (window.turnstile && window.turnstile.ready) {
      window.turnstile.ready(doRender);
    } else {
      var _t = 0;
      var _iv = setInterval(function () {
        _t++;
        if (window.turnstile && window.turnstile.render) { clearInterval(_iv); doRender(); }
        else if (_t > 50) { clearInterval(_iv); }
      }, 100);
    }
    return _cfWidgets[action];
  }
  function cfToken(action) {
    if (window.turnstile && _cfWidgets[action] != null) {
      try { return window.turnstile.getResponse(_cfWidgets[action]) || ''; } catch (e) {}
    }
    return '';
  }
  function cfReset(action) { try { if (window.turnstile && _cfWidgets[action] != null) window.turnstile.reset(_cfWidgets[action]); } catch (e) {} }

  // 验证码（注册/找回密码/改邮箱）现在直接走 Supabase 官方 SDK，
  // Turnstile token 通过 options.captchaToken 上送，由 Supabase 服务端校验，无需自建 Worker。

  // ---------- 初始化（自动从 config 读取，无需手动 init） ----------
  function init() {
    wireAccentToggle();
    var c = config();
    if (!c) {
      console.warn('[Sync] 未检测到 Supabase anon key（仍为占位符），使用本地 localStorage 模式。');
      renderAuth();
      return;
    }
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.error('[Sync] Supabase JS SDK 未加载，降级为本地模式。');
      renderAuth();
      return;
    }
    try {
      sb = supabase.createClient(c.url, c.key);
    } catch (e) {
      console.error('[Sync] 创建 Supabase 客户端失败：', e);
      renderAuth();
      return;
    }

    // 恢复已有会话（异步）
    function notify() {
      authCbs.forEach(function (cb) {
        try { cb(user ? { id: user.id, email: user.email } : null); }
        catch (e) { console.error(e); }
      });
    }

    sb.auth.getSession().then(function (res) {
      user = (res.data && res.data.session) ? res.data.session.user : null;
      renderAuth();
      // onAuthStateChange 不会在初始订阅时触发，故恢复会话后主动通知一次，
      // 让 app.js / learn.js 拉取云端数据（解决回头登录用户只看到本地旧数据的问题）
      if (user) { fetchUsername(); fetchAdmin(); notify(); }
    }).catch(function () { renderAuth(); });

    // 登录态变化：更新 UI 并通知订阅者（app.js / learn.js 会重新拉取并渲染）
    sb.auth.onAuthStateChange(function (_event, session) {
      user = session ? session.user : null;
      renderAuth();
      if (user) { fetchUsername(); fetchAdmin(); }
      notify();
    });
    renderAuth();
  }

  // ---------- 公开 API ----------
  function onAuth(cb) { if (typeof cb === 'function') authCbs.push(cb); }
  function currentUser() { return user ? { id: user.id, email: user.email, username: user.username || null, isAdmin: !!user.isAdmin } : null; }

  // 当前用户是否管理员（依赖 supabase_admin.sql 的 am_i_admin RPC）
  function amIAdmin() {
    if (!sb) return Promise.resolve(false);
    return sb.rpc('am_i_admin').then(function (r) {
      if (r && !r.error) return !!r.data;
      return false;
    });
  }
  // 拉取管理员标记用于顶栏「后台」入口
  function fetchAdmin() {
    if (!sb || !user) return;
    sb.rpc('am_i_admin').then(function (r) {
      if (r && !r.error) { user.isAdmin = !!r.data; renderAuth(); }
    }).catch(function () {});
  }

  function signUp(email, pw, username, captchaToken) {
    var opts = {};
    if (username) opts.data = { username: username };
    if (captchaToken) opts.captchaToken = captchaToken;
    return sb.auth.signUp({ email: email, password: pw, options: opts }).then(function (r) {
      if (r.error) throw r.error; return r.data;
    });
  }
  // 验证码注册：校验 6 位邮箱验证码（需 Supabase 后台开启 Email OTP）
  function verifyOtp(email, token) {
    if (!sb) return Promise.reject(new Error('未初始化'));
    return sb.auth.verifyOtp({ email: email, token: String(token || '').trim(), type: 'signup' }).then(function (r) {
      if (r.error) throw r.error; return r.data;
    });
  }
  function signIn(identifier, pw, captchaToken) {
    return resolveEmail(identifier).then(function (email) {
      var opts = {};
      if (captchaToken) opts.captchaToken = captchaToken;
      return sb.auth.signInWithPassword({ email: email, password: pw, options: opts });
    }).then(function (r) {
      if (r.error) throw r.error; return r.data;
    });
  }
  // 用户名 -> 邮箱 解析（依赖 supabase_profiles.sql 的 email_for_username RPC）
  function resolveEmail(identifier) {
    identifier = (identifier || '').trim();
    if (identifier.indexOf('@') !== -1) return Promise.resolve(identifier);
    return sb.rpc('email_for_username', { p_username: identifier }).then(function (r) {
      if (r.error) throw new Error('用户名登录暂未启用，请先用邮箱登录');
      if (!r.data) throw new Error('用户名不存在');
      return r.data;
    });
  }
  // 注册时检查用户名是否可用（依赖 username_taken RPC；未就绪时放行，由唯一索引兜底）
  function usernameAvailable(uname) {
    return sb.rpc('username_taken', { p_username: uname }).then(function (r) {
      if (r.error) return true;
      return !r.data;
    });
  }
  // 修改密码：先用当前密码重新认证，再 updateUser（需要已登录）
  function changePassword(currentPw, newPw, captchaToken) {
    if (!user) return Promise.reject(new Error('请先登录'));
    if (!user.email) return Promise.reject(new Error('当前账号无邮箱，无法修改密码'));
    var opts = {};
    if (captchaToken) opts.captchaToken = captchaToken;
    return sb.auth.signInWithPassword({ email: user.email, password: currentPw, options: opts }).then(function (r) {
      if (r.error) throw new Error('当前密码不正确');
      return sb.auth.updateUser({ password: newPw });
    }).then(function (r) {
      if (r.error) throw r.error; return r.data;
    });
  }
  function signOut() {
    return sb.auth.signOut().then(function (r) {
      if (r.error) throw r.error;
    });
  }

  // 拉取整库：登录后首次调用，返回 { sr, tricks }
  function loadAll() {
    if (!cloudEnabled()) {
      var sr = localGet(SR_KEY), tricks = localGet(TRICK_KEY);
      // 离线/本地模式：SR 不存学习时间戳，用 due/iv 反推 + 合并已持久化的打卡日期
      rebuildStudyDates(sr);
      return Promise.resolve({ sr: sr, tricks: tricks });
    }
    return Promise.all([fetchSR(), fetchTricks()]).then(function (res) {
      var sr = res[0], tricks = res[1];
      // 同时写本地缓存，便于登出后降级 / 离线兜底
      localSet(SR_KEY, sr);
      localSet(TRICK_KEY, tricks);
      // 云端模式：fetchSR 已按 updated_at 填充 studyDates，这里持久化以便离线兜底
      persistStudyDates();
      return { sr: sr, tricks: tricks };
    });
  }

  function fetchSR() {
    return sb.from('sr_progress').select('mode,word,l,due,iv,updated_at').eq('user_id', user.id)
      .then(function (r) {
        if (r.error) throw r.error;
        var sr = {};
        (r.data || []).forEach(function (row) {
          sr[row.mode] = sr[row.mode] || {};
          sr[row.mode][row.word] = { l: row.l, due: row.due, iv: row.iv };
          if (row.updated_at) studyDates.add(localDateStr(row.updated_at));
        });
        return sr;
      });
  }
  function fetchTricks() {
    return sb.from('tricks').select('word,assoc,root,homo,ex').eq('user_id', user.id)
      .then(function (r) {
        if (r.error) throw r.error;
        var t = {};
        (r.data || []).forEach(function (row) {
          t[row.word] = {
            assoc: row.assoc || '', root: row.root || '',
            homo: row.homo || '', ex: row.ex || ''
          };
        });
        return t;
      });
  }

  // 立即镜像到本地 + 防抖同步云端
  function saveSR(srObj) {
    localSet(SR_KEY, srObj);
    // 打卡：记录今天已学习并通知 UI 实时更新
    studyDates.add(localDateStr(new Date()));
    persistStudyDates();
    emitStudy();
    if (!cloudEnabled()) return;
    clearTimeout(saveTimerSR);
    saveTimerSR = setTimeout(function () {
      _saveSR(srObj).catch(function (e) { console.error('[Sync] saveSR 失败', e); });
      // 记录今日打卡（支撑后台「连续打卡榜」）；忽略错误，不阻塞主流程
      if (user && sb) { rpc('log_study', { p_cnt: 1 }).catch(function () {}); }
    }, SAVE_DEBOUNCE);
  }

  // 整体 upsert 已学条目，并删除本地已不存在的行（如评级<=0被删除）
  function _saveSR(srObj) {
    var present = [];
    for (var m in srObj) {
      if (!srObj.hasOwnProperty(m)) continue;
      var words = srObj[m] || {};
      for (var w in words) {
        if (!words.hasOwnProperty(w)) continue;
        var row = words[w];
        if (row && row.l > 0) {
          present.push({ user_id: user.id, mode: m, word: w, l: row.l, due: row.due || 0, iv: row.iv || 0 });
        }
      }
    }
    var upsertP = present.length
      ? sb.from('sr_progress').upsert(present, { onConflict: 'user_id,mode,word' })
      : Promise.resolve({ error: null });

    return upsertP.then(function (r) {
      if (r && r.error) throw r.error;
      return sb.from('sr_progress').select('mode,word').eq('user_id', user.id);
    }).then(function (r) {
      if (r.error) throw r.error;
      var have = {};
      present.forEach(function (p) { have[p.mode + '\u0000' + p.word] = true; });
      var toDel = (r.data || []).filter(function (row) { return !have[row.mode + '\u0000' + row.word]; });
      return deleteRows('sr_progress', toDel, function (row) {
        return sb.from('sr_progress').delete().eq('user_id', user.id).eq('mode', row.mode).eq('word', row.word);
      });
    });
  }

  function saveTricks(tricksObj) {
    localSet(TRICK_KEY, tricksObj);
    if (!cloudEnabled()) return;
    clearTimeout(saveTimerTricks);
    saveTimerTricks = setTimeout(function () {
      _saveTricks(tricksObj).catch(function (e) { console.error('[Sync] saveTricks 失败', e); });
    }, SAVE_DEBOUNCE);
  }

  function _saveTricks(tricksObj) {
    var present = [];
    for (var w in tricksObj) {
      if (!tricksObj.hasOwnProperty(w)) continue;
      var t = tricksObj[w] || {};
      var assoc = (t.assoc || '').trim();
      var root = (t.root || '').trim();
      var homo = (t.homo || '').trim();
      var ex = (t.ex || '').trim();
      if (assoc || root || homo || ex) {
        present.push({ user_id: user.id, word: w, assoc: assoc, root: root, homo: homo, ex: ex });
      }
    }
    var upsertP = present.length
      ? sb.from('tricks').upsert(present, { onConflict: 'user_id,word' })
      : Promise.resolve({ error: null });

    return upsertP.then(function (r) {
      if (r && r.error) throw r.error;
      return sb.from('tricks').select('word').eq('user_id', user.id);
    }).then(function (r) {
      if (r.error) throw r.error;
      var have = {};
      present.forEach(function (p) { have[p.word] = true; });
      var toDel = (r.data || []).filter(function (row) { return !have[row.word]; });
      return deleteRows('tricks', toDel, function (row) {
        return sb.from('tricks').delete().eq('user_id', user.id).eq('word', row.word);
      });
    });
  }

  // 逐行删除（Supabase 不支持元组 IN，行数通常很少）
  function deleteRows(_table, rows, delFn) {
    var chain = Promise.resolve();
    rows.forEach(function (row) {
      chain = chain.then(function () { return delFn(row); });
    });
    return chain;
  }

  // ---------- 打卡 streak ----------
  // 把时间戳转成本地日期 'yyyy-mm-dd'
  function localDateStr(d) {
    var dt = (d instanceof Date) ? d : new Date(d);
    var y = dt.getFullYear();
    var m = ('0' + (dt.getMonth() + 1)).slice(-2);
    var day = ('0' + dt.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }
  // 连续学习天数：从今天（今天没学则从昨天）往前数连续有记录的天数
  function computeStreak() {
    var streak = 0;
    var d = new Date();
    if (!studyDates.has(localDateStr(d))) d.setDate(d.getDate() - 1);
    while (studyDates.has(localDateStr(d))) { streak++; d.setDate(d.getDate() - 1); }
    return streak;
  }
  // 把当前 studyDates 持久化到 localStorage（跨会话 / 离线兜底）
  function persistStudyDates() {
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(Array.from(studyDates))); } catch (e) {}
  }
  // 离线/本地模式重建打卡日期集合：合并已持久化历史 + 由每条 SR 的 due/iv 反推最近学习日
  function rebuildStudyDates(sr) {
    try {
      var saved = JSON.parse(localStorage.getItem(STREAK_KEY) || '[]');
      if (Array.isArray(saved)) saved.forEach(function (d) { studyDates.add(d); });
    } catch (e) {}
    sr = sr || {};
    for (var m in sr) {
      if (!sr.hasOwnProperty(m)) continue;
      var words = sr[m] || {};
      for (var w in words) {
        if (!words.hasOwnProperty(w)) continue;
        var r = words[w];
        if (r && r.due && r.iv) {
          var ts = r.due - (r.iv || 1) * DAY;
          if (ts > 0) studyDates.add(localDateStr(ts));
        }
      }
    }
    persistStudyDates();
  }
  function emitStudy() {
    studyCbs.forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } });
  }
  function onStudy(cb) { if (typeof cb === 'function') studyCbs.push(cb); }

  // 清空当前用户全部进度与巧记
  function resetAll() {
    if (cloudEnabled()) {
      return Promise.all([
        sb.from('sr_progress').delete().eq('user_id', user.id),
        sb.from('tricks').delete().eq('user_id', user.id)
      ]).then(function (res) {
        res.forEach(function (r) { if (r && r.error) throw r.error; });
        localSet(SR_KEY, {}); localSet(TRICK_KEY, {});
      });
    }
    localSet(SR_KEY, {}); localSet(TRICK_KEY, {});
    return Promise.resolve();
  }

  // ---------- 登录 / 注册 / 改密码 UI ----------
  // 登录后确保 user_profiles 表存在本用户的用户名行（从注册时写入的 user_metadata 补建）
  function ensureProfile() {
    if (!sb || !user) return;
    var uname = (user.user_metadata && user.user_metadata.username) || null;
    if (!uname) return;
    sb.from('user_profiles').select('username').eq('user_id', user.id).then(function (r) {
      if (r.error) return;
      if (r.data && r.data.length) {
        user.username = r.data[0].username;
        renderAuth();
        return;
      }
      sb.from('user_profiles').insert({ user_id: user.id, username: uname }).then(function (ir) {
        if (!ir.error) { user.username = uname; renderAuth(); }
      }).catch(function () {});
    }).catch(function () {});
  }

  // 拉取当前用户的用户名用于顶栏展示（依赖 my_username RPC；查不到则从 metadata 补建）
  function fetchUsername() {
    if (!sb || !user) return;
    sb.rpc('my_username').then(function (r) {
      if (r && !r.error && r.data) {
        user.username = r.data;
        renderAuth();
      } else {
        ensureProfile();
      }
    }).catch(function () { ensureProfile(); });
  }

  function renderAuth() {
    var mount = document.getElementById('auth-mount');
    if (!mount) return;
    if (!config()) {
      mount.innerHTML = '<span class="auth-user">本地模式</span>';
      return;
    }
    if (user) {
      var name = user.username || user.email || '已登录';
      var html = '<span class="auth-user">👤 ' + escapeHtml(name) + '</span>';
      if (user.isAdmin) html += '<a class="auth-btn" href="admin.html">后台</a>';
      html +=
        '<button class="auth-btn" id="authChangePw">改密码</button>' +
        '<button class="auth-btn" id="authChangeEmail">改邮箱</button>' +
        '<button class="auth-btn" id="authSignOut">退出</button>';
      mount.innerHTML = html;
      var cp = document.getElementById('authChangePw');
      if (cp) cp.onclick = openChangePw;
      var ceBtn = document.getElementById('authChangeEmail');
      if (ceBtn) ceBtn.onclick = showChangeEmail;
      var so = document.getElementById('authSignOut');
      if (so) so.onclick = function () {
        signOut().catch(function (e) { alert('退出失败：' + (e && e.message ? e.message : e)); });
      };
    } else {
      mount.innerHTML = '<button class="auth-btn" id="authOpen">登录 / 注册</button>';
      var ob = document.getElementById('authOpen');
      if (ob) ob.onclick = openModal;
    }
  }

  function closeModal() {
    var o = document.getElementById('authOverlay');
    if (o) o.remove();
  }

  // 在已存在的 overlay 中渲染 .auth-box（不存在则创建 overlay）
  function box(html) {
    var overlay = document.getElementById('authOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'auth-overlay';
      overlay.id = 'authOverlay';
      document.body.appendChild(overlay);
      overlay.onclick = function (e) { if (e.target === overlay) closeModal(); };
    }
    overlay.innerHTML = '<div class="auth-box">' + html + '</div>';
  }

  function openModal() { closeModal(); showLogin(); }

  function showLogin() {
    box(
      '<h3>登录</h3>' +
      '<input id="authId" type="text" placeholder="邮箱或用户名" autocomplete="username">' +
      '<input id="authPw" type="password" placeholder="密码（至少 6 位）" autocomplete="current-password">' +
      '<div class="cf-wrap">' +
        '<div class="cf-label"><span class="cf-lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>安全验证<span class="cf-sub">· 请完成人机验证后继续</span></div>' +
        '<div class="cf-box" id="cfBox"></div>' +
      '</div>' +
      '<div class="auth-msg" id="authMsg"></div>' +
      '<div class="row">' +
        '<button class="auth-btn primary" id="authLogin">登录</button>' +
        '<button class="auth-btn" id="authToReg">注册</button>' +
      '</div>' +
      '<div class="auth-forgot"><a href="#" id="authForgot">忘记密码？</a></div>' +
      '<div class="row"><button class="auth-btn" id="authCancel">取消</button></div>'
    );
    document.getElementById('authCancel').onclick = closeModal;
    document.getElementById('authLogin').onclick = doAuth;
    document.getElementById('authToReg').onclick = showRegister;
    var forgot = document.getElementById('authForgot');
    if (forgot) forgot.onclick = function (e) { e.preventDefault(); showReset(); };
    var idEl = document.getElementById('authId');
    if (idEl) idEl.focus();
    cfRender('login');
  }

  function showRegister() {
    box(
      '<h3>注册</h3>' +
      '<input id="authUser" type="text" placeholder="用户名（3-20位，字母/数字/中文/下划线）" autocomplete="username" maxlength="20">' +
      '<input id="authEmail" type="email" placeholder="邮箱" autocomplete="email">' +
      '<input id="authPw" type="password" placeholder="密码（至少 6 位）" autocomplete="new-password">' +
      '<div class="cf-wrap">' +
        '<div class="cf-label"><span class="cf-lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>安全验证<span class="cf-sub">· 请完成人机验证后继续</span></div>' +
        '<div class="cf-box" id="cfBox"></div>' +
      '</div>' +
      '<div class="auth-msg" id="authMsg"></div>' +
      '<div class="row">' +
        '<button class="auth-btn primary" id="authReg">注册</button>' +
        '<button class="auth-btn" id="authToLogin">返回登录</button>' +
      '</div>'
    );
    document.getElementById('authReg').onclick = doRegister;
    document.getElementById('authToLogin').onclick = showLogin;
    cfRender('signup');
    var ue = document.getElementById('authUser');
    if (ue) ue.focus();
  }

  function doAuth() {
    var id = (document.getElementById('authId').value || '').trim();
    var pw = document.getElementById('authPw').value || '';
    var msg = document.getElementById('authMsg');
    if (!id || !pw) { msg.className = 'auth-msg err'; msg.textContent = '请填写账号和密码'; return; }
    if (pw.length < 6) { msg.className = 'auth-msg err'; msg.textContent = '密码至少 6 位'; return; }
    if (cfKeyReal() && !cfToken('login')) { msg.className = 'auth-msg err'; msg.textContent = '请先完成人机验证'; return; }
    msg.className = 'auth-msg'; msg.textContent = '处理中…';
    signIn(id, pw, cfToken('login')).then(function () {
      cfReset('login');
      msg.className = 'auth-msg ok';
      msg.textContent = '成功，正在同步…';
      setTimeout(closeModal, 600);
    }).catch(function (e) {
      cfReset('login');
      msg.className = 'auth-msg err';
      msg.textContent = (e && e.message) ? e.message : '操作失败';
    });
  }

  function doRegister() {
    var uname = (document.getElementById('authUser').value || '').trim();
    var email = (document.getElementById('authEmail').value || '').trim();
    var pw = document.getElementById('authPw').value || '';
    var msg = document.getElementById('authMsg');
    if (!uname || !email || !pw) { msg.className = 'auth-msg err'; msg.textContent = '请填写用户名、邮箱和密码'; return; }
    if (!/^[\w一-龥]{3,20}$/.test(uname)) { msg.className = 'auth-msg err'; msg.textContent = '用户名需 3-20 位（字母/数字/中文/下划线）'; return; }
    if (pw.length < 6) { msg.className = 'auth-msg err'; msg.textContent = '密码至少 6 位'; return; }
    if (cfKeyReal()) {
      if (!window.turnstile) { msg.className = 'auth-msg err'; msg.textContent = '人机验证组件加载中，请稍候重试'; return; }
      var tk = cfToken('signup');
      if (!tk) { msg.className = 'auth-msg err'; msg.textContent = '请先完成人机验证'; return; }
    }
    msg.className = 'auth-msg'; msg.textContent = '检查用户名…';
    usernameAvailable(uname).then(function (ok) {
      if (!ok) { msg.className = 'auth-msg err'; msg.textContent = '用户名已被占用'; return; }
      if (cfKeyReal() && !cfToken('signup')) { msg.className = 'auth-msg err'; msg.textContent = '人机验证已失效，请重试'; return; }
      msg.textContent = '注册中…';
      pendingReg = { email: email, pw: pw, uname: uname };
      return signUp(email, pw, uname, cfToken('signup'));
    }).then(function () {
      cfReset('signup');
      showOtpStep(email);
    }).catch(function (e) {
      msg.className = 'auth-msg err';
      msg.textContent = (e && e.message) ? e.message : '注册失败';
    });
  }

  // 验证码步骤：输入邮箱收到的 6 位验证码完成激活
  function showOtpStep(email) {
    box(
      '<h3>验证邮箱</h3>' +
      '<p class="auth-hint">验证码已发送至 <b>' + escapeHtml(email) + '</b>（6 位数字），请查收并输入。</p>' +
      '<input id="authCode" type="text" inputmode="numeric" maxlength="8" placeholder="输入 6 位验证码" autocomplete="one-time-code">' +
      '<div class="cf-wrap">' +
        '<div class="cf-label"><span class="cf-lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>安全验证<span class="cf-sub">· 请完成人机验证后继续</span></div>' +
        '<div class="cf-box" id="cfBox"></div>' +
      '</div>' +
      '<div class="auth-msg" id="authMsg"></div>' +
      '<div class="row">' +
        '<button class="auth-btn primary" id="authVerify">验证并登录</button>' +
        '<button class="auth-btn" id="authResend">重新发送</button>' +
      '</div>' +
      '<div class="auth-forgot"><a href="#" id="authBackLogin">返回登录</a></div>'
    );
    cfRender('signup');
    var m = document.getElementById('authMsg');
    function doVerify() {
      var code = (document.getElementById('authCode').value || '').trim();
      if (!code) { m.className = 'auth-msg err'; m.textContent = '请输入验证码'; return; }
      m.className = 'auth-msg'; m.textContent = '验证中…';
      verifyOtp(email, code).then(function () {
        m.className = 'auth-msg ok'; m.textContent = '验证成功，正在登录…';
        setTimeout(function () {
          closeModal();
          if (Sync && Sync.loadAll) Sync.loadAll().catch(function () {});
        }, 600);
      }).catch(function (e) {
        m.className = 'auth-msg err';
        m.textContent = '验证失败：' + ((e && e.message) ? e.message : '验证码错误') +
          '。若邮件里是「激活链接」，请点击链接完成注册后到登录页登录。';
      });
    }
    document.getElementById('authVerify').onclick = doVerify;
    document.getElementById('authCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') doVerify(); });
    document.getElementById('authBackLogin').onclick = function (e) { e.preventDefault(); showLogin(); };
    document.getElementById('authResend').onclick = function () {
      if (!pendingReg) return;
      if (cfKeyReal() && !cfToken('signup')) { m.className = 'auth-msg err'; m.textContent = '请先完成人机验证'; return; }
      signUp(pendingReg.email, pendingReg.pw, pendingReg.uname, cfToken('signup'))
        .then(function () {
          cfReset('signup'); cfRender('signup');
          m.className = 'auth-msg ok'; m.textContent = '已重新发送验证码';
        }).catch(function (e) {
          m.className = 'auth-msg err'; m.textContent = (e && e.message) ? e.message : '发送失败';
        });
    };
    var ce = document.getElementById('authCode'); if (ce) ce.focus();
  }

  // ---------- 找回密码（验证码流程） ----------
  function verifyOtpEmail(email, code, type) {
    if (!sb) return Promise.reject(new Error('未初始化'));
    return sb.auth.verifyOtp({ email: email, token: String(code || '').trim(), type: type }).then(function (r) {
      if (r.error) throw r.error; return r.data;
    });
  }

  function showReset() {
    box(
      '<h3>找回密码</h3>' +
      '<input id="authResetEmail" type="email" placeholder="注册时使用的邮箱" autocomplete="email">' +
      '<div class="cf-wrap">' +
        '<div class="cf-label"><span class="cf-lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>安全验证<span class="cf-sub">· 请完成人机验证后继续</span></div>' +
        '<div class="cf-box" id="cfBox"></div>' +
      '</div>' +
      '<button class="auth-btn primary" id="authSendReset">发送验证码</button>' +
      '<div class="auth-msg" id="authResetMsg"></div>' +
      '<div class="row"><button class="auth-btn" id="authResetCancel">返回</button></div>'
    );
    document.getElementById('authResetCancel').onclick = showLogin;
    document.getElementById('authSendReset').onclick = doReset;
    cfRender('recovery');
    var ie = document.getElementById('authResetEmail');
    if (ie) ie.focus();
  }

  function doReset() {
    var email = (document.getElementById('authResetEmail').value || '').trim();
    var msg = document.getElementById('authResetMsg');
    if (!email) { msg.className = 'auth-msg err'; msg.textContent = '请填写邮箱'; return; }
    if (cfKeyReal() && !cfToken('recovery')) { msg.className = 'auth-msg err'; msg.textContent = '请先完成人机验证'; return; }
    msg.className = 'auth-msg'; msg.textContent = '发送中…';
    sb.auth.resetPasswordForEmail(email, cfToken('recovery') ? { captchaToken: cfToken('recovery') } : undefined).then(function (r) {
      if (r.error) throw r.error;
      cfReset('recovery');
      showRecoveryCode(email);
    }).catch(function (e) {
      msg.className = 'auth-msg err';
      msg.textContent = (e && e.message) ? e.message : '发送失败';
    });
  }

  function showRecoveryCode(email) {
    box(
      '<h3>重置密码</h3>' +
      '<p class="auth-hint">验证码已发送至 <b>' + escapeHtml(email) + '</b>（6 位数字），请输入以验证身份。</p>' +
      '<input id="authRecCode" type="text" inputmode="numeric" maxlength="8" placeholder="输入 6 位验证码">' +
      '<div class="auth-msg" id="authResetMsg"></div>' +
      '<div class="row">' +
        '<button class="auth-btn primary" id="authRecVerify">验证并设新密码</button>' +
        '<button class="auth-btn" id="authRecResend">重新发送</button>' +
      '</div>' +
      '<div class="auth-forgot"><a href="#" id="authRecBack">返回登录</a></div>'
    );
    var m = document.getElementById('authResetMsg');
    document.getElementById('authRecBack').onclick = function (e) { e.preventDefault(); showLogin(); };
    document.getElementById('authRecResend').onclick = function () {
      if (cfKeyReal() && !cfToken('recovery')) { m.className = 'auth-msg err'; m.textContent = '请先完成人机验证'; return; }
      sb.auth.resetPasswordForEmail(email, cfToken('recovery') ? { captchaToken: cfToken('recovery') } : undefined).then(function (r) {
        if (r.error) throw r.error;
        cfReset('recovery');
        m.className = 'auth-msg ok'; m.textContent = '已重新发送';
      }).catch(function (e) { m.className = 'auth-msg err'; m.textContent = (e && e.message) ? e.message : '发送失败'; });
    };
    document.getElementById('authRecVerify').onclick = function () {
      var code = (document.getElementById('authRecCode').value || '').trim();
      if (!code) { m.className = 'auth-msg err'; m.textContent = '请输入验证码'; return; }
      m.className = 'auth-msg'; m.textContent = '验证中…';
      verifyOtpEmail(email, code, 'recovery').then(function () {
        showSetNewPw();
      }).catch(function (e) {
        m.className = 'auth-msg err'; m.textContent = '验证失败：' + ((e && e.message) ? e.message : '验证码错误');
      });
    };
    var ce = document.getElementById('authRecCode'); if (ce) ce.focus();
  }

  function showSetNewPw() {
    box(
      '<h3>设置新密码</h3>' +
      '<input id="authNew" type="password" placeholder="新密码（至少 6 位）" autocomplete="new-password">' +
      '<input id="authNew2" type="password" placeholder="再次输入新密码" autocomplete="new-password">' +
      '<div class="auth-msg" id="authResetMsg"></div>' +
      '<div class="row"><button class="auth-btn primary" id="authDoSet">更新密码</button>' +
      '<button class="auth-btn" id="authCancel">取消</button></div>'
    );
    document.getElementById('authCancel').onclick = closeModal;
    document.getElementById('authDoSet').onclick = function () {
      var nw = document.getElementById('authNew').value || '';
      var nw2 = document.getElementById('authNew2').value || '';
      var m = document.getElementById('authResetMsg');
      if (nw.length < 6) { m.className = 'auth-msg err'; m.textContent = '新密码至少 6 位'; return; }
      if (nw !== nw2) { m.className = 'auth-msg err'; m.textContent = '两次输入不一致'; return; }
      m.className = 'auth-msg'; m.textContent = '更新中…';
      sb.auth.updateUser({ password: nw }).then(function (r) {
        if (r.error) throw r.error;
        m.className = 'auth-msg ok'; m.textContent = '密码已更新，请重新登录';
        setTimeout(closeModal, 1200);
      }).catch(function (e) { m.className = 'auth-msg err'; m.textContent = '更新失败：' + ((e && e.message) ? e.message : e); });
    };
    var ce = document.getElementById('authNew'); if (ce) ce.focus();
  }

  // ---------- 修改邮箱（验证码确认） ----------
  function showChangeEmail() {
    closeModal();
    box(
      '<h3>修改邮箱</h3>' +
      '<p class="auth-hint">确认码将发送至新邮箱。当前邮箱：<b>' + escapeHtml((user && user.email) || '') + '</b></p>' +
      '<input id="authNewEmail" type="email" placeholder="新邮箱" autocomplete="email">' +
      '<div class="cf-wrap">' +
        '<div class="cf-label"><span class="cf-lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>安全验证<span class="cf-sub">· 请完成人机验证后继续</span></div>' +
        '<div class="cf-box" id="cfBox"></div>' +
      '</div>' +
      '<div class="auth-msg" id="authMsg"></div>' +
      '<div class="row"><button class="auth-btn primary" id="authDoChangeEmail">发送确认码</button>' +
      '<button class="auth-btn" id="authCancel">取消</button></div>'
    );
    document.getElementById('authCancel').onclick = closeModal;
    document.getElementById('authDoChangeEmail').onclick = doChangeEmail;
    cfRender('email_change');
    var ne = document.getElementById('authNewEmail'); if (ne) ne.focus();
  }

  function doChangeEmail() {
    var ne = (document.getElementById('authNewEmail').value || '').trim();
    var msg = document.getElementById('authMsg');
    if (!ne) { msg.className = 'auth-msg err'; msg.textContent = '请填写新邮箱'; return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ne)) { msg.className = 'auth-msg err'; msg.textContent = '邮箱格式不正确'; return; }
    if (cfKeyReal() && !cfToken('email_change')) { msg.className = 'auth-msg err'; msg.textContent = '请先完成人机验证'; return; }
    msg.className = 'auth-msg'; msg.textContent = '获取会话…';
    sb.auth.getSession().then(function (res) {
      var sess = res.data && res.data.session;
      if (!sess) throw new Error('登录已过期，请重新登录');
      if (!sb.auth.updateUser) throw new Error('客户端不支持修改邮箱');
      return sb.auth.updateUser({ email: ne }, cfToken('email_change') ? { captchaToken: cfToken('email_change') } : undefined);
    }).then(function (r) {
      if (r.error) throw r.error;
      cfReset('email_change');
      msg.className = 'auth-msg ok'; msg.textContent = '确认码已发送至新邮箱，请查收完成确认。';
    }).catch(function (e) {
      msg.className = 'auth-msg err'; msg.textContent = (e && e.message) ? e.message : '发送失败';
    });
  }

  // ---------- 修改密码 ----------
  function openChangePw() {
    closeModal();
    box(
      '<h3>修改密码</h3>' +
      '<input id="authCur" type="password" placeholder="当前密码" autocomplete="current-password">' +
      '<input id="authNew" type="password" placeholder="新密码（至少 6 位）" autocomplete="new-password">' +
      '<input id="authNew2" type="password" placeholder="再次输入新密码" autocomplete="new-password">' +
      '<div class="cf-wrap">' +
        '<div class="cf-label"><span class="cf-lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>安全验证<span class="cf-sub">· 请完成人机验证后继续</span></div>' +
        '<div class="cf-box" id="cfBox"></div>' +
      '</div>' +
      '<div class="auth-msg" id="authMsg"></div>' +
      '<div class="row">' +
        '<button class="auth-btn primary" id="authDoChange">确定修改</button>' +
        '<button class="auth-btn" id="authCancel">取消</button>' +
      '</div>'
    );
    document.getElementById('authCancel').onclick = closeModal;
    document.getElementById('authDoChange').onclick = doChangePw;
    var ce = document.getElementById('authCur');
    if (ce) ce.focus();
    cfRender('changepw');
  }

  function doChangePw() {
    var cur = document.getElementById('authCur').value || '';
    var nw = document.getElementById('authNew').value || '';
    var nw2 = document.getElementById('authNew2').value || '';
    var msg = document.getElementById('authMsg');
    if (!cur || !nw || !nw2) { msg.className = 'auth-msg err'; msg.textContent = '请填写所有字段'; return; }
    if (nw.length < 6) { msg.className = 'auth-msg err'; msg.textContent = '新密码至少 6 位'; return; }
    if (nw !== nw2) { msg.className = 'auth-msg err'; msg.textContent = '两次输入的新密码不一致'; return; }
    if (cfKeyReal() && !cfToken('changepw')) { msg.className = 'auth-msg err'; msg.textContent = '请先完成人机验证'; return; }
    msg.className = 'auth-msg'; msg.textContent = '验证中…';
    changePassword(cur, nw, cfToken('changepw')).then(function () {
      cfReset('changepw');
      msg.className = 'auth-msg ok';
      msg.textContent = '密码已修改';
      setTimeout(closeModal, 800);
    }).catch(function (e) {
      cfReset('changepw');
      msg.className = 'auth-msg err';
      msg.textContent = (e && e.message) ? e.message : '修改失败';
    });
  }

  // ---------- 内容管理：词库覆盖 ----------
  // 读取管理员在后台编辑的单词覆盖（所有人可读，含未登录），返回 { word: {...} }
  function loadWordOverrides() {
    if (!config()) return Promise.resolve({});
    if (!sb) return Promise.resolve({});
    return sb.from('word_overrides').select('word,pos,meaning,phonetic,usphone,ukphone,assoc,root,homo,ex')
      .then(function (r) {
        if (r.error) return {};
        var map = {};
        (r.data || []).forEach(function (o) { map[o.word] = o; });
        return map;
      });
  }
  // 列出全部单词覆盖（后台「内容管理-导出」用），返回数组
  function listWordOverrides() {
    if (!sb) return Promise.resolve([]);
    return sb.from('word_overrides')
      .select('word,pos,meaning,phonetic,usphone,ukphone,assoc,root,homo,ex,updated_at')
      .order('word').then(function (r) {
        if (r.error) return [];
        return r.data || [];
      });
  }

  // 把覆盖应用到全局 WORDS（影响展示与测验），巧记类字段另存为兜底
  function applyWordOverrides(map) {
    window.WORD_OVR = {};
    window.WORD_OVR_TRICK = {};
    if (!map || !window.WORDS) return;
    window.WORDS.forEach(function (w) {
      var o = map[w.name];
      if (!o) return;
      if (o.pos != null) w.pos = o.pos;
      if (o.meaning != null) w.meaning = o.meaning;
      if (o.phonetic != null) w.phonetic = o.phonetic;
      if (o.usphone != null) w.usphone = o.usphone;
      if (o.ukphone != null) w.ukphone = o.ukphone;
      if (o.ex != null) w.ex = o.ex;
      window.WORD_OVR[w.name] = o;
      if (o.assoc || o.root || o.homo || o.ex) {
        window.WORD_OVR_TRICK[w.name] = {
          assoc: o.assoc || '', root: o.root || '', homo: o.homo || '', ex: o.ex || ''
        };
      }
    });
  }

  // 通用 RPC 调用（后台管理用，受 RLS + SECURITY DEFINER 守卫保护）
  // 注意：Supabase 的 sb.rpc 返回 { data, error } 包装对象，
  // 这里统一解包为 data，出错时 reject（避免后台把包装对象当数组用导致 .reduce is not a function）。
  function rpc(name, params) {
    if (!sb) return Promise.reject(new Error('未初始化'));
    return sb.rpc(name, params || {}).then(function (r) {
      if (r && r.error) return Promise.reject(r.error);
      return r ? r.data : null;
    });
  }
  // 单词覆盖的读取 / 保存 / 删除（写操作受 word_overrides RLS 限制：仅管理员）
  function getWordOverride(name) {
    if (!sb) return Promise.resolve(null);
    return sb.from('word_overrides').select('*').eq('word', name).maybeSingle()
      .then(function (r) { return r.error ? null : r.data; });
  }
  function saveWordOverride(o) {
    if (!sb || !user) return Promise.reject(new Error('请先登录'));
    o = Object.assign({}, o, { updated_by: user.id });
    return sb.from('word_overrides').upsert(o).then(function (r) {
      if (r.error) throw r.error; return r.data;
    });
  }
  function deleteWordOverride(name) {
    if (!sb) return Promise.reject(new Error('未初始化'));
    return sb.from('word_overrides').delete().eq('word', name).then(function (r) {
      if (r.error) throw r.error;
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- 暴露接口 & 自启动 ----------
  window.Sync = {
    init: init, onAuth: onAuth, signUp: signUp, verifyOtp: verifyOtp, signIn: signIn,
    signOut: signOut, currentUser: currentUser, loadAll: loadAll,
    saveSR: saveSR, saveTricks: saveTricks, resetAll: resetAll,
    changePassword: changePassword, usernameAvailable: usernameAvailable,
    amIAdmin: amIAdmin, loadWordOverrides: loadWordOverrides, listWordOverrides: listWordOverrides, applyWordOverrides: applyWordOverrides,
    rpc: rpc, getWordOverride: getWordOverride, saveWordOverride: saveWordOverride, deleteWordOverride: deleteWordOverride,
    onStudy: onStudy, streak: computeStreak
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
