/**
 * 验证 Umami 是否真的在上报数据。
 *
 * 为什么要单独验：脚本注入成功 ≠ 数据在采集。
 * 常见失效情况（都表现为"后台永远是 0"）：
 *   - websiteId 填错
 *   - 脚本被浏览器拦截（广告拦截器会拦 umami）
 *   - 上报请求发出但被 CORS / 网络挡回
 * 这里在真实浏览器里加载页面，抓取 Umami 实际发出的上报请求。
 *
 * 用法: node scripts/test-umami.mjs [页面URL]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET = process.argv[2] ?? 'https://feiyuqifei.github.io/';
const PORT = 9353;
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
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'feiyu-umami-'))}`, 'about:blank',
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

  /* 记录所有发往 umami 的请求 */
  const umamiReqs = [];
  const allThirdParty = new Set();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url;
      try {
        const host = new URL(u).host;
        if (host !== new URL(TARGET).host) allThirdParty.add(host);
      } catch { /* 忽略 */ }
      if (u.includes('umami')) {
        umamiReqs.push({
          phase: 'request',
          method: m.params.request.method,
          url: u,
          postData: (m.params.request.postData || '').slice(0, 300),
        });
      }
    }
    if (m.method === 'Network.responseReceived' && m.params.response.url.includes('umami')) {
      umamiReqs.push({
        phase: 'response',
        status: m.params.response.status,
        url: m.params.response.url,
      });
    }
    if (m.method === 'Network.loadingFailed') {
      umamiReqs.push({ phase: 'failed', error: m.params.errorText, type: m.params.type });
    }
  });

  await sleep(9000);

  console.log(`目标: ${TARGET}\n`);
  console.log('==== 浏览器实际加载的第三方域名 ====');
  for (const h of allThirdParty) console.log(`  ${h}`);

  console.log('\n==== 发往 Umami 的请求 ====');
  const sends = umamiReqs.filter((r) => r.phase === 'request' && r.method === 'POST');
  if (umamiReqs.length === 0) {
    console.log('  （没有任何 umami 请求 —— 脚本可能被拦截或未执行）');
  }
  for (const r of umamiReqs) {
    if (r.phase === 'request') {
      console.log(`  请求  ${r.method.padEnd(5)} ${r.url.slice(0, 80)}`);
      if (r.postData) console.log(`        载荷: ${r.postData}`);
    } else if (r.phase === 'response') {
      console.log(`  响应  ${r.status}     ${r.url.slice(0, 80)}`);
    } else {
      console.log(`  失败  ${r.error}  type=${r.type}`);
    }
  }

  console.log('\n==== 页面内 Umami 状态 ====');
  const st = await cdp.evaluate(`(() => ({
    scriptPresent: !!document.querySelector('script[src*="umami"]'),
    websiteId: (document.querySelector('script[src*="umami"]') || {}).dataset?.websiteId || null,
    umamiGlobal: typeof window.umami,
    hasTrackFn: typeof (window.umami && window.umami.track) === 'function',
  }))()`);
  console.log('  ' + JSON.stringify(st, null, 2).replace(/\n/g, '\n  '));

  console.log('\n==== 判定 ====');
  const ok = sends.length > 0;
  console.log(`  上报请求: ${sends.length} 条`);
  if (ok) {
    console.log('  -> 数据正在采集。Umami 后台的计数会包含本次访问。');
  } else {
    console.log('  -> 未观察到上报请求，数据可能没有在采集。');
    process.exitCode = 1;
  }
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}
