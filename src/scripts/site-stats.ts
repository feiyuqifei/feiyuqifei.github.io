/**
 * 访客统计的「显隐」脚本。
 *
 * 职责：Vercount 的数字是异步拉回来的（实测约 7 秒），
 * 在拿到之前不能显示统计行 —— 否则脚本被广告拦截器拦掉时，
 * 页面上会永远留一个空白图标。
 *
 * 所以初始状态是 hidden，只在真的读到数字后才移除 hidden。
 *
 * 为什么抽成 TS 常量而不是写在 .astro 的 <script> 里：
 *   .astro 的 <script> 里写 JS 模板字符串会踩坑 ——
 *   必须配合 set:html 才会被当作可执行内容，否则
 *   {`...`} 会被原样输出成文本，浏览器拿到语法错误、整个脚本不执行。
 *   这个坑实际踩过：数字明明填进 DOM 了，行却始终不显示，
 *   而且控制台无报错，排查成本很高。
 *   抽成常量 + set:html 与项目里 COPY_BUTTON_SCRIPT 等保持一致。
 */
export const SITE_STATS_SCRIPT = `
(function () {
  var line = document.querySelector('[data-site-stats]');
  var uv = document.getElementById('busuanzi_value_site_uv');
  var pv = document.getElementById('busuanzi_value_site_pv');
  if (!line || !uv || !pv) return;

  /* 「有效数字」的判据：非空、非占位符、且含阿拉伯数字。
     逗号分隔的千分位（如 1,234）也满足。 */
  function ready(el) {
    var t = (el.textContent || '').trim();
    return t !== '' && t !== '\\u2014' && /[0-9]/.test(t);
  }

  function reveal() {
    if (ready(uv) || ready(pv)) {
      line.hidden = false;
      return true;
    }
    return false;
  }

  /* 先查一次：数字可能已经在 localStorage 缓存里、脚本已同步填好 */
  if (reveal()) return;

  /* 观察后续变化。数字写入的是文本节点，
     某些实现会直接替换子节点，所以 childList 与 characterData 都要听。 */
  var mo = new MutationObserver(function () {
    if (reveal()) mo.disconnect();
  });
  mo.observe(uv, { childList: true, characterData: true, subtree: true });
  mo.observe(pv, { childList: true, characterData: true, subtree: true });

  /* 兜底：25 秒还没数字就放弃。
     实测首次加载约 7 秒（无缓存时），给足余量但不无限挂着。 */
  setTimeout(function () { mo.disconnect(); }, 25000);
})();
`;
