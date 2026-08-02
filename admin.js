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
    editWord: null, userLoading: false
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
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
    if (tab === 'dash') loadDash();
    else if (tab === 'users') loadUsers();
    else if (tab === 'content') initContent();
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
      const labels = { 0: '未学', 1: 'L1', 2: 'L2', 3: 'L3', 4: 'L4', 5: 'L5' };
      const distMap = {};
      dist.forEach(d => { distMap[d.level] = d.cnt; });
      let bars = '';
      for (let lv = 0; lv <= 5; lv++) {
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
        return Sync.rpc('admin_list_users', { p_limit: state.userLimit, p_offset: state.userOffset, p_search: state.userSearch });
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
            '<button class="auth-btn" data-act="' + (u.is_admin ? 'demote' : 'promote') + '" data-uid="' + uid + '">' + (u.is_admin ? '取消管理员' : '设为管理员') + '</button>' +
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
    Sync.rpc('admin_list_users', { p_limit: 5000, p_offset: 0, p_search: state.userSearch }).then(function (rows) {
      rows = rows || [];
      const head = ['邮箱', '用户名', '注册时间', '最近登录', '角色'];
      const lines = [head.join(',')];
      rows.forEach(u => lines.push([
        csvCell(u.email), csvCell(u.username), csvCell(fmtDateTime(u.created_at)),
        csvCell(u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : ''), u.is_admin ? '管理员' : '普通'
      ].join(',')));
      download('users_' + fmtDate(new Date()) + '.csv', '﻿' + lines.join('\n'), 'text/csv;charset=utf-8');
      toast('已导出 ' + rows.length + ' 个用户', 'ok');
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
