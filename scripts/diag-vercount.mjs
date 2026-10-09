/**
 * 抓 Vercount 脚本实际发出的网络请求。
 *
 * 背景：直接调 /api/v2/log 返回的是正确的按域名统计
 * （goodlunatic 27582/79066，与它页面显示一致），
 * 但脚本在浏览器里填进 DOM 的数字是 49088663 —— 完全对不上。
 * 说明脚本走的不是这个接口，或者另有逻辑。抓包看真相。
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET = process.argv[2] ?? 'http://localhost:4321/';
const PORT = 9355;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

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

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'feiyu-vc-'))}`, 'about:blank',
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
  await cdp.send('Network.enable');

  const reqs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url;
      if (u.includes('vercount') || u.includes('busuanzi')) {
        reqs.push({ dir: '→', method: m.params.request.method, url: u, body: m.params.request.postData });
      }
    }
    if (m.method === 'Network.responseReceived') {
      const u = m.params.response.url;
      if (u.includes('vercount') || u.includes('busuanzi')) {
        reqs.push({ dir: '←', status: m.params.response.status, url: u });
      }
    }
  });

  await sleep(9000);

  console.log('==== vercount 相关网络请求 ====');
  for (const r of reqs) {
    if (r.dir === '→') {
      console.log(`  → ${r.method} ${r.url}`);
      if (r.body) console.log(`      body: ${r.body}`);
    } else {
      console.log(`  ← ${r.status} ${r.url}`);
    }
  }
  if (reqs.length === 0) console.log('  （无）');

  console.log('\n==== DOM 里的数字与本地存储 ====');
  const st = await cdp.evaluate(`(() => {
    const t = (id) => { const e = document.getElementById(id); return e ? e.textContent.trim() : null; };
    let ls = null;
    try { ls = localStorage.getItem('visitorCountData'); } catch (e) { ls = 'ERR'; }
    return {
      uv: t('busuanzi_value_site_uv'),
      pv: t('busuanzi_value_site_pv'),
      hidden: (document.querySelector('[data-site-stats]') || {}).hidden,
      localStorage: ls,
      cookie: document.cookie,
    };
  })()`);
  console.log('  ' + JSON.stringify(st, null, 2).replace(/\n/g, '\n  '));

  /* 直接问一次接口，看这个时刻服务端认为的数字是多少 */
  console.log('\n==== 页面内直接调用接口的结果 ====');
  const direct = await cdp.evaluate(`fetch('https://events.vercount.one/api/v2/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: location.href, isNewUv: false })
  }).then(r => r.text()).catch(e => 'ERR: ' + e.message)`);
  console.log('  ' + direct);
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}
