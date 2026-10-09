/**
 * 视觉特效的端到端测试。
 *
 * 为什么要测而不是靠肉眼：
 *   进度条、返回顶部、滚动显现都是滚动驱动的交互，
 *   截图只能拍到静止的一帧，拍不出"随滚动变化"这个核心行为。
 *   这里用 CDP 真实滚动页面，逐步断言。
 *
 * 用法:
 *   node scripts/test-effects.mjs                      # 默认测文章页
 *   node scripts/test-effects.mjs http://localhost:4321/
 *   node scripts/test-effects.mjs http://localhost:4321/ --page=home
 *
 * --page 决定部分断言的预期：
 *   article —— 应有进度条；标题区有光晕底纹（无 .hero，走 .article-header 分支）
 *   home    —— 不应有进度条，但应有 .hero 光晕且带动画
 *   other   —— 两者都不要求
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const targetArg = argv.find((a) => !a.startsWith('--'));

const BASE = targetArg ?? 'http://localhost:4321';
/*
 * 页面类型不靠命令行参数猜，而是从 DOM 自己判断：
 *   有 .hero        -> 首页类（有首屏光晕，长文进度条无意义）
 *   有 .article-header -> 文章/关于页（应有进度条与标题区光晕）
 *   都没有           -> 列表页（两者都不要求）
 * 靠参数容易和实际页面不一致，测出来的结论就不可信了。
 */
const TARGET = BASE;
const PORT = 9339;
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

/** 滚到页面的某个百分比位置，等动画稳定后读取状态 */
async function scrollTo(cdp, ratio) {
  await cdp.evaluate(`(() => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    window.scrollTo({ top: Math.round(max * ${ratio}), behavior: 'instant' });
  })()`);
  await sleep(450);
}

