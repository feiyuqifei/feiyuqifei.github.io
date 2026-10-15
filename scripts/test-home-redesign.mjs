/**
 * 验证首页改版：分类入口条 + 分页行为。
 *
 * 检查六项：
 *   1. 首页有分类入口条，且分类链接能到达真实页面（不是 404）
 *   2. ?page=2 时不显示分类入口条（避免翻页时打断阅读）
 *   3. ?page=2 的文章列表确实与第 1 页不同
 *   4. 分类页能正常打开并列出该分类的文章
 *   5. 分类页「其他分类」链接正确
 *   6. 手机端无横向溢出（分类条是新增风险点）
 *
 * 用法: node scripts/test-home-redesign.mjs [baseUrl]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '');
const PORT = 9377;
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
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'home-'))}`, 'about:blank',
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

  const open = async (url, width = 1280, height = 900) => {
    const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.addEventListener('open', r, { once: true });
      ws.addEventListener('error', j, { once: true });
    });
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: width < 800 });
    for (let i = 0; i < 40; i++) {
      if (await cdp.ev(`!!document.querySelector('.post-list, .empty')`)) break;
      await sleep(250);
    }
    await sleep(700);
    return cdp;
  };

  /* 抓一页的关键信息 */
  const SNAP = `(() => {
    const cats = document.querySelector('.home-cats');
    const cards = [...document.querySelectorAll('.post-list h3 a, .post-list .post-title a')];
    return {
      hasCats: !!cats,
      catLinks: cats ? [...cats.querySelectorAll('a')].map(a => a.getAttribute('href')) : [],
      firstTitle: cards.length ? cards[0].textContent.trim() : null,
      count: cards.length,
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
    };
  })()`;

  console.log(`目标: ${BASE}\n`);

  console.log('=== 1. 首页第 1 页 ===');
  let cdp = await open(`${BASE}/`);
  const p1 = await cdp.ev(SNAP);
  check('有分类入口条', p1.hasCats === true);
  check('分类链接非空', p1.catLinks.length > 1, `${p1.catLinks.length} 个`);
  check('文章列表有内容', p1.count > 0, `${p1.count} 篇`);

  console.log('\n=== 2. 分类链接可达（不是 404） ===');
  const bad = [];
  for (const href of p1.catLinks) {
    const r = await cdp.ev(`fetch('${href}', { method: 'GET' }).then(r => r.status)`);
    if (r !== 200) bad.push(`${href} -> ${r}`);
  }
  check('全部分类链接返回 200', bad.length === 0, bad.join(', ') || `检查了 ${p1.catLinks.length} 个`);

  console.log('\n=== 3. 首页第 2 页 ===');
  ws.close();
  /* 注意用路径式 /page/2/ 而不是 ?page=2：
     首页分页原本是坏的 —— index.astro 读查询参数，而 Pagination 组件
     生成路径式链接，两边对不上，导致第 2 页从未生成、线上 404。
     现已统一为路径式，测试也跟着改，否则测的是不存在的用法。 */
  cdp = await open(`${BASE}/page/2/`);
  const p2 = await cdp.ev(SNAP);
  check('第 2 页不显示分类条', p2.hasCats === false, `hasCats=${p2.hasCats}`);
  check('第 2 页文章与第 1 页不同', p2.firstTitle !== null && p2.firstTitle !== p1.firstTitle,
    `p1="${(p1.firstTitle || '').slice(0, 16)}" p2="${(p2.firstTitle || '').slice(0, 16)}"`);
  check('第 2 页有文章（不是空页）', p2.count > 0, `${p2.count} 篇`);

  console.log('\n=== 4. 分类页内容 ===');
  const catUrl = p1.catLinks.find((h) => h !== '/categories/' && !h.endsWith('/categories/'));
  ws.close();
  cdp = await open(`${BASE}${catUrl}`);
  const cat = await cdp.ev(`(() => {
    const h1 = document.querySelector('h1');
    const cards = [...document.querySelectorAll('.post-list h3 a, .post-list .post-title a')];
    const others = [...document.querySelectorAll('.post-tags a')].map(a => a.getAttribute('href'));
    return { h1: h1 ? h1.textContent.trim() : null, count: cards.length, others: others.length };
  })()`);
  check('分类页标题正确', !!cat.h1, `h1=${cat.h1}`);
  check('分类页列出了文章', cat.count > 0, `${cat.count} 篇`);
  check('分类页有「其他分类」', cat.others > 0, `${cat.others} 个`);

  console.log('\n=== 5. 手机端首页 ===');
  ws.close();
  cdp = await open(`${BASE}/`, 393, 852);
  const m = await cdp.ev(SNAP);
  check('手机端无横向溢出', m.docW <= m.winW, `文档 ${m.docW} / 视口 ${m.winW}`);
  check('手机端也有分类条', m.hasCats === true);
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n结果：${results.length - failed} / ${results.length} 项通过`);
if (failed > 0) process.exitCode = 1;
