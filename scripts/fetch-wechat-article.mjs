/**
 * 用真实浏览器抓取微信文章正文。
 * 微信网页版要求 JS 渲染，curl 拿到的只有壳。
 *
 * 用法: node scripts/fetch-wechat-article.mjs <url>
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_ = process.argv[2];
if (!URL_) {
  console.error('用法: node scripts/fetch-wechat-article.mjs <url>');
  process.exit(1);
}

const PORT = 9381;
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
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'wx-'))}`,
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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false });

  /* 微信正文容器是 #js_content，等它出现 */
  let text = '';
  for (let i = 0; i < 30; i++) {
    await sleep(800);
    const info = await cdp.ev(`(() => {
      const t = document.title || '';
      const c = document.querySelector('#js_content, .rich_media_content');
      return { title: t, len: c ? c.innerText.length : 0 };
    })()`);
    if (info.len > 200) { text = await cdp.ev(`document.querySelector('#js_content, .rich_media_content').innerText`); break; }
    if (i === 29) {
      console.log(`  未能取到正文。页面标题: ${info.title}`);
      console.log(`  可能是「环境异常」验证页或需要登录。`);
      const body = await cdp.ev(`document.body.innerText.slice(0, 400)`);
      console.log('  页面文本片段: ' + body.replace(/\s+/g, ' '));
    }
  }

  if (text) {
    const title = await cdp.ev(`document.title`);
    console.log(`标题: ${title}\n`);
    console.log('='.repeat(70));
    console.log(text.replace(/\n{3,}/g, '\n\n'));
  }
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}
