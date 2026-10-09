/**
 * Giscus 评论区的端到端测试。
 *
 * 为什么必须实测：Giscus 的失效方式非常隐蔽 ——
 * 三个前提条件（仓库 public、开启 Discussions、授权 Giscus App）
 * 缺任何一个，评论框都会是一块空白，而且**页面不报错、控制台也可能没提示**。
 * 只看"script 标签注入成功"完全说明不了问题。
 *
 * 这里验证的是：iframe 是否真的被创建、是否成功加载了 giscus.app 的内容。
 *
 * ⚠️ 注意：本脚本**只能验证到"加载成功"这一层**。
 *    能否真正发帖/显示已有评论，取决于 GitHub 登录态，
 *    无头浏览器里没有你的登录会话，那一步需要你在真实浏览器确认。
 *
 * 用法: node scripts/test-giscus.mjs [文章页URL]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET = process.argv[2] ?? 'http://localhost:4321/tech/network-troubleshooting/';
const PORT = 9346;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
if (!CHROME) {
  console.error('未找到浏览器');
  process.exit(2);
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve: res, reject: rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('超时 ' + method)); } }, 25000);
    });
  }
  async evaluate(e) {
    const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'feiyu-giscus-'));
  console.log(`浏览器: ${CHROME}`);
  console.log(`目标页: ${TARGET}\n`);

  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  let ws;
  try {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* 等 */ }
      await sleep(300);
    }
    const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(TARGET)}`, { method: 'PUT' })).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    /* 收集控制台报错与失败请求，Giscus 出问题时经常只在这些地方留痕 */
    const consoleErrors = [];
    const failedRequests = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        consoleErrors.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160));
      }
      if (m.method === 'Network.loadingFailed') {
        failedRequests.push(`${m.params.type} ${m.params.errorText}`);
      }
    });
    await cdp.send('Network.enable');

    /* 滚到底部，触发 data-loading="lazy" 的 Giscus 加载 */
    await sleep(3000);
    await cdp.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);

    /*
     * 等 Giscus 真正渲染。
     *
     * ⚠️ 这里必须轮询，不能用固定等待时间。
     * 实测线上时间线：client.js 响应耗时约 7 秒、widget 响应再约 7 秒，
     * 约 16 秒才开始画内容，26 秒才展开到完整高度（372px）。
     * 之前用固定 6 秒等待，测的全是加载完成之前的状态，
     * 因而把"加载慢"误判成了"加载失败"。这个教训值得留在代码里。
     *
     * 判据用 contentDocument 是否可访问：
     *   跨域内容加载成功后为 null；若可访问且为空，说明还停在 about:blank。
     *
     * 超时给到 150 秒。原因：giscus.app 的响应速度波动很大，
     * 实测 client.js 与 widget 各耗时 6~9 秒，正常约 16 秒完成；
     * 但网络抖动时 60 秒都未必够。曾用 60 秒超时导致一次假失败，
     * 复查时间线发现实际 16.5 秒就加载好了 —— 是抖动不是故障。
     */
    const loadStart = Date.now();
    let loaded = false;
    for (let i = 0; i < 300; i++) {
      const st = await cdp.evaluate(`(() => {
        const f = document.querySelector('iframe.giscus-frame');
        if (!f) return { state: 'no-iframe' };
        let accessible = false;
        try { accessible = f.contentDocument !== null; } catch (e) { accessible = false; }
        return {
          state: accessible ? 'blank' : 'loaded',
          h: Math.round(f.getBoundingClientRect().height),
        };
      })()`);
      if (st.state === 'loaded' && st.h > 100) { loaded = true; break; }
      await sleep(500);
    }
    const waited = ((Date.now() - loadStart) / 1000).toFixed(1);
    console.log(`   等待 Giscus 渲染: ${waited}s  ${loaded ? '(已加载)' : '(超时未加载)'}\n`);

    console.log('【1】评论容器与脚本');
    const dom = await cdp.evaluate(`(() => {
      const section = document.querySelector('.comments');
      const script = document.querySelector('script[src*="giscus.app/client.js"]');
      const placeholder = document.querySelector('.comments-placeholder');
      return {
        hasSection: !!section,
        hasScript: !!script,
        scriptSrc: script ? script.getAttribute('src') : null,
        dataRepo: script ? script.getAttribute('data-repo') : null,
        dataRepoId: script ? script.getAttribute('data-repo-id') : null,
        dataCategoryId: script ? script.getAttribute('data-category-id') : null,
        hasPlaceholder: !!placeholder,
        iframeCount: document.querySelectorAll('iframe.giscus-frame').length,
      };
    })()`);
    console.log('    ', JSON.stringify(dom, null, 2).replace(/\n/g, '\n     '));
    check('存在评论区容器', dom.hasSection === true);
    check('Giscus 脚本已注入', dom.hasScript === true, dom.scriptSrc ?? '');
    check('未显示"尚未启用"占位提示', dom.hasPlaceholder === false);
    check('repoId 已填入', !!dom.dataRepoId && dom.dataRepoId.startsWith('R_'), dom.dataRepoId ?? '(空)');
    check('categoryId 已填入', !!dom.dataCategoryId && dom.dataCategoryId.startsWith('DIC_'), dom.dataCategoryId ?? '(空)');

    console.log('\n【2】iframe 是否真的加载了内容（关键）');
    check('Giscus iframe 已创建', dom.iframeCount > 0, `${dom.iframeCount} 个`);
    check('iframe 内部为跨域文档（内容已加载）', loaded === true, `等待 ${waited}s`);

    if (dom.iframeCount > 0) {
      const frame = await cdp.evaluate(`(() => {
        const f = document.querySelector('iframe.giscus-frame');
        const r = f.getBoundingClientRect();
        let accessible = false;
        try { accessible = f.contentDocument !== null; } catch (e) { accessible = false; }
        return { src: f.src, w: Math.round(r.width), h: Math.round(r.height), accessible };
      })()`);
      console.log('    ', JSON.stringify(frame));
      check('iframe 指向 giscus.app', frame.src.startsWith('https://giscus.app/'), frame.src.slice(0, 60) + '…');
      check('iframe 高度已展开（说明内容渲染完成）', frame.h > 100, `${frame.h}px 高`);
    }

    console.log('\n【3】网络与控制台');
    if (failedRequests.length) {
      console.log('     失败请求:');
      for (const f of failedRequests.slice(0, 6)) console.log(`       ${f}`);
    }
    check('无失败的资源请求', failedRequests.length === 0, `${failedRequests.length} 条`);
    if (consoleErrors.length) {
      console.log('     控制台报错:');
      for (const e of consoleErrors.slice(0, 6)) console.log(`       ${e}`);
    }
    check('无控制台报错', consoleErrors.length === 0, `${consoleErrors.length} 条`);

    /* 主动拉取一次 giscus 的客户端脚本，确认它对公网可达 */
    console.log('\n【4】giscus.app 可达性');
    const reach = await cdp.evaluate(`fetch('https://giscus.app/client.js', { method: 'HEAD' })
      .then(r => r.status).catch(e => 'ERR: ' + e.message)`);
    check('client.js 可访问', reach === 200, `HTTP ${reach}`);
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    try { proc.kill(); } catch { /* 忽略 */ }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${'='.repeat(50)}`);
  console.log(`结果：${results.length - failed.length} / ${results.length} 项通过`);
  if (failed.length) {
    for (const f of failed) console.log(`  ✗ ${f.name} ${f.detail}`);
    process.exitCode = 1;
  }
  console.log('\n提示：本测试无法验证"发帖"与"显示已有评论"，');
  console.log('      那需要 GitHub 登录态，请在真实浏览器里确认。');
}

main().catch((e) => {
  console.error('测试脚本出错:', e.message);
  process.exitCode = 1;
});
