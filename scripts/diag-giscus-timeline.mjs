/**
 * 时间线诊断：Giscus 的 widget 请求到底会不会发出。
 *
 * 前几次测试都在固定等待后判定，无法区分"慢"与"根本不发"。
 * 这里持续轮询 40 秒，记录 iframe 状态与网络请求的变化时刻。
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET = process.argv[2] ?? 'https://feiyuqifei.github.io/tech/network-troubleshooting/';
const PORT = 9352;
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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('超时')); } }, 20000);
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
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'feiyu-tl-'))}`, 'about:blank',
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
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  const t0 = Date.now();
  const events = [];
  const reqSeen = new Set();

  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url;
      if (u.includes('giscus') && !reqSeen.has(u)) {
        reqSeen.add(u);
        events.push(`  t+${((Date.now() - t0) / 1000).toFixed(1)}s  请求  ${u.slice(0, 76)}`);
      }
    }
    if (m.method === 'Network.responseReceived') {
      const u = m.params.response.url;
      if (u.includes('giscus')) {
        events.push(`  t+${((Date.now() - t0) / 1000).toFixed(1)}s  响应  ${m.params.response.status}  ${u.slice(0, 70)}`);
      }
    }
    if (m.method === 'Network.loadingFailed') {
      events.push(`  t+${((Date.now() - t0) / 1000).toFixed(1)}s  失败  ${m.params.errorText}  type=${m.params.type}`);
    }
  });

  console.log(`目标: ${TARGET}`);
  console.log('==== 时间线（持续 40 秒轮询） ====\n');

  /* 第 6 秒滚到底，触发一切与视口相关的加载 */
  let scrolled = false;
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    if (!scrolled && i >= 5) {
      await cdp.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
      scrolled = true;
      events.push(`  t+${((Date.now() - t0) / 1000).toFixed(1)}s  ---- 已滚动到底部 ----`);
    }
    if (i % 5 === 4) {
      const st = await cdp.evaluate(`(() => {
        const f = document.querySelector('iframe.giscus-frame');
        if (!f) return 'no-iframe';
        let acc = false;
        try { acc = f.contentDocument !== null; } catch (e) { acc = false; }
        return (acc ? 'about:blank(空)' : '跨域内容已加载') + ' h=' + Math.round(f.getBoundingClientRect().height)
             + ' src=' + (f.getAttribute('src') || '(无)').slice(0, 40);
      })()`);
      events.push(`  t+${((Date.now() - t0) / 1000).toFixed(1)}s  状态  ${st}`);
    }
  }

  for (const e of events) console.log(e);

  console.log('\n==== 结论 ====');
  const widgetReq = [...reqSeen].some((u) => u.includes('/widget'));
  console.log(`  widget 请求是否发出: ${widgetReq ? '是' : '否'}`);
  console.log(`  giscus 相关请求总数: ${reqSeen.size}`);
  for (const u of reqSeen) console.log(`    ${u.slice(0, 90)}`);
  if (!widgetReq) {
    console.log('\n  widget 请求从未发出 -> client.js 执行后没有创建真正的 iframe 导航。');
    console.log('  这不是"慢"，是"不发生"。');
  }
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}
