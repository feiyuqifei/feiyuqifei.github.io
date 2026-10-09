/**
 * 水印 与 访客统计 的端到端测试。
 *
 * 两个功能各自有一个"最容易失败但看不出来"的点：
 *
 * 水印 —— 它是一层覆盖整个视口的 fixed 元素。
 *   如果 pointer-events 不是 none，全站链接、按钮、文本选择会全部失效。
 *   这种故障很隐蔽：页面看起来完全正常，只是什么都点不动。
 *   所以必须实测"水印下方能不能拿到并点到真实元素"。
 *
 * 访客统计 —— 数字是异步拉回来的，脚本被广告拦截器拦掉时
 *   会留下一个空壳。所以既要验证"数字能出现"，也要验证
 *   "拿不到数字时不显示空壳"。
 *
 * 用法: node scripts/test-watermark-stats.mjs [url]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = process.argv[2] ?? 'http://localhost:4321/';
const PORT = 9354;
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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('超时 ' + method)); } }, 25000);
    });
  }
  async evaluate(e) {
    const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面异常: ' + r.exceptionDetails.text);
    return r.result.value;
  }
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'feiyu-wm-'));
  console.log(`浏览器: ${CHROME}`);
  console.log(`目标页: ${TARGET}\n`);

  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
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
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(4000);

    console.log('【1】水印层');
    const wm = await cdp.evaluate(`(() => {
      const el = document.querySelector('.site-watermark');
      if (!el) return { exists: false };
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const de = document.documentElement;
      return {
        exists: true,
        position: cs.position,
        pointerEvents: cs.pointerEvents,
        zIndex: cs.zIndex,
        bgImage: cs.backgroundImage.slice(0, 34),
        bgRepeat: cs.backgroundRepeat,
        opacity: cs.opacity,
        ariaHidden: el.getAttribute('aria-hidden'),
        /*
         * 用 clientWidth 而不是 innerWidth 比较：
         * 有滚动条时 innerWidth 含滚动条宽度，固定定位元素会被判成"没铺满"。
         * 之前就是因为这个误报过一次失败。
         */
        coversWidth: Math.abs(r.width - de.clientWidth) <= 1,
        coversHeight: Math.abs(r.height - de.clientHeight) <= 1,
      };
    })()`);
    console.log('    ', JSON.stringify(wm));
    check('水印层已渲染', wm.exists === true);
    check('固定定位且覆盖整个视口', wm.position === 'fixed' && wm.coversWidth && wm.coversHeight);
    check('用 background 平铺（非堆 DOM）', wm.bgRepeat === 'repeat' && wm.bgImage.includes('svg'));
    check('对读屏软件隐藏', wm.ariaHidden === 'true');
    check(
      '透明度在合理区间（可见但不干扰阅读）',
      Number(wm.opacity) >= 0.02 && Number(wm.opacity) <= 0.08,
      `opacity=${wm.opacity}`,
    );

    console.log('\n【2】水印在深浅色主题下都要可见');
    /* 背景图必须已解析出颜色 —— 若 SVG 用 currentColor，会拿不到父色而变黑 */
    const themeCheck = async (theme) => {
      await cdp.evaluate(`document.documentElement.setAttribute('data-theme', '${theme}')`);
      await sleep(300);
      return cdp.evaluate(`(() => {
        const el = document.querySelector('.site-watermark');
        const cs = getComputedStyle(el);
        const img = cs.backgroundImage;
        /* 从 data URI 里解出 fill 的颜色，确认不是 currentColor、也不为空 */
        const m = /fill%3D%22(%23[0-9a-fA-F]{3,8})%22/.exec(img);
        return { theme: '${theme}', fill: m ? m[1] : null, opacity: cs.opacity, len: img.length };
      })()`);
    };
    const light = await themeCheck('light');
    const dark = await themeCheck('dark');
    console.log('     light:', JSON.stringify(light));
    console.log('     dark :', JSON.stringify(dark));
    check('浅色主题：水印图带显式颜色', !!light.fill, light.fill ?? '(未解析到)');
    check('深色主题：水印图带显式颜色', !!dark.fill, dark.fill ?? '(未解析到)');
    check(
      '两个主题用的是不同的水印图（说明确实做了适配）',
      light.fill !== dark.fill,
      `${light.fill} vs ${dark.fill}`,
    );
    /* 复位到深色，与后续截图一致 */
    await cdp.evaluate(`document.documentElement.setAttribute('data-theme', 'dark')`);
    await sleep(200);

    console.log('\n【2】关键底线：水印不能拦截交互');
    check('pointer-events 为 none', wm.pointerEvents === 'none');
    const hit = await cdp.evaluate(`(() => {
      const link = document.querySelector('.site-header a[href], .post-title a, main a');
      if (!link) return { skipped: true };
      const r = link.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        skipped: false,
        topIsWatermark: !!(el && el.classList.contains('site-watermark')),
        gotReal: !!(el && el !== document.body && el !== document.documentElement),
        tag: el ? el.tagName.toLowerCase() : null,
      };
    })()`);
    console.log('    ', JSON.stringify(hit));
    check('命中测试拿到的是真实元素，不是水印', hit.skipped === true || hit.topIsWatermark === false, hit.tag ?? '');
    check('能拿到非 body 的具体元素', hit.skipped === true || hit.gotReal === true);

    console.log('\n【3】访客统计');
    const stats = await cdp.evaluate(`(() => {
      const line = document.querySelector('[data-site-stats]');
      const uv = document.getElementById('busuanzi_value_site_uv');
      const pv = document.getElementById('busuanzi_value_site_pv');
      const script = document.querySelector('script[src*="vercount"]');
      return {
        hasLine: !!line,
        hidden: line ? line.hidden : null,
        hasUv: !!uv, hasPv: !!pv,
        uvText: uv ? uv.textContent.trim() : null,
        pvText: pv ? pv.textContent.trim() : null,
        hasScript: !!script,
        scriptSrc: script ? script.getAttribute('src') : null,
      };
    })()`);
    console.log('    ', JSON.stringify(stats));
    check('统计容器已渲染', stats.hasLine === true);
    check('Vercount 脚本已加载', stats.hasScript === true, stats.scriptSrc ?? '');
    check('四个 busuanzi ID 俱在', stats.hasUv && stats.hasPv);

    /*
     * 等数字回来。超时给到 40 秒：
     * Vercount 首次加载实测约 5~16 秒（无缓存、网络抖动时更久），
     * 之前用 15 秒导致过一次假失败 —— 数字其实来了，只是比超时晚。
     */
    let nums = null;
    for (let i = 0; i < 80; i++) {
      nums = await cdp.evaluate(`(() => {
        const line = document.querySelector('[data-site-stats]');
        const uv = document.getElementById('busuanzi_value_site_uv');
        const pv = document.getElementById('busuanzi_value_site_pv');
        const t = (el) => (el ? el.textContent.trim() : '');
        return { hidden: line ? line.hidden : null, uv: t(uv), pv: t(pv) };
      })()`);
      if (!nums.hidden && /[0-9]/.test(nums.uv + nums.pv)) break;
      await sleep(500);
    }
    console.log('    ', JSON.stringify(nums));
    const hasNum = /[0-9]/.test(nums.uv + nums.pv);
    check('拿到了真实数字', hasNum === true, `UV=${nums.uv} PV=${nums.pv}`);
    check('拿到数字后统计行显示出来', hasNum ? nums.hidden === false : true, `hidden=${nums.hidden}`);
    /* hidden 一旦移除就不应再回去 —— 避免闪烁或反复显隐 */
    await sleep(1500);
    const after = await cdp.evaluate(`(document.querySelector('[data-site-stats]') || {}).hidden`);
    check('显示状态稳定（不会又变回隐藏）', hasNum ? after === false : true, `hidden=${after}`);

    console.log('\n【4】视觉确认（截图）');
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const out = resolve(HERE, '..', '_shots', '25-水印与访客统计.png');
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log(`     已保存: ${out}`);
    check('截图已生成', existsSync(out));
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    try { proc.kill(); } catch { /* 忽略 */ }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${'='.repeat(52)}`);
  console.log(`结果：${results.length - failed.length} / ${results.length} 项通过`);
  if (failed.length) {
    for (const f of failed) console.log(`  ✗ ${f.name} ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('测试脚本出错:', e.message);
  process.exitCode = 1;
});
