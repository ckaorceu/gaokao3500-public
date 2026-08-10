/* 主题切换：日间 / 夜间
 * 同步执行（index/learn/admin 的 head 中无 defer 引入），在首屏渲染前应用，避免闪现。
 * 优先级：localStorage('theme') > 系统 prefers-color-scheme > 日间
 */
(function () {
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
  }
  function current() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }
  function syncBtn() {
    var b = document.getElementById('themeToggle');
    if (!b) return;
    var dark = current() === 'dark';
    b.textContent = dark ? '☀️' : '🌙';
    b.title = dark ? '切换到日间模式' : '切换到夜间模式';
    b.setAttribute('aria-label', b.title);
  }
  // 首屏应用
  try {
    var saved = localStorage.getItem('theme');
    var sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    apply(saved === 'dark' || saved === 'light' ? saved : (sysDark ? 'dark' : 'light'));
  } catch (e) {
    apply('light');
  }
  // 切换入口（供按钮 onclick 调用）
  window.toggleTheme = function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    syncBtn();
  };
  // 绑定按钮点击 + 初始化图标：DOM 解析后
  function init() {
    var b = document.getElementById('themeToggle');
    if (b && !b.dataset.bound) {
      b.addEventListener('click', window.toggleTheme);
      b.dataset.bound = '1';
    }
    syncBtn();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
