/**
 * 代码块「一键复制」按钮。
 *
 * 实现要点：
 *  1. 按钮不是写在 Markdown 里的，而是运行时扫描 .prose pre 动态插入的 ——
 *     这样 Markdown 源文件保持干净，作者不需要为每个代码块加任何标记。
 *  2. 只处理 <pre> 而不是 <code>：Shiki 输出结构是 pre > code，
 *     而行内代码只有 code 没有 pre，正好被自然排除。
 *  3. 用 navigator.clipboard 优先，失败时回退到 textarea + execCommand，
 *     因为 Clipboard API 在非安全上下文（例如局域网 http 访问）不可用。
 *  4. 按钮定位依赖父元素 position: relative，所以会把 pre 包一层
 *     .code-block，相关样式在 global.css。
 *  5. 用事件委托绑定一个 click 监听，而不是给每个按钮单独绑定 ——
 *     文章里可能有几十个代码块，委托更省内存也更简单。
 */
export const COPY_BUTTON_SCRIPT = `
(function () {
  /** 复制文本，优先用异步 Clipboard API，回退到旧的 execCommand 方案 */
  function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(
          function () { return true; },
          function () { return legacyCopy(text); }
        );
      }
    } catch (e) {
      /* 落到回退方案 */
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function enhance() {
    var blocks = document.querySelectorAll('.prose pre');
    for (var i = 0; i < blocks.length; i++) {
      var pre = blocks[i];
      var parent = pre.parentElement;
      // 已经处理过就跳过，避免重复插入按钮
      if (parent && parent.classList.contains('code-block')) continue;

      var wrapper = document.createElement('div');
      wrapper.className = 'code-block';
      if (parent) {
        parent.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
      }

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = '复制';
      btn.setAttribute('aria-label', '复制代码');
      wrapper.appendChild(btn);
    }
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    var btn = target && target.closest ? target.closest('.copy-btn') : null;
    if (!btn) return;
    var pre = btn.parentElement ? btn.parentElement.querySelector('pre') : null;
    if (!pre) return;

    copyText(pre.innerText).then(function (ok) {
      btn.textContent = ok ? '已复制' : '复制失败';
      if (ok) btn.classList.add('copied');
      window.setTimeout(function () {
        btn.textContent = '复制';
        btn.classList.remove('copied');
      }, 1600);
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhance);
  } else {
    enhance();
  }
})();
`;