async function waitReady(cdp) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < 30000) {
    try {
      last = await cdp.evaluate(`(() => ({
        href: location.href,
        ready: document.readyState,
        hasProgress: !!document.querySelector('[data-reading-progress]'),
      }))()`);
    } catch { /* 导航中上下文可能被销毁 */ }
    if (last && last.href.startsWith('http') && last.ready === 'complete') return last;
    await sleep(250);
  }
  return last;
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'feiyu-fx-'));
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
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    const ready = await waitReady(cdp);
    // 页面类型从 DOM 判断，而不是靠命令行参数 —— 参数容易和实际页面不一致
    const kind = await cdp.evaluate(`(() => {
      if (document.querySelector('.hero')) return 'home';
      if (document.querySelector('.article-header')) return 'article';
      return 'list';
    })()`);
    console.log(`   页面就绪: ${ready.href}   类型: ${kind}\n`);

    console.log('【1】阅读进度条');
    const expectProgress = kind === 'article';
    if (expectProgress) {
      check('文章页存在进度条', ready.hasProgress === true);
    } else {
      check(`非文章页（${kind}）不应有进度条`, ready.hasProgress === false);
    }

    if (expectProgress) {
      const atTop = await cdp.evaluate(`(() => {
        const bar = document.querySelector('.reading-progress-bar');
        return bar ? getComputedStyle(bar).transform : null;
      })()`);
      await scrollTo(cdp, 0.5);
      const atHalf = await cdp.evaluate(`(() => {
        const bar = document.querySelector('.reading-progress-bar');
        const m = new DOMMatrixReadOnly(getComputedStyle(bar).transform);
        return { scaleX: m.a, wrapHidden: document.querySelector('[data-reading-progress]').classList.contains('is-done') };
      })()`);
      await scrollTo(cdp, 1);
      const atEnd = await cdp.evaluate(`(() => {
        const bar = document.querySelector('.reading-progress-bar');
        const m = new DOMMatrixReadOnly(getComputedStyle(bar).transform);
        return { scaleX: m.a, done: document.querySelector('[data-reading-progress]').classList.contains('is-done') };
      })()`);

      console.log(`    顶部 transform: ${atTop}`);
      console.log(`    50% 处 scaleX : ${atHalf.scaleX.toFixed(3)}`);
      console.log(`    底部 scaleX   : ${atEnd.scaleX.toFixed(3)}`);
      check('顶部时进度为 0', atTop === 'matrix(0, 0, 0, 1, 0, 0)' || atTop === 'none');
      check('滚到一半进度约 0.5', atHalf.scaleX > 0.3 && atHalf.scaleX < 0.75, `= ${atHalf.scaleX.toFixed(2)}`);
      check('滚到底部进度为 1', atEnd.scaleX > 0.99, `= ${atEnd.scaleX.toFixed(3)}`);
      check('读到底后进度条淡出', atEnd.done === true);
    }

    console.log('\n【2】返回顶部按钮');
    await scrollTo(cdp, 0);
    const topState = await cdp.evaluate(`(() => {
      const b = document.querySelector('[data-to-top]');
      const cs = getComputedStyle(b);
      return { shown: b.classList.contains('is-shown'), visibility: cs.visibility, opacity: cs.opacity };
    })()`);
    check('顶部时按钮隐藏', topState.shown === false && topState.visibility === 'hidden', JSON.stringify(topState));

    await scrollTo(cdp, 0.5);
    const midState = await cdp.evaluate(`(() => {
      const b = document.querySelector('[data-to-top]');
      const cs = getComputedStyle(b);
      return { shown: b.classList.contains('is-shown'), visibility: cs.visibility };
    })()`);
    check('滚动后按钮出现', midState.shown === true && midState.visibility === 'visible', JSON.stringify(midState));

    // 真实点击按钮，验证回到顶部
    const pt = await cdp.evaluate(`(() => {
      const b = document.querySelector('[data-to-top]');
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    }
    await sleep(1200);
    const afterClick = await cdp.evaluate(`window.scrollY`);
    check('点击后回到顶部', afterClick < 50, `scrollY = ${afterClick}`);

    console.log('\n【3】滚动显现');
    const reveal = await cdp.evaluate(`(() => ({
      hasReadyClass: document.documentElement.classList.contains('reveal-ready'),
      total: document.querySelectorAll('.post-item, .section-card, .plan-item, .archive-year, .video-entry').length,
      visible: document.querySelectorAll('.is-visible').length,
    }))()`);
    console.log('    ', JSON.stringify(reveal));
    check('已加上 reveal-ready 标记', reveal.hasReadyClass === true);
    check('目标元素被注册进观察器', reveal.total > 0, `${reveal.total} 个`);
    check('首屏元素已直接标记可见（不闪）', reveal.visible > 0, `${reveal.visible} 个`);

    console.log('\n【4】首屏光晕动效');
    const heroInfo = await cdp.evaluate(`(() => {
      const hero = document.querySelector('.hero');
      const header = document.querySelector('.article-header');
      if (hero) {
        const cs = getComputedStyle(hero, '::before');
        return { which: 'hero', animationName: cs.animationName, duration: cs.animationDuration };
      }
      if (header) {
        const cs = getComputedStyle(header, '::before');
        return { which: 'article-header', background: cs.backgroundImage.slice(0, 40) };
      }
      return { which: 'none' };
    })()`);
    console.log('    ', JSON.stringify(heroInfo));
    if (kind === 'home') {
      check('首页有 hero 光晕且带动画', heroInfo.which === 'hero' && heroInfo.animationName === 'hero-drift',
        `animation = ${heroInfo.animationName}`);
    } else if (kind === 'article') {
      check('文章页标题区有光晕底纹', heroInfo.which === 'article-header', `which = ${heroInfo.which}`);
    }

    console.log('\n【5】无障碍：减少动态效果');
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await cdp.send('Page.reload');
    await sleep(2500);
    const reduced = await cdp.evaluate(`(() => {
      const hero = document.querySelector('.hero');
      const anim = hero ? getComputedStyle(hero, '::before').animationName : null;
      const header = document.querySelector('.article-header');
      const headerAnim = header ? getComputedStyle(header, '::before').animationName : null;
      return {
        revealReady: document.documentElement.classList.contains('reveal-ready'),
        heroAnimation: anim ?? headerAnim ?? 'no-section',
        toTopTransition: getComputedStyle(document.querySelector('[data-to-top]')).transitionDuration,
      };
    })()`);
    console.log('    ', JSON.stringify(reduced));
    check('开启减少动效后不再注入显现脚本', reduced.revealReady === false);
    check('首屏光晕动画被关闭', reduced.heroAnimation === 'none' || reduced.heroAnimation === 'no-section',
      `animation-name = ${reduced.heroAnimation}`);
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

