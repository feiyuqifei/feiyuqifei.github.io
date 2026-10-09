/**
 * 抢拍鼠标特效的截图。
 *
 * 为什么需要单独的脚本：
 *   粒子存活不到两秒，普通的 chrome --screenshot 是加载完立刻拍，
 *   那时还没有任何粒子。必须先派发鼠标事件造出粒子，
 *   再在几十毫秒内截图。
 *
 * 用法: node scripts/shot-cursor-fx.mjs [url] [输出目录]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(process.argv[3] ?? join(HERE, '..', '_shots'));
const TARGET = process.argv[2] ?? 'http://localhost:4321/';
const PORT = 9341;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
if (!CHROME) {
  console.error('未找到浏览器');
  process.exit(2);
}

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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('超时 ' + method)); } }, 20000);
    });
  }
}

async function shoot(cdp, name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const p = join(OUT_DIR, name);
  writeFileSync(p, Buffer.from(r.data, 'base64'));
  console.log(`  [OK] ${p}`);
  return p;
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'feiyu-shot-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
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
      width: 1280, height: 820, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(3000);

    // 场景一：鼠标划过的气泡尾迹
    const trail = [
      [240, 620], [330, 600], [420, 580], [510, 560], [600, 540],
      [690, 520], [780, 500], [870, 480], [960, 460], [1050, 440],
    ];
    for (const [x, y] of trail) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
      await sleep(22);
    }
    await sleep(60);
    await shoot(cdp, '13-鼠标气泡尾迹.png');

    // 场景二：点击爆发
    await sleep(3000); /* 等上一批粒子散尽，画面干净 */
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 470, button: 'none' });
    await sleep(60);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 470, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 470, button: 'left', clickCount: 1 });
    await sleep(110);
    await shoot(cdp, '14-点击破泡爆发.png');
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    try { proc.kill(); } catch { /* 忽略 */ }
  }
}

main().catch((e) => {
  console.error('截图脚本出错:', e.message);
  process.exitCode = 1;
});
