/**
 * 截取页脚，确认访客统计的显示效果。
 * 页脚在页面最底部，普通截图拍不到，需要先滚到底并等数字加载。
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = process.argv[2] ?? 'http://localhost:4321/';
const NAME = process.argv[3] ?? '26-页脚访客统计.png';
const PORT = 9359;
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
      setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); j(new Error('timeout')); } }, 20000);
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
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'foot-'))}`, 'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  const dl = Date.now() + 25000;
  while (Date.now() < dl) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* 等 */ }
    await sleep(300);
  }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(TARGET)}`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener('open', r, { once: true });
    ws.addEventListener('error', j, { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 620, deviceScaleFactor: 2, mobile: false,
  });

  /* 等统计数字出现（最多 40 秒） */
  let nums = { hidden: true, uv: '—', pv: '—' };
  for (let i = 0; i < 80; i++) {
    nums = await cdp.ev(`(() => {
      const l = document.querySelector('[data-site-stats]');
      const t = (id) => { const e = document.getElementById(id); return e ? e.textContent.trim() : '—'; };
      return { hidden: l ? l.hidden : true, uv: t('busuanzi_value_site_uv'), pv: t('busuanzi_value_site_pv') };
    })()`);
    if (!nums.hidden) break;
    await sleep(500);
  }
  console.log(`  数字: UV=${nums.uv}  PV=${nums.pv}  hidden=${nums.hidden}`);

  /* 滚到页脚 */
  await cdp.ev(`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(1200);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const out = resolve(HERE, '..', '_shots', NAME);
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`  [OK] ${out}`);
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}
