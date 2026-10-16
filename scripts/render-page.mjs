/**
 * 用真实浏览器渲染 JS 站点并提取正文，用于核实竞赛信息。
 *
 * 背景：长城杯铁人三项赛官网（ccb.itsec.gov.cn）与科创中国的文章页
 * 都是 JS 渲染的，curl 拿到的只是空壳。要核实报名时间必须渲染后读。
 *
 * 用法: node scripts/render-page.mjs <url> [正文选择器]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_ = process.argv[2];
if (!URL_) {
  console.error('用法: node scripts/render-page.mjs <url>');
  process.exit(1);
}

const PORT = 9382;
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
      setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); j(new Error('timeout ' + method)); } }, 25000);
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
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rp-'))}`,
  'about:blank',
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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1600, deviceScaleFactor: 1, mobile: false });

  /* 等到正文有实质内容（或超时） */
  let prev = 0;
  let stable = 0;
  for (let i = 0; i < 40; i++) {
    await sleep(900);
    const len = await cdp.ev(`document.body ? document.body.innerText.length : 0`);
    if (len > 300 && len === prev) {
      stable += 1;
      if (stable >= 2) break; // 连续两次长度不变，认为渲染完成
    } else {
      stable = 0;
    }
    prev = len;
  }

  const out = await cdp.ev(`(() => {
    const pick = (s) => {
      const e = document.querySelector(s);
      return e ? e.innerText.trim() : '';
    };
    /* 优先取常见的正文容器，取不到就退回整页 */
    const cands = ['article', '.article-content', '.content', '.detail', '#content', '.news-detail', 'main'];
    let body = '';
    for (const c of cands) { const t = pick(c); if (t.length > body.length) body = t; }
    if (body.length < 200) body = document.body.innerText.trim();
    return { title: document.title, url: location.href, len: body.length, body: body.slice(0, 6000) };
  })()`);

  console.log(`标题: ${out.title}`);
  console.log(`URL : ${out.url}`);
  console.log(`正文: ${out.len} 字符`);
  console.log('='.repeat(70));
  console.log(out.body.replace(/\n{3,}/g, '\n\n'));
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}
