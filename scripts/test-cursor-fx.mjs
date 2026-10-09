/**
 * 鼠标跟随气泡特效的端到端测试。
 *
 * 这类效果的"画出来了吗"无法靠截图判断（粒子很淡、且随时在消散），
 * 只能直接读 canvas 的像素数据来断言。
 *
 * 重点验证两条底线：
 *   1. 鼠标移动后 canvas 上确实出现了非透明像素
 *   2. canvas 层 pointer-events 为 none，且不遮挡页面元素点击
 *      —— 站上有 4 个全局 click 监听，被挡住就是功能性故障
 *
 * 用法: node scripts/test-cursor-fx.mjs [url]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET = process.argv[2] ?? 'http://localhost:4321/';
const PORT = 9340;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
if (!CHROME) {
  console.error('未找到 Chrome / Edge');
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
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('CDP 超时 ' + method)); }
      }, 20000);
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error('页面异常: ' + r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
    }
    return r.result.value;
  }
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

/** 用真实鼠标事件划一条轨迹 */
async function moveAlong(cdp, points) {
  for (const [x, y] of points) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await sleep(30);
  }
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'feiyu-cursor-'));
  console.log(`浏览器: ${CHROME}`);
  console.log(`目标页: ${TARGET}\n`);

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
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(3000);

    console.log('【1】canvas 是否正确创建');
    const info = await cdp.evaluate(`(() => {
      const c = document.querySelector('canvas.cursor-fx');
      if (!c) return { exists: false };
      const cs = getComputedStyle(c);
      return {
        exists: true,
        position: cs.position,
        pointerEvents: cs.pointerEvents,
        zIndex: cs.zIndex,
        w: c.width, h: c.height,
        ariaHidden: c.getAttribute('aria-hidden'),
      };
    })()`);
    console.log('    ', JSON.stringify(info));
    check('创建了 canvas.cursor-fx', info.exists === true);
    check('定位为 fixed 覆盖视口', info.position === 'fixed');
    check('pointer-events 为 none（不挡点击）', info.pointerEvents === 'none');
    check('标记 aria-hidden（对读屏软件隐藏）', info.ariaHidden === 'true');

    console.log('\n【2】鼠标移动后是否真的画出了粒子');
    // 先确认画布是空的
    const emptyBefore = await cdp.evaluate(`(() => {
      const c = document.querySelector('canvas.cursor-fx');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let nonZero = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) nonZero++;
      return nonZero;
    })()`);
    check('移动前画布为空', emptyBefore === 0, `非透明像素 ${emptyBefore}`);

    await moveAlong(cdp, [
      [300, 300], [380, 320], [460, 340], [540, 360], [620, 380],
      [700, 400], [780, 420], [860, 440], [940, 460],
    ]);

    // 粒子在消散，取移动后立刻的一帧
    const afterMove = await cdp.evaluate(`(() => {
      const c = document.querySelector('canvas.cursor-fx');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let nonZero = 0;
      let maxAlpha = 0;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] !== 0) { nonZero++; if (d[i] > maxAlpha) maxAlpha = d[i]; }
      }
      return { nonZero, maxAlpha };
    })()`);
    console.log('    ', JSON.stringify(afterMove));
    check('移动后画布出现像素', afterMove.nonZero > 0, `${afterMove.nonZero} 个非透明像素`);
    check('粒子是半透明的（不刺眼）', afterMove.maxAlpha > 0 && afterMove.maxAlpha < 200,
      `最大 alpha = ${afterMove.maxAlpha}/255`);

    console.log('\n【3】粒子会自然消散（不会越积越多）');
    await sleep(3500);
    const afterIdle = await cdp.evaluate(`(() => {
      const c = document.querySelector('canvas.cursor-fx');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let nonZero = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) nonZero++;
      return nonZero;
    })()`);
    check('停止移动后粒子消散干净', afterIdle === 0, `剩余 ${afterIdle}`);

    console.log('\n【4】点击特效：破泡爆发');
    // 先确保画布是干净的，避免鼠标移动残留的粒子干扰判断
    await sleep(3200);
    const beforeClick = await cdp.evaluate(`(() => {
      const c = document.querySelector('canvas.cursor-fx');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++;
      return n;
    })()`);
    check('点击前画布已清空', beforeClick === 0, `剩余 ${beforeClick}`);

    const CX = 640;
    const CY = 400;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: CX, y: CY, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: CX, y: CY, button: 'left', clickCount: 1 });
    await sleep(150);

    /** 统计非透明像素在横向上的分布范围 */
    const spreadNow = () => cdp.evaluate(`(() => {
      const c = document.querySelector('canvas.cursor-fx');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const dpr = c.width / window.innerWidth;
      let n = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (d[(y * c.width + x) * 4 + 3] !== 0) {
            n++;
            const lx = x / dpr, ly = y / dpr;
            if (lx < minX) minX = lx;
            if (lx > maxX) maxX = lx;
            if (ly < minY) minY = ly;
            if (ly > maxY) maxY = ly;
          }
        }
      }
      return { n, minX, maxX, minY, maxY, leftSpread: ${CX} - minX, rightSpread: maxX - ${CX} };
    })()`);

    const t1 = await spreadNow();
    console.log('     150ms:', JSON.stringify(t1));
    check('点击后出现粒子', t1.n > 0, `${t1.n} 个非透明像素`);
    check('粒子向左右两侧扩散（不是原地冒泡）',
      t1.leftSpread > 12 && t1.rightSpread > 12,
      `左 ${t1.leftSpread.toFixed(0)}px / 右 ${t1.rightSpread.toFixed(0)}px`);

    /*
     * 冲击波的验证要密集采样取"最大扩散距离"。
     * 之前只比较两个时间点，结果测到的是**气泡**的外沿 ——
     * 气泡有阻尼，散开后会停下并上浮，外沿反而收缩，
     * 于是误判成"冲击波没有扩散"。
     * 冲击波是描边环、很淡，会被气泡盖住，所以必须看整段时间的峰值。
     */
    let peakSpread = 0;
    for (let i = 0; i < 20; i++) {
      const s = await spreadNow();
      const m = Math.max(s.leftSpread, s.rightSpread);
      if (m > peakSpread) peakSpread = m;
      await sleep(30);
    }
    console.log(`     峰值扩散距离: ${peakSpread.toFixed(0)}px`);
    check('扩散范围明显超过气泡初速（说明冲击波在扩）', peakSpread > t1.rightSpread + 8,
      `${t1.rightSpread.toFixed(0)}px -> 峰值 ${peakSpread.toFixed(0)}px`);

    console.log('\n【5】连点保护');
    // 90ms 冷却内连点，粒子数不应线性堆叠
    for (let i = 0; i < 8; i++) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 300, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 500, y: 300, button: 'left', clickCount: 1 });
    }
    await sleep(120);
    const rapid = await spreadNow();
    console.log('     快速连点 8 次后:', `${rapid.n} 像素`);
    check('连点不会堆爆粒子（有冷却与上限）', rapid.n < 40000, `${rapid.n} 像素`);

    console.log('\n【6】点击特效会自行消散');
    await sleep(4500);
    const settled = await spreadNow();
    check('点击特效最终消散干净', settled.n === 0, `剩余 ${settled.n}`);

    console.log('\n【7】关键底线：不遮挡页面元素点击');
    // 命中测试：canvas 所在层级上，实际能接收点击的必须是底下的真实元素
    const hit = await cdp.evaluate(`(() => {
      const target = document.querySelector('.site-header a, .nav a, .post-item a');
      if (!target) return { skipped: true };
      const r = target.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const canvas = document.querySelector('canvas.cursor-fx');
      return {
        skipped: false,
        topIsCanvas: el === canvas,
        isInsideTarget: target.contains(el) || target === el,
        topTag: el ? el.tagName + '.' + (el.className || '') : null,
      };
    })()`);
    console.log('    ', JSON.stringify(hit));
    check('命中测试：canvas 不是最顶层元素', hit.skipped === true || hit.topIsCanvas === false,
      `顶层是 ${hit.topTag}`);
    check('命中测试：能拿到下方真实链接', hit.skipped === true || hit.isInsideTarget === true);

    console.log('\n【8】无障碍与设备适配');
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await cdp.send('Page.reload');
    await sleep(2500);
    const reduced = await cdp.evaluate(`!!document.querySelector('canvas.cursor-fx')`);
    check('减少动效时不创建 canvas', reduced === false);

    // 模拟触屏设备：不应启动
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
    });
    await cdp.send('Page.reload');
    await sleep(2500);
    const onTouch = await cdp.evaluate(`!!document.querySelector('canvas.cursor-fx')`);
    check('触屏设备不创建 canvas（不挡内容、不耗电）', onTouch === false);
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    try { proc.kill(); } catch { /* 忽略 */ }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${'='.repeat(48)}`);
  console.log(`结果：${results.length - failed.length} / ${results.length} 项通过`);
  if (failed.length) {
    for (const f of failed) console.log(`  ✗ ${f.name} ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('测试脚本出错:', err.message);
  process.exitCode = 1;
});
