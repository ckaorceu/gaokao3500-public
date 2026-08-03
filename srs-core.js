/* srs-core.js — 纯逻辑核心（无 DOM / 网络依赖，可独立单测）
 * 同时挂 window（前端直接使用）与 module.exports（node 测试 require）。
 * 加载顺序：须在 learn.js / sync.js 之前引入（learn.html 已按此顺序）。
 */
(function (root) {
  'use strict';

  // 遗忘曲线间隔（天）：不会(L1)→1，模糊(L2)→2，一般(L3)→4，熟记(L4)→15
  function srsInterval(lv) {
    var map = { 1: 1, 2: 2, 3: 4, 4: 15 };
    var n = Number(lv);
    return map[n] || 1; // 越界 / 非正 / 非法值 一律防御回退 1 天
  }

  // 记忆记录标志：评级 ≥3 记为「记得(r=1)」，否则「遗忘(r=0)」
  function recallFlag(lv) {
    return Number(lv) >= 3 ? 1 : 0;
  }

  // 通用防抖（trailing）：wait 内多次调用只触发最后一次。
  // 注：sync.js 当前采用等价的 clearTimeout/setTimeout 内联写法；
  //     此处提供统一可复用版本，便于单测与未来替换。
  function makeDebounce(fn, wait) {
    var timer = null;
    return function () {
      var ctx = this, args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; fn.apply(ctx, args); }, wait);
    };
  }

  var api = { srsInterval: srsInterval, recallFlag: recallFlag, makeDebounce: makeDebounce };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.srsInterval = srsInterval;
    root.recallFlag = recallFlag;
    root.makeDebounce = makeDebounce;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
