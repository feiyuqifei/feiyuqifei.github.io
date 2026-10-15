/**
 * 访客统计的「填数字 / 收空壳」脚本。
 *
 * 职责：Vercount 的数字是异步拉回来的（首次实测 4 到 7 秒）。
 * 这段脚本负责三件事：
 *   1. 数字到位后填进元素，并去掉加载态的呼吸动画
 *   2. 数字来之前保持占位显示，让读者看出是在加载而不是坏了
 *   3. 超时仍无数字（多半被广告拦截插件拦掉）就把整行淡出移除，
 *      不留下一个空壳
 *
 * 为什么不再是「默认 hidden，拿到数字才显示」：
 *   那样首次加载会有 4 到 7 秒完全空白，站长本人因此以为统计坏了，
 *   刷新一次（数字已进缓存）又正常。读者分不清「加载中」和「已损坏」，
 *   所以改成占位先出、失败再收。
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

  function settle(el) {
    el.classList.remove('is-loading');
  }

  function reveal() {
    var got = false;
    if (ready(uv)) { settle(uv); got = true; }
    if (ready(pv)) { settle(pv); got = true; }
    return got;
  }

  /* 超时收尾：还没数字就淡出移除整行，不留空壳 */
  function drop() {
    if (ready(uv) || ready(pv)) return;
    line.classList.add('is-dropping');
    setTimeout(function () {
      if (line.parentNode) line.parentNode.removeChild(line);
    }, 450);
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

  /* 15 秒后给结论。之所以比早先的 25 秒短：占位状态一直挂着
     同样是种打扰，而实测正常情况 4 到 7 秒就回来了。 */
  setTimeout(function () {
    mo.disconnect();
    if (ready(uv) || ready(pv)) return;

    var blocked = !document.querySelector('script[src*="vercount"]');
    console.warn(
      '[站点统计] 15 秒内没取到访客数字，已把统计行移除。\\n' +
        (blocked
          ? '原因：vercount.one/js 没被加载，通常是广告拦截插件（uBlock / AdGuard / 隐私盾）拦掉了。\\n' +
            '处理：把 feiyuqifei.github.io 加入白名单，或用无痕窗口打开验证。'
          : '原因：脚本已加载但数字没回来，可能是 vercount 服务暂时不可用。\\n' +
            '处理：过几分钟刷新；仍不行可访问 https://feiyuqifei.github.io/api-check/ 做完整自检。')
    );
    drop();
  }, 15000);

  /* 离开页面时不用管，MutationObserver 随文档销毁 */
})();
`;
