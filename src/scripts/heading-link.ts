/**
 * 文章标题的「复制本节链接」。
 *
 * 为什么需要：
 *   文章正文的 h2/h3 由 Astro 自动生成 id（如 #三指针卡顿漂移定位不准），
 *   但页面上没有任何入口能让读者拿到这个链接。想分享"那一节"时，
 *   只能自己从地址栏拼。加一个按钮，点一下就把该节的可分享 URL 复制走。
 *
 * 实现要点：
 *  1. 按钮运行时插入，不写进 Markdown —— 作者不需要为每个标题加标记，
 *     与 copy-code.ts 的做法一致。
 *  2. 只在文章正文（.prose）内的标题上插入，不碰导航、页脚等其他标题。
 *  3. 点击后同时把地址栏 hash 改掉（用 replaceState），
 *     这样即使复制失败，读者也能直接从地址栏复制。
 *  4. 复制成功给一个短暂的状态反馈，否则用户不知道有没有生效。
 *  5. 触屏设备没有 hover，所以不能只靠 :hover 显示 ——
 *     默认给较低不透明度，hover/focus 时提高，触屏上始终可点。
 *
 * 为什么抽成独立常量：.astro 的 <script> 里写含模板字符串的 JS 会踩坑，
 * 必须配合 set:html（详见 site-stats.ts 的说明），项目里统一这么做。
 */
export const HEADING_LINK_SCRIPT = `
(function () {
  var FLASH_MS = 1400;

  /* 复制文本：优先异步 Clipboard API，失败回退 execCommand。
     非安全上下文（局域网 http）下 Clipboard API 不可用，必须有回退。 */
  function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(
          function () { return true; },
          function () { return legacyCopy(text); }
        );
      }
    } catch (e) { /* 落到回退 */ }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function init() {
    var prose = document.querySelector('.prose');
    if (!prose) return;

    var headings = prose.querySelectorAll('h2[id], h3[id], h4[id]');
    if (headings.length === 0) return;

    Array.prototype.forEach.call(headings, function (h) {
      /* 已经有按钮就不重复插（例如视图转场导致脚本重跑） */
      if (h.querySelector('.heading-link')) return;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'heading-link';
      btn.setAttribute('aria-label', '复制这一节的链接');
      btn.title = '复制这一节的链接';
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/>' +
        '<path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>' +
        '</svg>';

      btn.addEventListener('click', function () {
        var url = location.origin + location.pathname + '#' + encodeURIComponent(h.id);
        /* 先改 hash：即使复制失败，地址栏里也已经是可分享的链接 */
        try { history.replaceState(null, '', '#' + encodeURIComponent(h.id)); } catch (e) { /* 忽略 */ }

        copyText(url).then(function (ok) {
          btn.classList.add(ok ? 'is-done' : 'is-failed');
          var prev = btn.getAttribute('title');
          btn.setAttribute('title', ok ? '已复制' : '复制失败，请从地址栏复制');
          setTimeout(function () {
            btn.classList.remove('is-done', 'is-failed');
            btn.setAttribute('title', prev || '复制这一节的链接');
          }, FLASH_MS);
        });
      });

      h.appendChild(btn);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;

/**
 * 标题链接按钮的样式。
 *
 * 为什么放在 Layout 而不是组件的 <style> 里：
 * 这段脚本是全站注入的，对应的样式也应当只出现一次。
 */
export const HEADING_LINK_STYLE = `
.heading-link {
  margin-inline-start: 0.45em;
  padding: 0.15em;
  border: none;
  background: none;
  color: var(--text-faint);
  cursor: pointer;
  vertical-align: middle;
  border-radius: var(--radius-sm);
  /* 触屏没有 hover，所以不能默认 display:none —— 始终可点，只是不显眼 */
  opacity: 0.35;
  transition: opacity 0.15s ease, color 0.15s ease;
}

.heading-link svg {
  width: 0.72em;
  height: 0.72em;
  display: block;
}

.heading-link:hover,
.heading-link:focus-visible {
  opacity: 1;
  color: var(--accent);
}

.heading-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.heading-link.is-done {
  opacity: 1;
  color: #16a34a;
}

.heading-link.is-failed {
  opacity: 1;
  color: #dc2626;
}
`;
