/**
 * 滚动显现特效（scroll reveal）。
 *
 * 设计原则：**特效必须不能弄坏内容。**
 * 做法是"渐进增强"：
 *   - 默认状态下所有内容都是可见的（CSS 里没有隐藏）
 *   - 只有当 JS 确认可用时，才在 <html> 上加 .reveal-ready
 *   - 加了类之后，尚未进入视口的元素才被隐藏，然后逐个淡入
 *
 * 这样即使 JS 挂掉、或者脚本报错，读者照样能读到完整内容，
 * 只是没有动画效果。反过来做（CSS 先隐藏，JS 再显示）一旦出错
 * 就是整页空白，这个风险不值得冒。
 *
 * 另外：window.matchMedia 判断 prefers-reduced-motion，
 * 用户在系统里开了"减少动态效果"就完全不动画。
 */
export const SCROLL_REVEAL_SCRIPT = `
(function () {
  /* 尊重系统的"减少动态效果"设置 */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  if (!('IntersectionObserver' in window)) return;

  var root = document.documentElement;

  /* 先标记，让 CSS 生效；之后才批量注册观察器 */
  root.classList.add('reveal-ready');

  function init() {
    var targets = document.querySelectorAll(
      '.post-item, .section-card, .plan-item, .archive-year, .video-entry'
    );
    if (!targets.length) return;

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          el.classList.add('is-visible');
          /* 出现一次就够了，取消观察省开销 —— 长列表页尤其明显 */
          io.unobserve(el);
        });
      },
      {
        /* 底部提前 80px 触发，让元素"快到位时"就开始淡入，而不是到位才动 */
        rootMargin: '0px 0px -80px 0px',
        threshold: 0.01
      }
    );

    /* 首屏内的元素直接标记为可见，避免打开页面时闪一下 */
    var vh = window.innerHeight;
    Array.prototype.forEach.call(targets, function (el) {
      if (el.getBoundingClientRect().top < vh * 0.9) {
        el.classList.add('is-visible');
      } else {
        io.observe(el);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
