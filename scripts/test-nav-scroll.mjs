/**
 * 验证顶栏导航在窄屏下的滑动提示与当前项定位。
 *
 * 背景：393px 视口下顶栏放不下全部导航项，靠 overflow-x: auto 滑动。
 * 加这个脚本之前，被裁掉的项目没有任何提示，等于不存在。
 *
 * 检查五项：
 *   1. 有溢出时 data-nav-scroll 应为 'start'（右侧还有内容）
 *   2. 当前页对应的导航项要能滚进可视区
 *   3. 滚到最右后状态应变成 'end'
 *   4. 没有溢出时状态应为 'none'
 *   5. 提示用的 mask 不能挡住链接的点击（mask 不参与命中测试）
 *
 * 用法: node scripts/test-nav-scroll.mjs [baseUrl]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '');
const PORT = 9373;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.p = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.p.has(m.id)) {
        const { resolve: r, reject: j } = this.p.get(m.id);
        this.p.delete(m.id);
        m.error ? j(new Error(JSON.stringify(m.error))) : r(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((r, j) => {
      this.p.set(id, { resolve: r, reject: j });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); j(new Error('timeout ' + method)); } }, 20000);
    });
  }
  async ev(e) {
    const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'nav-'))}`, 'about:blank',
], { stdio: 'ignore' });

let ws;
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'OK  ' : '!!  '}${name}${detail ? '  (' + detail + ')' : ''}`);
};

try {
  const dl = Date.now() + 25000;
  while (Date.now() < dl) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* 等 */ }
    await sleep(300);
  }

  const open = async (url, width, height = 852) => {
    const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.addEventListener('open', r, { once: true });
      ws.addEventListener('error', j, { once: true });
    });
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 2, mobile: width < 800 });
    for (let i = 0; i < 40; i++) {
      if (await cdp.ev(`!!document.querySelector('[data-nav]')`)) break;
      await sleep(250);
    }
    await sleep(900);
    return cdp;
  };

  const STATE = `(() => {
    const nav = document.querySelector('[data-nav]');
    const active = nav.querySelector('a[aria-current="page"]');
    const nr = nav.getBoundingClientRect();
    const ar = active ? active.getBoundingClientRect() : null;
    return {
      attr: nav.getAttribute('data-nav-scroll'),
      overflow: nav.scrollWidth - nav.clientWidth,
      scrollLeft: Math.round(nav.scrollLeft),
      activeText: active ? active.textContent.trim() : null,
      activeVisible: ar ? (ar.left >= nr.left - 1 && ar.right <= nr.right + 1) : null,
      mask: getComputedStyle(nav).maskImage !== 'none',
      links: nav.querySelectorAll('a').length,
    };
  })()`;

  console.log(`目标: ${BASE}\n`);

  /* 1 + 2：窄屏首页 */
  console.log('=== 393px 首页 ===');
  let cdp = await open(`${BASE}/`, 393);
  let s = await cdp.ev(STATE);
  check('有溢出时给出滑动提示', s.attr === 'start' || s.attr === 'both', `attr=${s.attr} 溢出=${s.overflow}px`);
  check('提示用了 mask 渐隐', s.mask === true);
  check('导航项已增至 9 个', s.links === 9, `实际 ${s.links}`);

  /* 3：滚到最右 */
  await cdp.ev(`(() => { const n = document.querySelector('[data-nav]'); n.scrollLeft = n.scrollWidth; })()`);
  await sleep(500);
  s = await cdp.ev(STATE);
  check('滚到最右后状态变为 end', s.attr === 'end' || s.attr === 'none', `attr=${s.attr}`);

  /* 2：从「归档」页进入，当前项应自动滚进视野 */
  console.log('\n=== 393px 进入 /archive/（当前项在右侧） ===');
  ws.close();
  cdp = await open(`${BASE}/archive/`, 393);
  await sleep(800);
  s = await cdp.ev(STATE);
  check('当前项是「归档」', s.activeText === '归档', `实际 ${s.activeText}`);
  check('当前项已滚进可视区', s.activeVisible === true, `visible=${s.activeVisible}`);

  /* 4：桌面宽度无溢出 */
  console.log('\n=== 1280px 桌面（不应有提示） ===');
  ws.close();
  cdp = await open(`${BASE}/`, 1280, 900);
  s = await cdp.ev(STATE);
  check('无溢出时状态为 none', s.attr === 'none', `attr=${s.attr} 溢出=${s.overflow}px`);

  /* 5：mask 区域内的链接仍可命中（mask 不参与命中测试） */
  console.log('\n=== 点击「成员」（位于窄屏右侧） ===');
  ws.close();
  cdp = await open(`${BASE}/`, 393);
  const clicked = await cdp.ev(`(() => {
    const links = [...document.querySelectorAll('[data-nav] a')];
    const t = links.find(a => a.textContent.trim() === '成员');
    if (!t) return { found: false };
    t.click();
    return { found: true };
  })()`);
  await sleep(1500);
  const url = await cdp.ev(`location.pathname`);
  check('「成员」链接可点击并跳转', clicked.found && url === '/team/', `pathname=${url}`);
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n结果：${results.length - failed} / ${results.length} 项通过`);
if (failed > 0) process.exitCode = 1;
