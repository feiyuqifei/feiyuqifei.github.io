/**
 * 竞赛页的标签切换。
 *
 * 为什么用真实 tab 语义（role=tablist/tab/tabpanel）而不是单纯的显隐：
 *   键盘和读屏软件能正确识别，不用鼠标也能切换。
 *
 * 支持 hash 深链：/competitions/#records 直接打开「历史荣誉」，
 * 这样从别处引用某个视图时能直接跳过去。
 *
 * 为什么抽成独立常量：.astro 的 <script> 里写含模板字符串的 JS 会踩坑，
 * 必须配合 set:html（详见 site-stats.ts 的说明），项目里统一这么做。
 */
export const COMPETITION_TABS_SCRIPT = `
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.comp-tab'));
  if (tabs.length === 0) return;

  function panelOf(tab) {
    return document.getElementById(tab.getAttribute('aria-controls'));
  }

  function activate(tab, focus) {
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      /* 未选中的 tab 移出 Tab 键序列，符合 tab 组件惯例：
         一组标签只占一个 Tab 停靠点，之后用方向键切换 */
      t.tabIndex = on ? 0 : -1;
      var p = panelOf(t);
      if (p) p.hidden = !on;
    }
    if (focus) tab.focus();
  }

  /* 点击 */
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () {
      activate(this, false);
    });
  }

  /* 键盘：左右方向键切换，Home / End 跳首尾 */
  for (var j = 0; j < tabs.length; j++) {
    tabs[j].addEventListener('keydown', function (e) {
      var idx = tabs.indexOf(this);
      var next = -1;
      if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next >= 0) {
        e.preventDefault();
        activate(tabs[next], true);
      }
    });
  }

  /* hash 深链。
     接受三种写法，因为写链接的人不一定会去翻元素 id：
       #records        —— 短名（把 tab- 前缀去掉）
       #tab-records    —— 标签按钮的 id
       #panel-records  —— 面板的 id
     第一版只比对了后两种，而文档里写的是 #records，
     结果深链始终无效：脚本明明跑了、点击也正常，就是匹配不上。
     这类「逻辑正确但契约不对」的问题不会报错，只能靠测试发现。 */
  function fromHash() {
    var h = (location.hash || '').replace('#', '');
    if (!h) return;
    for (var k = 0; k < tabs.length; k++) {
      var t = tabs[k];
      var p = panelOf(t);
      var short = t.id.replace(/^tab-/, '');
      if (t.id === h || (p && p.id === h) || short === h) {
        activate(t, false);
        return;
      }
    }
  }
  fromHash();
  window.addEventListener('hashchange', fromHash);
})();
`;
