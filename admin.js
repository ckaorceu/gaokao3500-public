// admin.js — 站长后台（数据看板 / 用户管理 / 内容管理）v2
// 依赖 sync.js 暴露的 window.Sync（rpc / getWordOverride / saveWordOverride / deleteWordOverride / listWordOverrides / amIAdmin / currentUser）
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const state = {
    tab: 'dash',
    users: [], userTotal: 0, userOffset: 0, userLimit: 50, userSearch: '',
    contentSearch: '', onlyOverrides: false, overrides: [], overrideSet: new Set(),
    editWord: null, userLoading: false, filter: 'all', trickStatus: 'pending'
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function fmtDate(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d)) return '—';
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function fmtDateTime(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d)) return '—';
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // ---------- 轻提示 toast ----------
  function toast(msg, type) {
    const wrap = $('#toastWrap');
    if (!wrap) return;
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 2400);
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function csvCell(v) {
    v = v == null ? '' : String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  // ---------- 入口：身份校验 ----------
  function init() {
    if (!window.Sync) { showGate('同步模块未加载，请刷新重试。'); return; }
    Sync.init();
    Sync.onAuth(function (u) {
      if (!u) { showGate('请先<a href="index.html">登录</a>后再访问后台。'); return; }
      Sync.amIAdmin().then(function (ok) {
        if (!ok) {
          showGate('当前账号（' + escapeHtml(u.email || '') + '）无后台权限。请用管理员账号登录，或联系站长开通。', u);
          return;
        }
        $('#gate').style.display = 'none';
        $('#adminPanel').style.display = '';
        const cu = Sync.currentUser();
        $('#adminName').textContent = (cu && cu.username) || u.email || '管理员';
        bindTabs();
        switchTab('dash');
      }).catch(function (e) {
        showGate('校验管理员身份失败：' + (e && e.message ? e.message : e), u);
      });
    });
  }

  function showGate(msg, u) {
    $('#adminPanel').style.display = 'none';
    const g = $('#gate');
    g.style.display = '';
    g.innerHTML = '<div class="gate-box"><p>🔒 ' + msg + '</p>' +
      '<p><a class="auth-btn primary" href="index.html">返回首页</a></p></div>';
  }

  function bindTabs() {
    $$('.admin-tab').forEach(b => {
      if (b._bound) return;
      b._bound = true;
      b.onclick = () => switchTab(b.dataset.tab);
    });
    const prev = $('#userPrev'), next = $('#userNext');
    if (prev && !prev._bound) {
      prev._bound = true;
      prev.onclick = () => { if (state.userOffset >= state.userLimit) { state.userOffset -= state.userLimit; loadUsers(); } };
    }
    if (next && !next._bound) {
      next._bound = true;
      next.onclick = () => { if (state.userOffset + state.users.length < state.userTotal) { state.userOffset += state.userLimit; loadUsers(); } };
    }
  }

  function switchTab(tab) {
    state.tab = tab;
    $$('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('#tabDash').style.display = tab === 'dash' ? '' : 'none';
    $('#tabUsers').style.display = tab === 'users' ? '' : 'none';
    $('#tabContent').style.display = tab === 'content' ? '' : 'none';
    $('#tabAnalytics').style.display = tab === 'analytics' ? '' : 'none';
    $('#tabExport').style.display = tab === 'export' ? '' : 'none';
    $('#tabTricks').style.display = tab === 'tricks' ? '' : 'none';
    $('#tabOps').style.display = tab === 'ops' ? '' : 'none';
    if (tab === 'dash') loadDash();
    else if (tab === 'users') loadUsers();
    else if (tab === 'content') initContent();
    else if (tab === 'analytics') loadAnalytics();
    else if (tab === 'export') initExport();
    else if (tab === 'tricks') loadTricksMod();
    else if (tab === 'ops') loadOps();
  }

  // ---------- 数据看板 ----------
  function loadDash() {
    $('#dashCards').innerHTML = '<div class="skel-card skeleton"></div>'.repeat(7);
    $('#dashMastery').innerHTML = '<div class="skeleton" style="height:120px"></div>';
    $('#dashActive').innerHTML = '<div class="skeleton" style="height:140px"></div>';
    $('#dashEngage').innerHTML = '<div class="skeleton" style="height:90px"></div>';
    $('#dashStruggle').innerHTML = '<div class="skeleton" style="height:120px"></div>';

    Promise.all([
      Sync.rpc('admin_overview'),
      Sync.rpc('admin_mastery_distribution'),
      Sync.rpc('admin_active_users', { p_days: 30 }),
      Sync.rpc('admin_top_struggling', { p_limit: 12 }),
      Sync.rpc('admin_engagement_distribution')
    ]).then(function (r) {
      renderDash(r[0] || {}, r[1] || [], r[2] || [], r[3] || [], r[4] || []);
    }).catch(function (e) {
      const msg = '加载失败：' + escapeHtml(e && e.message ? e.message : e);
      $('#dashCards').innerHTML = '<div class="empty" style="grid-column:1/-1">' + msg +
        ' <button class="auth-btn" onclick="window.__reloadDash()">重试</button></div>';
      $('#dashMastery').innerHTML = $('#dashActive').innerHTML = $('#dashEngage').innerHTML = $('#dashStruggle').innerHTML = '';
    });
  }
  window.__reloadDash = loadDash;

  function renderDash(ov, dist, active, struggle, engage) {
    // 概览卡片
    const cards = [
      ['注册用户数', ov.users != null ? ov.users : '—'],
      ['词库词条', window.WORDS ? window.WORDS.length : '—'],
      ['学习进度条数', ov.progress_rows != null ? ov.progress_rows : '—'],
      ['用户巧记数', ov.tricks != null ? ov.tricks : '—'],
      ['覆盖词条', ov.overrides != null ? ov.overrides : '—'],
      ['近 7 日活跃', ov.active_7d != null ? ov.active_7d : '—'],
      ['近 30 日活跃', ov.active_30d != null ? ov.active_30d : '—']
    ];
    $('#dashCards').innerHTML = cards.map(c =>
      '<div class="card"><div class="card-num">' + c[1] + '</div><div class="card-label">' + c[0] + '</div></div>'
    ).join('');

    // 掌握度分布
    if (!dist.length) {
      $('#dashMastery').innerHTML = '<div class="empty">暂无学习数据</div>';
    } else {
      const maxC = dist.reduce((m, d) => Math.max(m, d.cnt || 0), 1) || 1;
      const labels = { 0: '未学', 1: 'L1', 2: 'L2', 3: 'L3', 4: 'L4' };
      const distMap = {};
      dist.forEach(function (d) {
        const k = Math.min(d.level || 0, 4);   // 旧数据 L5 收敛到 L4，与前端 4 级体系一致
        distMap[k] = (distMap[k] || 0) + (d.cnt || 0);
      });
      let bars = '';
      for (let lv = 0; lv <= 4; lv++) {
        const cnt = distMap[lv] || 0;
        const pct = maxC ? (cnt / maxC * 100) : 0;
        bars += '<div class="bar-row"><span class="bar-name">' + (labels[lv] || ('L' + lv)) + '</span>' +
          '<div class="bar-track"><div class="bar-fill2" style="width:' + pct + '%"></div></div>' +
          '<span class="bar-val">' + cnt + '</span></div>';
      }
      $('#dashMastery').innerHTML = bars;
    }

    // 每日活跃 DAU / WAU
    if (!active.length) {
      $('#dashActive').innerHTML = '<div class="empty">暂无活跃数据</div>';
    } else {
      const max = Math.max(1, ...active.map(d => Math.max(d.dau || 0, d.wau || 0)));
      $('#dashActive').innerHTML = active.map(d => {
        const dau = d.dau || 0, wau = d.wau || 0;
        const dh = Math.round(dau / max * 100), wh = Math.round(wau / max * 100);
        return '<div class="active-day" title="' + d.day + '：DAU ' + dau + ' / WAU ' + wau + '">' +
          '<div class="b wau" style="height:' + wh + '%"></div>' +
          '<div class="b dau" style="height:' + dh + '%"></div></div>';
      }).join('');
    }

    // 学习量分布
    if (!engage.length) {
      $('#dashEngage').innerHTML = '<div class="empty">暂无数据</div>';
    } else {
      const maxE = engage.reduce((m, d) => Math.max(m, d.cnt || 0), 1) || 1;
      $('#dashEngage').innerHTML = engage.map(d => {
        const cnt = d.cnt || 0;
        const pct = maxE ? (cnt / maxE * 100) : 0;
        return '<div class="bar-row"><span class="bar-name" style="width:120px">' + escapeHtml(d.label) + '</span>' +
          '<div class="bar-track"><div class="bar-fill2" style="width:' + pct + '%"></div></div>' +
          '<span class="bar-val">' + cnt + '</span></div>';
      }).join('');
    }

    // 薄弱词 Top
    if (!struggle.length) {
      $('#dashStruggle').innerHTML = '<div class="empty">暂无薄弱词（或用户均掌握良好 🎉）</div>';
    } else {
      $('#dashStruggle').innerHTML = struggle.map(s =>
        '<div class="struggle-item"><span class="w">' + escapeHtml(s.word) + '</span>' +
        '<span class="cnt">薄弱人次 ' + (s.strugglers || 0) + ' · 平均等级 ' + (s.avg_l != null ? s.avg_l : '—') + '</span></div>'
      ).join('');
    }
  }

  // ---------- 用户管理 ----------
  function loadUsers() {
    if (state.userLoading) return;
    state.userLoading = true;
    $('#userTable').innerHTML = '<tr><td colspan="6" class="empty">加载中…</td></tr>';
    Sync.rpc('admin_user_count').then(function (t) { state.userTotal = t || 0; })
      .catch(function () { state.userTotal = 0; })
      .then(function () {
        return Sync.rpc('admin_list_users', { p_limit: state.userLimit, p_offset: state.userOffset, p_search: state.userSearch, p_filter: state.filter });
      })
      .then(function (rows) {
        state.users = rows || [];
        renderUsers();
      })
      .catch(function (e) {
        $('#userTable').innerHTML = '<tr><td colspan="6" class="empty">加载失败：' + escapeHtml(e.message || e) + '</td></tr>';
      })
      .then(function () { state.userLoading = false; });
  }

  function renderUsers() {
    const rows = state.users;
    if (!rows.length) {
      $('#userTable').innerHTML = '<tr><td colspan="6" class="empty">没有匹配的用户</td></tr>';
    } else {
      $('#userTable').innerHTML = rows.map(function (u) {
        const uid = u.id;
        return '<tr>' +
          '<td>' + escapeHtml(u.email || '(无邮箱)') + '</td>' +
          '<td>' + escapeHtml(u.username || '') + '</td>' +
          '<td>' + fmtDate(u.created_at) + '</td>' +
          '<td>' + (u.last_sign_in_at ? fmtDate(u.last_sign_in_at) : '—') + '</td>' +
          '<td>' + (u.is_admin ? '<span class="badge ok">管理员</span>' : '<span class="badge">普通</span>') + '</td>' +
          '<td class="row-actions">' +
            '<button class="auth-btn" data-act="detail" data-uid="' + uid + '">详情</button> ' +
            '<button class="auth-btn" data-act="reset" data-uid="' + uid + '" data-email="' + escapeHtml(u.email || '') + '">重置进度</button> ' +
            '<button class="auth-btn" data-act="' + (u.is_admin ? 'demote' : 'promote') + '" data-uid="' + uid + '">' + (u.is_admin ? '取消管理员' : '设为管理员') + '</button> ' +
            '<button class="auth-btn danger" data-act="del" data-uid="' + uid + '" data-email="' + escapeHtml(u.email || '') + '">删除</button> ' +
          '</td></tr>';
      }).join('');
    }
    const from = state.userOffset + 1, to = state.userOffset + rows.length;
    $('#userPageInfo').textContent = '第 ' + (rows.length ? from : 0) + '-' + to + ' 条 / 共 ' + state.userTotal + ' 人';
    $('#userPrev').disabled = state.userOffset <= 0;
    $('#userNext').disabled = (state.userOffset + rows.length) >= state.userTotal;

    $$('#userTable button[data-act]').forEach(function (b) {
      b.onclick = function () {
        const uid = b.dataset.uid, act = b.dataset.act;
        if (act === 'detail') { openUserDetail(uid); return; }
        if (act === 'reset') {
          if (confirm('确定重置用户「' + (b.dataset.email || uid) + '」的全部学习进度与巧记？')) {
            Sync.rpc('admin_reset_user', { p_uid: uid })
              .then(function () { toast('已重置该用户进度', 'ok'); loadUsers(); })
              .catch(function (e) { toast('失败：' + (e.message || e), 'err'); });
          }
        } else if (act === 'promote') {
          Sync.rpc('admin_set_admin', { p_uid: uid, p_flag: true })
            .then(function () { toast('已设为管理员', 'ok'); loadUsers(); })
            .catch(function (e) { toast('失败：' + (e.message || e), 'err'); });
        } else if (act === 'demote') {
          if (confirm('取消该用户的管理员权限？')) {
            Sync.rpc('admin_set_admin', { p_uid: uid, p_flag: false })
              .then(function () { toast('已取消管理员', 'ok'); loadUsers(); })
              .catch(function (e) { toast('失败：' + (e.message || e), 'err'); });
          }
        } else if (act === 'del') {
          if (confirm('永久删除用户「' + (b.dataset.email || uid) + '」及其全部学习数据？此操作不可恢复！')) {
            Sync.rpc('admin_delete_user', { p_uid: uid })
              .then(function () { toast('已删除用户', 'ok'); loadUsers(); })
              .catch(function (e) { toast('失败：' + (e.message || e), 'err'); });
          }
        }
      };
    });
  }

  function openUserDetail(uid) {
    Sync.rpc('admin_user_detail', { p_uid: uid }).then(function (d) {
      if (!d) { toast('未找到该用户详情', 'err'); return; }
      const modes = (d.sr_by_mode || []).map(m =>
        '<div class="bar-row"><span class="bar-name" style="width:90px">' + escapeHtml(m.mode) + '</span>' +
        '<div class="bar-track"><div class="bar-fill2" style="width:' + (m.cnt ? '100' : '0') + '%"></div></div>' +
        '<span class="bar-val">' + m.cnt + ' 条 · 均 ' + (m.avg_l != null ? m.avg_l : '—') + '</span></div>'
      ).join('') || '<div class="empty">尚未开始学习</div>';
      const box = document.createElement('div');
      box.className = 'auth-overlay';
      box.innerHTML = '<div class="auth-box modal-box">' +
        '<h3>用户详情</h3>' +
        '<div class="kv"><span>邮箱</span><b>' + escapeHtml(d.email || '—') + '</b></div>' +
        '<div class="kv"><span>用户名</span><b>' + escapeHtml(d.username || '—') + '</b></div>' +
        '<div class="kv"><span>角色</span><b>' + (d.is_admin ? '管理员' : '普通用户') + '</b></div>' +
        '<div class="kv"><span>注册时间</span><b>' + fmtDateTime(d.created_at) + '</b></div>' +
        '<div class="kv"><span>最近登录</span><b>' + (d.last_sign_in_at ? fmtDateTime(d.last_sign_in_at) : '—') + '</b></div>' +
        '<div class="kv"><span>最近活跃</span><b>' + (d.last_active ? fmtDateTime(d.last_active) : '—') + '</b></div>' +
        '<div class="kv"><span>进度总条数</span><b>' + (d.sr_total || 0) + '</b></div>' +
        '<div class="kv"><span>巧记数</span><b>' + (d.tricks || 0) + '</b></div>' +
        '<div class="kv"><span>贡献覆盖词</span><b>' + (d.overrides || 0) + '</b></div>' +
        '<h4 style="margin:14px 0 6px">各模式学习量</h4>' +
        '<div class="chart">' + modes + '</div>' +
        '<div class="dlg-actions"><button class="primary" id="dClose">关闭</button></div>' +
        '</div>';
      box.onclick = function (e) { if (e.target === box) box.remove(); };
      document.body.appendChild(box);
      box.querySelector('#dClose').onclick = () => box.remove();
    }).catch(function (e) { toast('加载详情失败：' + (e.message || e), 'err'); });
  }

  function exportUsers() {
    // 分页累加：Supabase 单次 select 上限 1000，超过则静默截断，故循环翻页
    const all = [];
    const PAGE = 1000;
    function page(off) {
      return Sync.rpc('admin_list_users', { p_limit: PAGE, p_offset: off, p_search: state.userSearch }).then(function (rows) {
        rows = rows || [];
        for (let i = 0; i < rows.length; i++) all.push(rows[i]);
        if (rows.length >= PAGE) return page(off + PAGE);
        return all;
      });
    }
    page(0).then(function (rows) {
      const head = ['邮箱', '用户名', '注册时间', '最近登录', '角色'];
      const lines = [head.join(',')];
      rows.forEach(u => lines.push([
        csvCell(u.email), csvCell(u.username), csvCell(fmtDateTime(u.created_at)),
        csvCell(u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : ''), u.is_admin ? '管理员' : '普通'
      ].join(',')));
      download('users_' + fmtDate(new Date()) + '.csv', '﻿' + lines.join('\n'), 'text/csv;charset=utf-8');
      const totalNote = (state.userTotal && rows.length !== state.userTotal) ? '（共 ' + state.userTotal + ' 人）' : '';
      toast('已导出 ' + rows.length + ' 个用户' + totalNote, 'ok');
    }).catch(function (e) { toast('导出失败：' + (e.message || e), 'err'); });
  }

  // ---------- 内容管理 ----------
  function initContent() {
    const sb = $('#wordSearch');
    if (!sb._bound) {
      sb._bound = true;
      let t;
      sb.addEventListener('input', function (e) {
        clearTimeout(t);
        t = setTimeout(function () {
          state.contentSearch = (e.target.value || '').trim().toLowerCase();
          renderWordList();
        }, 200);
      });
    }
    const ov = $('#onlyOverrides');
    if (!ov._bound) {
      ov._bound = true;
      ov.onchange = function () { state.onlyOverrides = ov.checked; renderWordList(); };
    }
    // 拉取覆盖集合（用于「只看覆盖词」过滤与标记）
    Sync.listWordOverrides().then(function (list) {
      state.overrides = list || [];
      state.overrideSet = new Set(state.overrides.map(o => o.word));
      renderWordList();
    }).catch(function () { renderWordList(); });
  }

  function renderWordList() {
    const kw = state.contentSearch;
    let list = window.WORDS || [];
    if (state.onlyOverrides) list = list.filter(w => state.overrideSet.has(w.name));
    if (kw) list = list.filter(w => w.name.toLowerCase().indexOf(kw) !== -1 || (w.meaning || '').toLowerCase().indexOf(kw) !== -1);
    const shown = list.slice(0, 200);
    if (!shown.length) {
      $('#wordListBox').innerHTML = '<div class="empty">无匹配单词</div>';
      return;
    }
    $('#wordListBox').innerHTML = shown.map(function (w) {
      const tag = state.overrideSet.has(w.name) ? ' <span class="badge ok">改</span>' : '';
      return '<button class="word-pick" data-w="' + escapeHtml(w.name) + '">' + escapeHtml(w.name) +
        tag + ' <span class="wm">' + escapeHtml((w.pos || '') + ' ' + (w.meaning || '')) + '</span></button>';
    }).join('');
    $$('#wordListBox button.word-pick').forEach(function (b) {
      b.onclick = function () { openWordEditor(b.dataset.w); };
    });
  }

  function openWordEditor(name) {
    state.editWord = name;
    const w = (window.WORDS || []).filter(x => x.name === name)[0] || {};
    Sync.getWordOverride(name).then(function (ov) {
      const o = ov || {};
      $('#edWord').textContent = name;
      $('#edPos').value = o.pos != null ? o.pos : (w.pos || '');
      $('#edMeaning').value = o.meaning != null ? o.meaning : (w.meaning || '');
      $('#edUsphone').value = o.usphone != null ? o.usphone : (w.usphone || '');
      $('#edUkphone').value = o.ukphone != null ? o.ukphone : (w.ukphone || '');
      $('#edAssoc').value = o.assoc || '';
      $('#edRoot').value = o.root || '';
      $('#edHomo').value = o.homo || '';
      $('#edEx').value = o.ex || '';
      const msg = $('#edMsg');
      msg.textContent = ov ? '当前为覆盖版本（已修改原始词库）' : '当前为原始词库，编辑保存后将生成覆盖';
      msg.className = 'auth-msg' + (ov ? ' ok' : '');
      $('#wordEditor').style.display = '';
    });
  }

  function saveWord() {
    const name = state.editWord; if (!name) return;
    const obj = {
      word: name,
      pos: $('#edPos').value.trim(),
      meaning: $('#edMeaning').value.trim(),
      usphone: $('#edUsphone').value.trim(),
      ukphone: $('#edUkphone').value.trim(),
      phonetic: null,
      assoc: $('#edAssoc').value.trim(),
      root: $('#edRoot').value.trim(),
      homo: $('#edHomo').value.trim(),
      ex: $('#edEx').value.trim()
    };
    const msg = $('#edMsg');
    msg.className = 'auth-msg'; msg.textContent = '保存中…';
    Sync.saveWordOverride(obj).then(function () {
      msg.className = 'auth-msg ok';
      msg.textContent = '已保存覆盖，全站（含未登录用户）立即生效';
    toast('已保存覆盖：' + name, 'ok');
    Sync.listWordOverrides().then(function (list) {
      state.overrides = list || [];
      state.overrideSet = new Set(state.overrides.map(o => o.word));
      renderWordList();
    });
    Sync.loadWordOverrides().then(Sync.applyWordOverrides).catch(function(){});
  }).catch(function (e) {
    msg.className = 'auth-msg err';
    msg.textContent = '保存失败：' + (e.message || e);
      toast('保存失败：' + (e.message || e), 'err');
    });
  }

  function restoreWord() {
    const name = state.editWord; if (!name) return;
    if (!confirm('恢复「' + name + '」为原始词库（删除覆盖）？')) return;
    const msg = $('#edMsg');
    Sync.deleteWordOverride(name).then(function () {
      msg.className = 'auth-msg ok'; msg.textContent = '已恢复原始词库';
    toast('已恢复原始：' + name, 'ok');
    openWordEditor(name);
    Sync.listWordOverrides().then(function (list) {
      state.overrides = list || [];
      state.overrideSet = new Set(state.overrides.map(o => o.word));
      renderWordList();
    });
    Sync.loadWordOverrides().then(Sync.applyWordOverrides).catch(function(){});
  }).catch(function (e) {
    msg.className = 'auth-msg err'; msg.textContent = '恢复失败：' + (e.message || e);
      toast('恢复失败：' + (e.message || e), 'err');
    });
  }

  function exportOverrides(format) {
    const list = state.overrides && state.overrides.length ? state.overrides : null;
    const finish = function (rows) {
      if (!rows.length) { toast('暂无可导出的覆盖词', 'err'); return; }
      if (format === 'json') {
        download('word_overrides_' + fmtDate(new Date()) + '.json', JSON.stringify(rows, null, 2), 'application/json');
      } else {
        const head = ['word', 'pos', 'meaning', 'usphone', 'ukphone', 'phonetic', 'assoc', 'root', 'homo', 'ex', 'updated_at'];
        const lines = [head.join(',')];
        rows.forEach(o => lines.push(head.map(h => csvCell(o[h])).join(',')));
        download('word_overrides_' + fmtDate(new Date()) + '.csv', '﻿' + lines.join('\n'), 'text/csv;charset=utf-8');
      }
      toast('已导出 ' + rows.length + ' 条覆盖词', 'ok');
    };
    if (list) finish(list);
    else Sync.listWordOverrides().then(finish).catch(function (e) { toast('导出失败：' + (e.message || e), 'err'); });
  }

  // ---------- 分析（运营分析增强） ----------
  function loadAnalytics() {
    $('#anCards').innerHTML = '<div class="skel-card skeleton"></div>'.repeat(4);
    $('#anRetention').innerHTML = '<div class="skeleton" style="height:120px"></div>';
    $('#anTrend').innerHTML = '<div class="skeleton" style="height:140px"></div>';
    $('#anHeat').innerHTML = '<div class="skeleton" style="height:140px"></div>';
    $('#anLeaders').innerHTML = '<div class="skeleton" style="height:140px"></div>';
    Promise.all([
      Sync.rpc('admin_overall_progress'),
      Sync.rpc('admin_retention', { p_weeks: 8 }),
      Sync.rpc('admin_new_users_trend', { p_days: 30 }),
      Sync.rpc('admin_study_hours'),
      Sync.rpc('admin_active_users', { p_days: 30 }),
      Sync.rpc('admin_streak_leaderboard', { p_limit: 15 }),
      Sync.rpc('admin_volume_leaderboard', { p_limit: 15 })
    ]).then(function (r) {
      renderAnalytics(r[0] || {}, r[1] || [], r[2] || [], r[3] || [], r[4] || [], r[5] || [], r[6] || []);
    }).catch(function (e) {
      const msg = '加载失败：' + escapeHtml(e && e.message ? e.message : e);
      $('#anCards').innerHTML = '<div class="empty" style="grid-column:1/-1">' + msg +
        ' <button class="auth-btn" onclick="window.__reloadAnalytics()">重试</button></div>';
      $('#anRetention').innerHTML = $('#anTrend').innerHTML = $('#anHeat').innerHTML = $('#anLeaders').innerHTML = '';
    });
  }
  window.__reloadAnalytics = loadAnalytics;

  function renderAnalytics(op, retention, newUsers, hours, active, streaks, volumes) {
    const total = window.WORDS ? window.WORDS.length : 0;
    const covered = op.covered != null ? op.covered : 0, mastered = op.mastered != null ? op.mastered : 0;
    const covPct = total ? Math.round(covered / total * 100) : 0;
    const masPct = total ? Math.round(mastered / total * 100) : 0;
    const cards = [
      ['词库词条', total || '—'],
      ['已覆盖词数', covered],
      ['已掌握词数', mastered],
      ['学习时段峰值', hours.length ? (hours.reduce(function (m, h) { return h.cnt > m.cnt ? h : m; }, hours[0]).hour + ':00') : '—']
    ];
    $('#anCards').innerHTML =
      '<div class="card"><div class="card-num">' + covPct + '%</div><div class="card-label">词书覆盖度<small>' + covered + '/' + total + '</small></div></div>' +
      '<div class="card"><div class="card-num">' + masPct + '%</div><div class="card-label">已掌握(L4)<small>' + mastered + '/' + total + '</small></div></div>' +
      cards.slice(2).map(function (c) {
        return '<div class="card"><div class="card-num">' + c[1] + '</div><div class="card-label">' + c[0] + '</div></div>';
      }).join('');

    // 留存曲线（按注册周）
    if (!retention.length) $('#anRetention').innerHTML = '<div class="empty">暂无注册数据</div>';
    else {
      const maxS = Math.max(1, ...retention.map(function (d) { return d.signups || 0; }));
      $('#anRetention').innerHTML = retention.map(function (d) {
        const sign = d.signups || 0, ret = d.retained || 0;
        const pct = maxS ? (sign / maxS * 100) : 0;
        const rp = sign ? Math.round(ret / sign * 100) : 0;
        return '<div class="bar-row"><span class="bar-name" style="width:92px">' + escapeHtml(String(d.week)) + '</span>' +
          '<div class="bar-track"><div class="bar-fill2" style="width:' + pct + '%"></div></div>' +
          '<span class="bar-val">注册 ' + sign + ' · 留存 ' + ret + ' (' + rp + '%)</span></div>';
      }).join('');
    }

    // 趋势：DAU/WAU + 新注册
    if (!active.length && !newUsers.length) $('#anTrend').innerHTML = '<div class="empty">暂无趋势数据</div>';
    else {
      const maxD = Math.max(1, ...active.map(function (d) { return Math.max(d.dau || 0, d.wau || 0); }));
      const maxN = Math.max(1, ...newUsers.map(function (d) { return d.new_users || 0; }));
      let html = '<div class="sub-h">日活 / 近 7 日活跃（按天）</div><div class="active-chart">';
      html += active.map(function (d) {
        const dau = d.dau || 0, wau = d.wau || 0;
        const dh = Math.round(dau / maxD * 100), wh = Math.round(wau / maxD * 100);
        return '<div class="active-day" title="' + d.day + '：DAU ' + dau + ' / WAU ' + wau + '">' +
          '<div class="b wau" style="height:' + wh + '%"></div>' +
          '<div class="b dau" style="height:' + dh + '%"></div></div>';
      }).join('');
      html += '</div><div class="sub-h">每日新注册用户</div>';
      html += newUsers.map(function (d) {
        const v = d.new_users || 0, h = Math.round(v / maxN * 100);
        return '<div class="bar-row"><span class="bar-name" style="width:92px">' + escapeHtml(String(d.day)) + '</span>' +
          '<div class="bar-track"><div class="bar-fill2" style="width:' + h + '%"></div></div>' +
          '<span class="bar-val">' + v + '</span></div>';
      }).join('');
      $('#anTrend').innerHTML = html;
    }

    // 时段热力图（0-23 时）
    if (!hours.length) $('#anHeat').innerHTML = '<div class="empty">暂无学习记录</div>';
    else {
      const maxH = Math.max(1, ...hours.map(function (h) { return h.cnt || 0; }));
      $('#anHeat').innerHTML = '<div class="heat">' + hours.map(function (h) {
        const pct = maxH ? (h.cnt / maxH * 100) : 0;
        const cls = pct > 66 ? ' h3' : pct > 33 ? ' h2' : pct > 0 ? ' h1' : '';
        return '<div class="heat-cell' + cls + '" title="' + h.hour + ':00 · ' + h.cnt + ' 次"><span>' + h.hour + '</span></div>';
      }).join('') + '</div>';
    }

    // 排行榜
    const lb = function (rows, valKey, valUnit) {
      if (!rows.length) return '<div class="empty">暂无数据</div>';
      return rows.map(function (r, i) {
        return '<div class="lb-row"><span class="lb-rank">' + (i + 1) + '</span>' +
          '<span class="lb-name">' + escapeHtml(r.username || '(匿名)') + '</span>' +
          '<span class="lb-val">' + (r[valKey] || 0) + valUnit + '</span></div>';
      }).join('');
    };
    $('#anLeaders').innerHTML = '<div class="lb-col"><h4>🔥 连续打卡榜</h4>' + lb(streaks, 'streak', ' 天') + '</div>' +
      '<div class="lb-col"><h4>📚 学习量榜</h4>' + lb(volumes, 'cnt', ' 条') + '</div>';
  }

  // ---------- 导出（学习数据） ----------
  function initExport() { /* 静态面板，按钮在 bindContent 绑定 */ }

  function exportProgress() {
    const all = [];
    const PAGE = 1000;
    function page(off) {
      return Sync.rpc('admin_list_progress', { p_limit: PAGE, p_offset: off }).then(function (rows) {
        rows = rows || [];
        for (let i = 0; i < rows.length; i++) all.push(rows[i]);
        if (rows.length >= PAGE) return page(off + PAGE);
        return all;
      });
    }
    page(0).then(function (rows) {
      if (!rows.length) { toast('暂无可导出的进度数据', 'err'); return; }
      const head = ['邮箱', '用户名', '单词', '模式', '等级', '更新时间'];
      const lines = [head.join(',')];
      rows.forEach(function (r) {
        lines.push([csvCell(r.email), csvCell(r.username), csvCell(r.word), csvCell(r.mode), r.level, csvCell(r.updated_at ? fmtDateTime(r.updated_at) : '')].join(','));
      });
      download('sr_progress_' + fmtDate(new Date()) + '.csv', '﻿' + lines.join('\n'), 'text/csv;charset=utf-8');
      toast('已导出 ' + rows.length + ' 条进度', 'ok');
    }).catch(function (e) { toast('导出失败：' + (e.message || e), 'err'); });
  }

  function exportTricks() {
    const all = [];
    const PAGE = 1000;
    function page(off) {
      return Sync.rpc('admin_list_tricks_export', { p_limit: PAGE, p_offset: off }).then(function (rows) {
        rows = rows || [];
        for (let i = 0; i < rows.length; i++) all.push(rows[i]);
        if (rows.length >= PAGE) return page(off + PAGE);
        return all;
      });
    }
    page(0).then(function (rows) {
      if (!rows.length) { toast('暂无可导出的巧记', 'err'); return; }
      const head = ['邮箱', '用户名', '单词', '联想', '词根', '谐音', '例句', '状态', '更新时间'];
      const lines = [head.join(',')];
      rows.forEach(function (r) {
        lines.push([csvCell(r.email), csvCell(r.username), csvCell(r.word), csvCell(r.assoc), csvCell(r.root), csvCell(r.homo), csvCell(r.ex), csvCell(r.status), csvCell(r.updated_at ? fmtDateTime(r.updated_at) : '')].join(','));
      });
      download('tricks_' + fmtDate(new Date()) + '.csv', '﻿' + lines.join('\n'), 'text/csv;charset=utf-8');
      toast('已导出 ' + rows.length + ' 条巧记', 'ok');
    }).catch(function (e) { toast('导出失败：' + (e.message || e), 'err'); });
  }

  // ---------- 巧记内容审核 ----------
  function loadTricksMod() {
    const status = state.trickStatus || 'pending';
    $('#trickList').innerHTML = '<div class="empty">加载中…</div>';
    Sync.rpc('admin_list_tricks', { p_status: status, p_limit: 50, p_offset: 0 }).then(function (rows) {
      renderTricksMod(rows || []);
    }).catch(function (e) {
      $('#trickList').innerHTML = '<div class="empty">加载失败：' + escapeHtml(e.message || e) + '</div>';
    });
  }

  function renderTricksMod(rows) {
    if (!rows.length) { $('#trickList').innerHTML = '<div class="empty">该状态下暂无巧记</div>'; return; }
    $('#trickList').innerHTML = rows.map(function (t) {
      const txt = [t.assoc, t.root, t.homo, t.ex].filter(Boolean).map(function (s) { return escapeHtml(s); }).join(' ｜ ');
      return '<div class="trick-card" data-id="' + t.id + '">' +
        '<div class="tc-head"><b>' + escapeHtml(t.word) + '</b> <span class="badge">' + escapeHtml(t.status) + '</span>' +
        '<span class="tc-meta">' + escapeHtml(t.username || t.email || '') + ' · ' + fmtDate(t.updated_at) + '</span></div>' +
        '<div class="tc-body">' + (txt || '<span class="muted">（空）</span>') + '</div>' +
        '<div class="tc-actions">' +
          '<button class="auth-btn ok" data-act="approve" data-id="' + t.id + '">通过</button> ' +
          '<button class="auth-btn danger" data-act="reject" data-id="' + t.id + '">驳回</button>' +
        '</div></div>';
    }).join('');
    $$('#trickList button[data-act]').forEach(function (b) {
      b.onclick = function () {
        const id = parseInt(b.dataset.id, 10);
        const st = b.dataset.act === 'approve' ? 'approved' : 'rejected';
        Sync.rpc('admin_moderate_trick', { p_id: id, p_status: st }).then(function () {
          toast('已' + (st === 'approved' ? '通过' : '驳回'), 'ok'); loadTricksMod();
        }).catch(function (e) { toast('操作失败：' + (e.message || e), 'err'); });
      };
    });
  }

  // ---------- 运营（公告 + 功能开关） ----------
  function loadOps() { loadAnnouncements(); loadFlags(); }

  function loadAnnouncements() {
    Sync.rpc('admin_list_announcements').then(function (rows) {
      if (!rows || !rows.length) { $('#annList').innerHTML = '<div class="empty">暂无公告</div>'; return; }
      $('#annList').innerHTML = rows.map(function (a) {
        return '<div class="ann-card" data-id="' + a.id + '">' +
          '<div class="ac-head"><b>' + escapeHtml(a.title) + '</b> ' +
          (a.active ? '<span class="badge ok">展示中</span>' : '<span class="badge">已隐藏</span>') +
          '<span class="ac-meta">' + fmtDateTime(a.created_at) + (a.expires_at ? ' · 至 ' + fmtDateTime(a.expires_at) : '') + '</span></div>' +
          '<div class="ac-body">' + escapeHtml(a.body) + '</div>' +
          '<div class="tc-actions"><button class="auth-btn danger" data-del="' + a.id + '">删除</button></div></div>';
      }).join('');
      $$('#annList button[data-del]').forEach(function (b) {
        b.onclick = function () {
          if (confirm('确定删除该公告？')) {
            Sync.rpc('admin_delete_announcement', { p_id: parseInt(b.dataset.del, 10) })
              .then(function () { toast('已删除', 'ok'); loadAnnouncements(); })
              .catch(function (e) { toast('失败：' + (e.message || e), 'err'); });
          }
        };
      });
    }).catch(function (e) { $('#annList').innerHTML = '<div class="empty">加载失败：' + escapeHtml(e.message || e) + '</div>'; });
  }

  function createAnnouncement() {
    const title = $('#annTitle').value.trim();
    const body = $('#annBody').value.trim();
    if (!title || !body) { toast('标题与内容必填', 'err'); return; }
    const active = $('#annActive').checked;
    const exp = $('#annExpires').value ? new Date($('#annExpires').value).toISOString() : null;
    Sync.rpc('admin_create_announcement', { p_title: title, p_body: body, p_active: active, p_expires: exp })
      .then(function () { toast('已发布公告', 'ok'); $('#annTitle').value = ''; $('#annBody').value = ''; $('#annExpires').value = ''; loadAnnouncements(); })
      .catch(function (e) { toast('发布失败：' + (e.message || e), 'err'); });
  }

  function loadFlags() {
    Sync.rpc('admin_list_feature_flags').then(function (rows) {
      if (!rows || !rows.length) { $('#flagList').innerHTML = '<div class="empty">暂无开关</div>'; return; }
      // 按 key 前缀分组：content / learning / nav / security
      var groups = { content: '内容展示', learning: '学习增强', nav: '导航交互', security: '安全' };
      var order = ['content', 'learning', 'nav', 'security'];
      var map = {};
      rows.forEach(function (f) {
        var g = (f.key || '').split('.')[0];
        if (!map[g]) map[g] = [];
        map[g].push(f);
      });
      var html = '';
      order.forEach(function (g) {
        if (!map[g] || !map[g].length) return;
        html += '<div class="flag-group"><div class="flag-group-title">' + (groups[g] || g) + '</div>';
        html += map[g].map(function (f) {
          return '<label class="flag-row"><span><b>' + escapeHtml(f.label || f.key) + '</b><small>' + escapeHtml(f.key) + '</small></span>' +
            '<input type="checkbox" class="flag-toggle" data-key="' + escapeHtml(f.key) + '"' + (f.enabled ? ' checked' : '') + '></label>';
        }).join('');
        html += '</div>';
      });
      $('#flagList').innerHTML = html;
      $$('#flagList .flag-toggle').forEach(function (c) {
        c.onchange = function () {
          Sync.rpc('admin_set_feature_flag', { p_key: c.dataset.key, p_enabled: c.checked })
            .then(function () { toast('已' + (c.checked ? '开启' : '关闭') + '：' + c.dataset.key, 'ok'); })
            .catch(function (e) { toast('失败：' + (e.message || e), 'err'); c.checked = !c.checked; });
        };
      });
    }).catch(function (e) { $('#flagList').innerHTML = '<div class="empty">加载失败：' + escapeHtml(e.message || e) + '</div>'; });
  }

  // 绑定按钮（与 init 解耦，避免重复绑定）
  function bindContent() {
    const s = $('#edSave'), r = $('#edRestore');
    if (s && !s._bound) { s._bound = true; s.onclick = saveWord; }
    if (r && !r._bound) { r._bound = true; r.onclick = restoreWord; }
    const ej = $('#exportJson'), ec = $('#exportCsv');
    if (ej && !ej._bound) { ej._bound = true; ej.onclick = () => exportOverrides('json'); }
    if (ec && !ec._bound) { ec._bound = true; ec.onclick = () => exportOverrides('csv'); }
    const ue = $('#userExport');
    if (ue && !ue._bound) { ue._bound = true; ue.onclick = exportUsers; }
    const ep = $('#expProgress'), et = $('#expTricks');
    if (ep && !ep._bound) { ep._bound = true; ep.onclick = exportProgress; }
    if (et && !et._bound) { et._bound = true; et.onclick = exportTricks; }
    const tf = $('#trickFilter');
    if (tf && !tf._bound) { tf._bound = true; tf.onchange = function () { state.trickStatus = tf.value; loadTricksMod(); }; }
    const ac = $('#annCreate');
    if (ac && !ac._bound) { ac._bound = true; ac.onclick = createAnnouncement; }
    const uf = $('#userFilter');
    if (uf && !uf._bound) { uf._bound = true; uf.onchange = function () { state.filter = uf.value; state.userOffset = 0; loadUsers(); }; }
    const us = $('#userSearch');
    if (us && !us._bound) {
      us._bound = true;
      let t;
      us.addEventListener('input', function (e) {
        clearTimeout(t);
        t = setTimeout(function () {
          state.userSearch = (e.target.value || '').trim();
          state.userOffset = 0;
          loadUsers();
        }, 300);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bindContent(); init(); });
  } else {
    bindContent(); init();
  }
})();
