/* 首屏防闪现（Feature Flags Boot）
 *
 * 问题：功能开关存在 Supabase 的 feature_flags 表里，要等网络回来才知道哪些模块被后台关闭了。
 *       在此之前 HTML 里的模块是可见的，于是「已关闭的功能」会先闪一下再消失。
 *
 * 做法：sync.js 每次拿到开关后会把结果缓存进 localStorage；本脚本在页面渲染前同步读取该缓存，
 *       直接注入一段 CSS 把已关闭的模块藏起来，从而消除闪现。
 *
 * 注意：
 *   1. 必须以「同步」方式在 <head> 中引入（不可加 defer / async），否则会晚于首次绘制，失去意义。
 *   2. 注入的样式带 !important，会压过 JS 的行内 style；因此 app.js / learn.js 在应用完开关后
 *      必须调用 window.__flagsBootDone() 把它移除，否则「后来被打开」的模块将无法显示。
 *   3. 首次访问（无缓存）不生效，属预期——此时以网络结果为准。
 */
(function () {
  var KEY = 'gaokao3500.flags.v1';
  var STYLE_ID = 'flagsBootStyle';

  // flag key -> 受控元素选择器
  // 需与 app.js 的 applyFeatureGates / learn.js 的 applyLearnGates 保持一致，新增开关时两处同步维护。
  var MAP = {
    'content.ukus_enabled': ['#accentToggle'],
    'content.tricks_enabled': ['#trickPanel'],
    'content.examples_enabled': ['.ex'],
    'content.realvoice_enabled': ['.speak'],
    'learning.quotes_enabled': ['#quote'],
    'learning.calendar_enabled': ['#calendarCard'],
    'learning.curve_enabled': ['#curveBtn'],
    'learning.marks_enabled': ['.marks-toggle-row', '#hardToggleCard', '#easyCard', '#masteredCard'],
    'nav.bookunits_enabled': ['#unitBlock'],
    'nav.sort_enabled': ['#sortRow', '#orderChips']
  };

  // 供 app.js / learn.js 在开关应用完毕后调用，移除临时样式，交还控制权给行内 style
  window.__flagsBootDone = function () {
    var el = document.getElementById(STYLE_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };

  try {
    var o = JSON.parse(localStorage.getItem(KEY) || 'null');
    var f = (o && o.v && typeof o.v === 'object') ? o.v : null;
    if (!f) return;                       // 无缓存（首访）：不做任何事

    var sel = [];
    for (var k in MAP) {
      if (Object.prototype.hasOwnProperty.call(MAP, k) && f[k] === false) {
        sel = sel.concat(MAP[k]);         // 只有显式 false 才隐藏，与 Sync.flagOn 语义一致
      }
    }
    if (!sel.length) return;

    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = sel.join(',') + '{display:none !important}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {
    /* localStorage 不可用（隐私模式等）时静默跳过，退化为原来的「等网络」行为 */
  }
})();
