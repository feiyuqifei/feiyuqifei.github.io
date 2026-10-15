/**
 * 顶栏导航的滑动提示与当前项定位。
 *
 * 为什么需要：
 *   窄屏下顶栏放不下全部导航项，CSS 给 .nav 设了 overflow: auto
 *   让它可以横向滑动。但实测 393px 视口下 8 项里有 4 项（标签、归档、
 *   关于，以及主题切换按钮）落在可视区之外，而**没有任何提示告诉用户
 *   那里还有东西**。结果是这些页面在手机上等于不存在。
 *
 *   这个脚本做三件事：
 *     1. 在可滑动的一侧加渐隐阴影，表示"这边还有内容"
 *     2. 打开页面时把当前高亮项滚进视野 —— 否则从手机进 /archive/
 *        会看到高亮在屏幕外，用户不知道自己在哪
 *     3. 滚动 / 尺寸变化时重算提示
 *
 * 用 data-nav-scroll 属性传状态而不是直接改样式：
 *   状态与样式分离，CSS 里用属性选择器控制渐隐，
 *   以后改视觉不用动 JS。
 *
 * 为什么抽成独立常量：.astro 的 <script> 里写含模板字符串的 JS 会踩坑，
 * 必须配合 set:html（详见 site-stats.ts 的说明），项目里统一这么做。
 */
export const NAV_SCROLL_SCRIPT = `
(function () {
  var nav = document.querySelector('[data-nav]');
  if (!nav) return;

  /* 容差 2px：浏览器在缩放或小数宽度下 scrollLeft 会有零点几的误差，
     不留容差的话明明已经滑到头，右侧阴影却还在 */
  var TOL = 2;

  function update() {
    var max = nav.scrollWidth - nav.clientWidth;
    var x = nav.scrollLeft;

    /* 根本没有溢出：两侧都不提示 */
    if (max <= TOL) {
      nav.setAttribute('data-nav-scroll', 'none');
      return;
    }
    var atStart = x <= TOL;
    var atEnd = x >= max - TOL;
    /* 属性值的语义是「已经滚到哪一端」，CSS 据此决定渐隐哪一侧。
       ⚠️ 这里第一版写反了（atStart 返回 'end'），
       导致提示出现在没有内容的那一侧。改这一行前先想清楚语义。 */
    nav.setAttribute(
      'data-nav-scroll',
      atStart && atEnd ? 'none' : atStart ? 'start' : atEnd ? 'end' : 'both'
    );
  }

  /* 把当前高亮项滚进视野。
     用 inline: 'center' 而不是 'nearest'：nearest 在项目刚好卡在
    边缘时不滚动，视觉上仍然像在屏幕外。 */
  function revealActive() {
    var active = nav.querySelector('a[aria-current="page"]');
    if (active && !nav.contains(document.activeElement)) {
      try {
        active.scrollIntoView({ inline: 'center', block: 'nearest' });
      } catch (e) {
        /* 老浏览器不支持 options 对象，退回居中的等效做法 */
        nav.scrollLeft = active.offsetLeft - nav.clientWidth / 2 + active.offsetWidth / 2;
      }
    }
    update();
  }

  nav.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);

  /* 字体加载完或旋转屏幕后宽度会变，用 ResizeObserver 兜住 */
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(update).observe(nav);
  }

  /* 等一帧再算：此时布局与字体度量都稳定了 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', revealActive);
  } else {
    revealActive();
  }
})();
`;
