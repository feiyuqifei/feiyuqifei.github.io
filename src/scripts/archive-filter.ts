/**
 * 归档页的年份 / 板块筛选。
 *
 * 设计要点：
 *   1. **渐进增强**：筛选控件在 HTML 里是 hidden 的，由这段脚本显示出来。
 *      脚本没加载时（禁用 JS、被拦），读者看到的是完整归档，
 *      不会有"点了没反应"的按钮。内容永远可用，筛选只是加成。
 *   2. 条件之间是**与**关系：选「2026 年 + 工具分享」显示同时满足两者的。
 *      只选一个条件时另一个保持"全部"。
 *   3. 每次筛选后更新各按钮上的计数，让读者知道还能筛出多少 ——
 *      否则点进去发现是空的很挫败。
 *   4. 筛完没有结果时给一句明确提示，而不是留一片空白。
 *
 * 为什么抽成独立常量：.astro 的 <script> 里写含模板字符串的 JS 会踩坑，
 * 必须配合 set:html（详见 site-stats.ts 的说明），项目里统一这么做。
 */
export const ARCHIVE_FILTER_SCRIPT = `
(function () {
  var root = document.querySelector('[data-archive-filter]');
  var list = document.querySelector('[data-archive-list]');
  if (!root || !list) return;

  var items = Array.prototype.slice.call(list.querySelectorAll('li[data-year]'));
  var years = Array.prototype.slice.call(list.querySelectorAll('.archive-year'));
  var status = document.querySelector('[data-filter-status]');
  var emptyMsg = document.querySelector('[data-filter-empty]');
  if (items.length === 0) return;

  /* 脚本能跑才显示筛选栏 */
  root.hidden = false;

  var state = { year: 'all', section: 'all' };

  function chipsFor(group) {
    return Array.prototype.slice.call(
      root.querySelectorAll('[data-filter-group="' + group + '"] .af-chip')
    );
  }

  /* 某个取值在**当前另一个条件**下能筛出多少篇。
     用这个数更新计数，读者才知道每个按钮值不值得点。 */
  function countUnder(group, value) {
    var other = group === 'year' ? state.section : state.year;
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var okOther = other === 'all' || it.getAttribute('data-' + (group === 'year' ? 'section' : 'year')) === other;
      if (!okOther) continue;
      if (value === 'all' || it.getAttribute('data-' + group) === value) n++;
    }
    return n;
  }

  function refreshCounts() {
    ['year', 'section'].forEach(function (group) {
      chipsFor(group).forEach(function (chip) {
        var v = chip.getAttribute('data-filter-value');
        var n = countUnder(group, v);
        var span = chip.querySelector('.af-count');
        if (span) span.textContent = String(n);
        /* 计数为 0 的取值置灰并禁用 —— 点了也没结果，不如直接说明 */
        var disabled = n === 0 && v !== 'all';
        chip.disabled = disabled;
        chip.classList.toggle('is-empty', disabled);
      });
    });
  }

  function apply() {
    var shown = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var ok =
        (state.year === 'all' || it.getAttribute('data-year') === state.year) &&
        (state.section === 'all' || it.getAttribute('data-section') === state.section);
      it.hidden = !ok;
      if (ok) shown++;
    }

    /* 整组都没内容就隐藏该年份标题 */
    for (var j = 0; j < years.length; j++) {
      var y = years[j];
      var visible = y.querySelectorAll('li[data-year]:not([hidden])').length;
      y.hidden = visible === 0;
    }

    if (emptyMsg) emptyMsg.hidden = shown > 0;

    if (status) {
      var parts = [];
      if (state.year !== 'all') parts.push(state.year + ' 年');
      if (state.section !== 'all') {
        var chip = chipsFor('section').filter(function (c) {
          return c.getAttribute('data-filter-value') === state.section;
        })[0];
        if (chip) parts.push(chip.textContent.replace(/[0-9]+\\s*$/, '').trim());
      }
      status.textContent = parts.length
        ? '筛选：' + parts.join(' · ') + '　共 ' + shown + ' 篇'
        : '';
    }

    refreshCounts();
  }

  ['year', 'section'].forEach(function (group) {
    chipsFor(group).forEach(function (chip) {
      chip.addEventListener('click', function () {
        if (chip.disabled) return;
        state[group] = chip.getAttribute('data-filter-value');
        chipsFor(group).forEach(function (c) {
          c.classList.toggle('is-active', c === chip);
        });
        apply();
      });
    });
  });

  apply();
})();
`;
