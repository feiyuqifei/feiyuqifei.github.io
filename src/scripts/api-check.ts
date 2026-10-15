/**
 * 自检页的检测脚本。
 *
 * 为什么要抽成独立常量而不是写在 .astro 的 <script> 里：
 *   .astro 的 <script> 内写含模板字符串的 JS 会踩坑（见 site-stats.ts
 *   的注释），必须配合 set:html。项目里统一用「导出常量 + set:html」，
 *   这里保持一致。
 *
 * 检测三项：
 *   1. vercount.one/js 能否加载（页脚数字的来源）
 *   2. events.vercount.one 能否上报（数字能否真的取回来）
 *   3. cloud.umami.is 能否加载（文章阅读统计）
 *
 * 判定「被拦截」与「加载失败」的区别：
 *   被拦截时请求根本发不出去（脚本标签不出现、fetch 抛网络错误），
 *   加载失败时请求发出但拿到错误状态码。两者处理方式不同，所以要分开报。
 */
export const API_CHECK_SCRIPT = `
(function () {
  var root = document.querySelector('[data-api-check]');
  if (!root) return;

  var results = [];

  function row(name, status, detail) {
    results.push({ name: name, status: status, detail: detail });
    render();
  }

  function render() {
    var html = '<table class="check-table"><thead><tr>' +
      '<th>检测项</th><th>结果</th><th>说明</th></tr></thead><tbody>';
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var cls = r.status === '正常' ? 'is-ok'
        : r.status === '被拦截' ? 'is-blocked' : 'is-fail';
      html += '<tr><td>' + r.name + '</td>' +
        '<td><span class="check-badge ' + cls + '">' + r.status + '</span></td>' +
        '<td>' + r.detail + '</td></tr>';
    }
    html += '</tbody></table>';
    root.innerHTML = html;
  }

  /* 检测一：外链脚本能否插入 DOM 并加载。
     用动态插入 script 的方式，与页脚真实加载路径一致。 */
  function testScript(url, label, next) {
    var done = false;
    var el = document.createElement('script');
    el.src = url;
    el.async = true;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      row(label, '被拦截',
        '脚本 15 秒内没有加载，通常是广告拦截插件拦掉了 ' + url.split('/')[2] + '。');
      next();
    }, 15000);

    el.onload = function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      row(label, '正常', '脚本已成功加载。');
      next();
    };
    el.onerror = function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      row(label, '加载失败', '请求发出但未成功，可能是网络问题或服务不可用。');
      next();
    };
    document.head.appendChild(el);
  }

  /* 检测二：上报接口能否访问。
     用 no-cors 模式发一个 HEAD，只关心「请求有没有被拦」，
     不关心响应内容，所以不需要 CORS 头。 */
  function testEndpoint(url, label, next) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      row(label, '被拦截', '请求 15 秒无响应，多半是被拦截插件挡掉了。');
      next();
    }, 15000);

    fetch(url, { mode: 'no-cors', cache: 'no-store' })
      .then(function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        row(label, '正常', '可以连通（不校验响应内容）。');
        next();
      })
      .catch(function (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        row(label, '被拦截', '请求被挡下：' + (e && e.message ? e.message : '未知原因'));
        next();
      });
  }

  /* 检测三：页脚那两个数字元素现在是什么状态。
     必须轮询等待 —— Vercount 填数字要几秒（实测约 4 秒），
     而检测脚本跑得比它快。第一版只查一次，结果数字还没到就判了
     「加载失败」，与下面的「全部正常」结论自相矛盾，反而让人更糊涂。 */
  function testFooterNumbers(next) {
    var uv = document.getElementById('busuanzi_value_site_uv');
    var pv = document.getElementById('busuanzi_value_site_pv');
    if (!uv || !pv) {
      row('页脚统计元素', '加载失败', '页面上找不到统计元素，可能是模板问题。');
      next();
      return;
    }

    function ok(el) {
      var t = (el.textContent || '').trim();
      return t !== '' && t !== '\\u2014' && /[0-9]/.test(t);
    }

    var waited = 0;
    var timer = setInterval(function () {
      waited += 1;
      if (ok(uv) || ok(pv)) {
        clearInterval(timer);
        row('页脚统计元素', '正常',
          '已取到数字：访客 ' + uv.textContent.trim() + ' / 浏览 ' + pv.textContent.trim());
        next();
        return;
      }
      if (waited >= 20) {
        clearInterval(timer);
        row('页脚统计元素', '加载失败',
          '等了 20 秒数字仍是占位符。若上面两项都正常，可能是 Vercount 服务暂时不可用。');
        next();
      }
    }, 1000);
  }

  /* 串行执行，保证结果按顺序出现 */
  testScript('https://vercount.one/js', 'Vercount 脚本（页脚访客数）', function () {
    testEndpoint('https://events.vercount.one/api/v2/log', 'Vercount 上报接口', function () {
      testScript('https://cloud.umami.is/script.js', 'Umami 脚本（文章阅读统计）', function () {
        testFooterNumbers(function () {
          var blocked = 0;
          for (var i = 0; i < results.length; i++) if (results[i].status === '被拦截') blocked++;
          var extra = document.createElement('p');
          extra.className = 'check-summary';
          extra.textContent = blocked > 0
            ? '结论：有 ' + blocked + ' 项被拦截。把本站加入拦截插件白名单后刷新本页。'
            : '结论：全部正常。页脚数字应当会在几秒内出现。';
          root.appendChild(extra);
        });
      });
    });
  });
})();
`;
