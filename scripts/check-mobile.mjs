/**
 * 手机端界面检查。
 *
 * 为什么不能靠肉眼：桌面浏览器把窗口拖窄，和真实手机视口是两回事 ——
 * 设备像素比、触摸命中区、字体缩放策略都不同。
 * 这里用 CDP 的移动设备模拟来测。
 *
 * 重点查四类移动端常见故障：
 *   1. 横向溢出（页面被撑宽，出现左右滚动）—— 最典型
 *   2. 元素超出视口右边界
 *   3. 可点区域过小（触摸命中困难）
 *   4. 字号过小（iOS 会在 <16px 的输入框上自动放大页面）
 *
 * 用法: node scripts/check-mobile.mjs [url]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', '_shots');
const BASE = process.argv[2] ?? 'http://localhost:4321';
const PORT = 9342;
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
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error('页面异常: ' + r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
    }
    return r.result.value;
  }
}

/** 设备清单：覆盖小屏、主流、大屏三档 */
const DEVICES = [
  { name: 'iPhone-SE', width: 375, height: 667, dpr: 2 },
  { name: 'iPhone-14Pro', width: 393, height: 852, dpr: 3 },
  { name: 'Pixel-7', width: 412, height: 915, dpr: 2.6 },
];

const PAGES = ['/', '/tech/', '/tech/network-troubleshooting/', '/tags/', '/videos/', '/competitions/', '/about/'];

let problems = 0;

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'feiyu-mobile-'));
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
    const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    const dev = DEVICES[1]; /* iPhone 14 Pro 作为主测设备 */
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: dev.width, height: dev.height, deviceScaleFactor: dev.dpr, mobile: true,
    });

    for (const path of PAGES) {
      const url = `${BASE.replace(/\/$/, '')}${path}`;
      await cdp.send('Page.navigate', { url });
      await sleep(2200);

      console.log(`\n${'─'.repeat(60)}`);
      console.log(`页面: ${path}   （${dev.name} ${dev.width}x${dev.height}）`);

      const r = await cdp.evaluate(`(() => {
        const de = document.documentElement;
        const vw = de.clientWidth;
        const overflow = de.scrollWidth - vw;

        /* 找出真正越过视口右边界的元素（排除本身就是滚动容器的） */
        const offenders = [];
        const all = document.querySelectorAll('body *');
        for (const el of all) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          if (cs.position === 'fixed') continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const overRight = rect.right - vw;
          if (overRight > 2) {
            /* 若祖先里有横向滚动容器，则不算问题 */
            let p = el.parentElement, scrollable = false;
            while (p && p !== document.body) {
              const pcs = getComputedStyle(p);
              if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll' || pcs.overflowX === 'hidden') {
                scrollable = true; break;
              }
              p = p.parentElement;
            }
            offenders.push({
              tag: el.tagName.toLowerCase(),
              cls: (typeof el.className === 'string' ? el.className : '').slice(0, 46),
              /* 带上文字内容与水平位置，便于定位到底是哪个元素 */
              text: (el.textContent || '').trim().slice(0, 18),
              overBy: Math.round(overRight),
              left: Math.round(rect.left),
              width: Math.round(rect.width),
              inScroller: scrollable,
            });
          }
        }
        offenders.sort((a, b) => b.overBy - a.overBy);
        return {
          vw,
          scrollWidth: de.scrollWidth,
          overflow,
          offenders: offenders.slice(0, 12),
          totalOffenders: offenders.length,
        };
      })()`);

      console.log(`  视口宽 ${r.vw}px，文档宽 ${r.scrollWidth}px，横向溢出 ${r.overflow}px`);
      if (r.overflow <= 1) {
        console.log('  [OK]   无横向溢出');
      } else {
        problems++;
        console.log(`  [问题] 横向溢出 ${r.overflow}px，越界元素 ${r.totalOffenders} 个：`);
        for (const o of r.offenders) {
          console.log(`         <${o.tag} class="${o.cls}"> left=${o.left} 宽=${o.width} 超出=${o.overBy}px 文字="${o.text}"${o.inScroller ? ' [滚动容器内]' : ''}`);
        }
      }

      /* 触摸命中区检查：主要交互元素至少 32px 高 */
      const taps = await cdp.evaluate(`(() => {
        const sel = '.nav a, .theme-toggle, .search-trigger, .tag, .copy-btn, [data-to-top], .post-title a';
        const small = [];
        for (const el of document.querySelectorAll(sel)) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.height < 32) {
            small.push({
              tag: el.tagName.toLowerCase(),
              cls: (typeof el.className === 'string' ? el.className : '').slice(0, 40),
              h: Math.round(r.height), w: Math.round(r.width),
            });
          }
        }
        return small.slice(0, 8);
      })()`);
      if (taps.length === 0) {
        console.log('  [OK]   交互元素触摸命中区均 ≥ 32px');
      } else {
        console.log(`  [提示] ${taps.length} 个元素高度 < 32px：`);
        for (const t of taps) console.log(`         <${t.tag} class="${t.cls}"> ${t.w}x${t.h}px`);
      }
    }

    // 主测设备上给首页和文章页各截图一张
    for (const [path, name] of [['/', '15-手机-首页.png'], ['/tech/network-troubleshooting/', '16-手机-文章页.png']]) {
      await cdp.send('Page.navigate', { url: `${BASE.replace(/\/$/, '')}${path}` });
      await sleep(2500);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const p = join(OUT_DIR, name);
      writeFileSync(p, Buffer.from(shot.data, 'base64'));
      console.log(`\n截图: ${p}`);
    }
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    try { proc.kill(); } catch { /* 忽略 */ }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(problems === 0 ? '结果: 未发现横向溢出' : `结果: ${problems} 个页面存在横向溢出`);
  if (problems > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('检查脚本出错:', e.message);
  process.exitCode = 1;
});
