/**
 * 截取文章页底部（评论区）的截图。
 *
 * 页面的普通截图只拍首屏，评论区在页面最底部，
 * 所以要先滚到底、等 Giscus 加载完再拍。
 *
 * 用法: node scripts/shot-comments.mjs [文章页URL] [输出文件名]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = process.argv[2] ?? 'http://localhost:4321/tech/network-troubleshooting/';
const NAME = process.argv[3] ?? '18-评论区.png';
const PORT = 9347;
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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('超时')); } }, 25000);
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
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'feiyu-shotc-'))}`, 'about:blank',
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
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  /* 滚到底部触发 lazy 加载。
     Giscus 是两层网络请求（client.js → widget），实测总耗时
     9~16 秒（取决于到 giscus.app 的网络状况），所以必须轮询，
     不能用固定等待 —— 等 1.5 秒截出来的必然是空白框。 */
  await sleep(3000);
  await cdp.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);

  let frameH = 0;
  let accessible = true;
  for (let i = 0; i < 120; i++) {
    const st = await cdp.evaluate(`(() => {
      const f = document.querySelector('iframe.giscus-frame');
      if (!f) return { h: 0, accessible: true };
      let acc = false;
      try { acc = f.contentDocument !== null; } catch (e) { acc = false; }
      return { h: Math.round(f.getBoundingClientRect().height), accessible: acc };
    })()`);
    frameH = st.h;
    accessible = st.accessible;
    /* 跨域内容一旦加载成功，contentDocument 变为不可访问 */
    if (!accessible && frameH > 100) break;
    await sleep(500);
  }
  /* 再多给一点时间让 iframe 内部完成绘制 */
  await sleep(3000);

  /*
   * 滚动定位：把整个 .comments 区域放进视口。
   * 先算它的绝对位置，再减去一个上边距，
   * 这样截图里能看到"评论"标题 + iframe 全部内容。
   */
  const pos = await cdp.evaluate(`(() => {
    const c = document.querySelector('.comments');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), h: Math.round(r.height) };
  })()`);
  if (pos) {
    await cdp.evaluate(`window.scrollTo(0, ${Math.max(0, pos.top - 60)})`);
  }
  await sleep(1200);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const out = resolve(HERE, '..', '_shots', NAME);
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`[OK] ${out}   iframe 高度 ${frameH}px，评论区高度 ${pos ? pos.h : '?'}px`);
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}
