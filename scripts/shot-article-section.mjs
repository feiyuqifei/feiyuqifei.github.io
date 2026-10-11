/**
 * 截取文章中的指定小节，用于人工核对排版。
 * 普通整页截图拍不到靠后的内容，所以先滚到目标标题再拍。
 *
 * 用法: node scripts/shot-article-section.mjs <url> <标题文字> <输出名>
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.argv[2] ?? 'http://localhost:4321/';
const NEEDLE = process.argv[3] ?? '';
const NAME = process.argv[4] ?? 'section.png';
const PORT = 9361;
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
      setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); j(new Error('timeout')); } }, 25000);
    });
  }
  async ev(e) {
    const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
}

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sec-'))}`, 'about:blank',
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
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1400, height: 1050, deviceScaleFactor: 1, mobile: false,
  });

  /* 等正文渲染出来 */
  for (let i = 0; i < 40; i++) {
    const ok = await cdp.ev(`!!document.querySelector('h2, h3')`);
    if (ok) break;
    await sleep(500);
  }
  await sleep(1500);

  /* 找到目标标题并滚到它 */
  const found = await cdp.ev(`(() => {
    const hs = Array.from(document.querySelectorAll('h2, h3'));
    const t = hs.find(h => h.textContent.includes(${JSON.stringify(NEEDLE)}));
    if (!t) return { ok: false, titles: hs.map(h => h.textContent.trim()).slice(0, 30) };
    const y = t.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo(0, y);
    return { ok: true, text: t.textContent.trim() };
  })()`);

  if (!found.ok) {
    console.log('未找到目标标题。页面上的标题有：');
    for (const t of found.titles ?? []) console.log('  - ' + t);
    process.exitCode = 1;
  } else {
    console.log(`已定位: ${found.text}`);
    await sleep(1800);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const out = resolve(HERE, '..', '_shots', NAME);
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log(`[OK] ${out}`);
  }
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}
