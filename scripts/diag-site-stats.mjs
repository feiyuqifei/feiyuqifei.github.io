/**
 * 诊断页脚统计（Vercount）为什么不显示。
 *
 * 背景：容器 data-site-stats 是 hidden 的，只有脚本拿到数字后
 * 才会移除 hidden。所以要同时看三件事：
 *   1. vercount.one/js 这个外部脚本有没有加载成功
 *   2. 数字元素 busuanzi_value_site_uv/pv 有没有被填上
 *   3. 我们自己那段注入脚本有没有跑、有没有报错
 *
 * 用法: node scripts/diag-site-stats.mjs [url]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_ = process.argv[2] ?? 'https://feiyuqifei.github.io/';
const PORT = 9362;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.p = new Map(); this.events = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.method) this.events.push(m);
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
      setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); j(new Error('timeout ' + method)); } }, 30000);
    });
  }
  async ev(e) {
    const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.text };
    return r.result.value;
  }
}

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'stats-'))}`, 'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  const dl = Date.now() + 25000;
  while (Date.now() < dl) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* 等 */ }
    await sleep(300);
  }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_)}`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener('open', r, { once: true });
    ws.addEventListener('error', j, { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Log.enable');

  /* 轮询最多 45 秒，直到数字出现或超时 */
  const results = [];
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    const s = await cdp.ev(`(() => {
      const box = document.querySelector('[data-site-stats]');
      const uv = document.getElementById('busuanzi_value_site_uv');
      const pv = document.getElementById('busuanzi_value_site_pv');
      return {
        hasBox: !!box,
        hidden: box ? box.hasAttribute('hidden') : null,
        display: box ? getComputedStyle(box).display : null,
        uv: uv ? uv.textContent.trim() : null,
        pv: pv ? pv.textContent.trim() : null,
        vercountLoaded: typeof window.vercount !== 'undefined'
          || !!document.querySelector('script[src*="vercount"]'),
      };
    })()`);
    results.push({ t: i + 1, ...s });
    if (s && !s.__err && s.uv && s.uv !== '—' && s.hidden === false) break;
  }

  const last = results[results.length - 1];
  console.log(`目标: ${URL_}\n`);
  console.log('=== 最终状态 ===');
  console.log(JSON.stringify(last, null, 2));

  console.log('\n=== 状态变化（只在有变化时打印）===');
  let prev = null;
  for (const r of results) {
    const sig = `${r.hidden}|${r.uv}|${r.pv}`;
    if (sig !== prev) {
      console.log(`  ${r.t}s  hidden=${r.hidden}  uv=${r.uv}  pv=${r.pv}`);
      prev = sig;
    }
  }

  /* 网络：vercount 相关请求 */
  console.log('\n=== vercount 相关网络请求 ===');
  let any = false;
  for (const e of cdp.events) {
    if (e.method === 'Network.responseReceived' || e.method === 'Network.loadingFailed') {
      const u = e.params?.response?.url ?? e.params?.requestId ?? '';
      if (String(u).includes('vercount')) {
        any = true;
        if (e.method === 'Network.responseReceived') {
          console.log(`  [响应] ${e.params.response.status}  ${u}`);
        } else {
          console.log(`  [失败] ${e.params.errorText ?? ''}  ${u}`);
        }
      }
    }
  }
  if (!any) console.log('  没有任何 vercount 请求发出');

  /* 控制台错误 */
  const errs = cdp.events.filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error');
  console.log('\n=== 控制台错误 ===');
  if (errs.length === 0) console.log('  无');
  for (const e of errs.slice(0, 10)) {
    console.log(`  ${e.params.entry.text}  (${e.params.entry.url ?? ''})`);
  }
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}
