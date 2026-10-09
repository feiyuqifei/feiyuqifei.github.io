/**
 * 判定 Giscus iframe 是否真正加载了内容。
 *
 * 关键判据：contentDocument 是否可访问。
 *   - 跨域 iframe 加载成功后，contentDocument 为 null（受同源策略限制）
 *   - 若加载失败（网络错误、被拦、src 无效），浏览器会给出一个
 *     同源的错误文档，此时 contentDocument **不为 null**
 * 所以 "contentDocument === null" 反而是加载成功的证据。
 *
 * 另外截一张滚到评论区的图，供人工核对。
 *
 * 用法: node scripts/probe-giscus-frame.mjs [文章页URL]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = process.argv[2] ?? 'http://localhost:4321/tech/network-troubleshooting/';
const PORT = 9349;
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
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'feiyu-probe-'))}`, 'about:blank',
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
    width: 1280, height: 1600, deviceScaleFactor: 1, mobile: false,
  });

  /* 记录 giscus 相关请求的结果 */
  const reqs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Network.responseReceived') {
      const u = m.params.response.url;
      if (u.includes('giscus')) {
        reqs.push({ url: u.slice(0, 90), status: m.params.response.status, mime: m.params.response.mimeType });
      }
    }
    if (m.method === 'Network.loadingFailed' && m.params.type === 'Document') {
      reqs.push({ url: '(document failed)', error: m.params.errorText });
    }
  });

  await sleep(3500);
  await cdp.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(6000);

  console.log('==== giscus 相关网络请求 ====');
  if (reqs.length === 0) console.log('  （无）');
  for (const r of reqs) console.log(`  ${String(r.status ?? r.error).padEnd(8)} ${r.mime ?? ''}  ${r.url}`);

  console.log('\n==== iframe 状态判定 ====');
  const info = await cdp.evaluate(`(() => {
    const f = document.querySelector('iframe.giscus-frame');
    if (!f) return { exists: false };
    const r = f.getBoundingClientRect();
    let sameOrigin = false;
    let innerText = null;
    try {
      const d = f.contentDocument;
      sameOrigin = d !== null;
      if (d) innerText = (d.body ? d.body.innerText : '').slice(0, 200);
    } catch (e) {
      sameOrigin = false;
    }
    return {
      exists: true,
      src: f.src.slice(0, 80),
      w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top),
      contentDocumentAccessible: sameOrigin,
      innerText,
    };
  })()`);
  console.log(JSON.stringify(info, null, 2));

  if (info.exists) {
    if (info.contentDocumentAccessible === false) {
      console.log('\n[结论] contentDocument 不可访问 -> 跨域内容已加载（正常）');
    } else {
      console.log('\n[警告] contentDocument 可访问 -> 可能加载的是同源错误页（异常）');
      console.log(`        内部文本: ${info.innerText}`);
      process.exitCode = 1;
    }
    if (info.h < 100) {
      console.log(`[警告] iframe 高度仅 ${info.h}px，可能未渲染出内容`);
      process.exitCode = 1;
    }
  }

  /* 截图：整个页面全高，评论区一定在内 */
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
  });
  const out = resolve(HERE, '..', '_shots', '18-评论区.png');
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`\n全页截图: ${out}`);
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}
