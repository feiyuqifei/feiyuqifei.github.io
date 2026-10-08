/**
 * 主题切换按钮的端到端测试。
 *
 * 为什么要单独写这个脚本：
 *   之前验证深色模式用的是"直接改产物 HTML 的 data-theme 属性"，
 *   那只证明了 CSS 正确，并没有证明**按钮真的能用**。
 *   这个脚本通过 Chrome DevTools Protocol 真实点击按钮，
 *   检查 <html> 上的 data-theme / data-pf-theme 是否翻转、
 *   localStorage 是否落盘、刷新后是否保持。
 *
 * 用法（需要先有一个本机服务在跑）：
 *   node scripts/test-theme-toggle.mjs http://localhost:4321
 *
 * 原理：用 CDP 的 Input.dispatchMouseEvent 发真实鼠标事件，
 * 而不是 element.click()，这样连事件冒泡和命中区域一并验证。
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET = process.argv[2] ?? 'http://localhost:4321';
const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 极简 CDP 客户端：只实现本项目需要的几个命令 */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时: ${method}`));
        }
      }, 20000);
    });
  }

  /** 在页面里求值，返回 JSON 化的结果 */
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`页面内异常: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    }
    return r.result.value;
  }
}

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  throw new Error('未找到 Chrome / Edge');
}

async function waitForDevtools(port, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* 还没起来，继续等 */
    }
    await sleep(300);
  }
  throw new Error('DevTools 端口未就绪');
}

/** 建立一个新的页面目标并连上它的 WebSocket */
async function newPage(port, url) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  });
  if (!res.ok) throw new Error(`创建页面失败: HTTP ${res.status}`);
  const tab = await res.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return { tab, cdp: new Cdp(ws), ws };
}

/**
 * 等待页面真正就绪。
 *
 * CDP 新建的标签页初始是 about:blank，之后才异步导航到目标地址。
 * 必须轮询直到：URL 已切换到目标 + readyState 为 complete + 目标元素出现。
 * 死等固定时长在本地服务上碰巧能过，但远程站点会失败。
 */
async function waitForPageReady(cdp, selector = '[data-theme-toggle]', timeoutMs = 30000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await cdp.evaluate(`(() => ({
        readyState: document.readyState,
        href: location.href,
        hasButton: !!document.querySelector(${JSON.stringify(selector)}),
      }))()`);
    } catch {
      // 导航过程中执行上下文可能被销毁，忽略后重试
    }
    if (last && last.href.startsWith('http') && last.readyState === 'complete' && last.hasButton) {
      return { ...last, elapsedMs: Date.now() - started };
    }
    await sleep(250);
  }
  return { ...(last ?? { readyState: '未知', href: '', hasButton: false }), elapsedMs: Date.now() - started };
}

/** 取得元素中心点坐标，用于派发真实鼠标事件 */
async function centerOf(cdp, selector) {  return cdp.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
}

async function clickReal(cdp, selector) {
  const pt = await centerOf(cdp, selector);
  if (!pt) throw new Error(`找不到可点击元素: ${selector}`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', {
      type,
      x: pt.x,
      y: pt.y,
      button: 'left',
      clickCount: 1,
    });
  }
  await sleep(350);
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'feiyu-cdp-'));
  console.log(`浏览器: ${chrome}`);
  console.log(`目标页: ${TARGET}\n`);

  const proc = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore', detached: false }
  );

  let cdp;
  let ws;
  try {
    await waitForDevtools(PORT);
    const page = await newPage(PORT, TARGET);
    cdp = page.cdp;
    ws = page.ws;

    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    /*
     * 关键：必须轮询等待页面真正就绪，不能死等固定时间。
     * 通过 CDP 新建的标签页初始是 about:blank，随后才异步导航到目标地址；
     * 远程站点（如 GitHub Pages）从发起导航到 DOM 可用可能需要数秒。
     * 固定 sleep 会在文档还是空的时就查询 DOM，导致
     * "找不到按钮"这类假故障 —— 本地服务快所以掩盖了这个问题。
     */
    const ready = await waitForPageReady(cdp);
    console.log(`   页面就绪: ${ready.href}  (readyState=${ready.readyState}, 等待 ${ready.elapsedMs}ms)\n`);
    if (!ready.hasButton) {
      console.log('   警告: 页面已就绪但未找到主题按钮，后续断言会失败\n');
    }

    console.log('【1】初始状态');
    const initial = await cdp.evaluate(`(() => {
      const root = document.documentElement;
      return {
        theme: root.getAttribute('data-theme'),
        pfTheme: root.getAttribute('data-pf-theme'),
        stored: localStorage.getItem('feiyu-theme'),
        colorScheme: root.style.colorScheme,
        hasButton: !!document.querySelector('[data-theme-toggle]'),
      };
    })()`);
    console.log('   ', JSON.stringify(initial));
    check('页面存在主题切换按钮', initial.hasButton);
    check('data-theme 已设置（防闪白脚本生效）', initial.theme === 'dark' || initial.theme === 'light', `= ${initial.theme}`);
    check('data-pf-theme 与 data-theme 一致', initial.pfTheme === initial.theme, `pf=${initial.pfTheme}`);

    console.log('\n【2】点击按钮（真实鼠标事件）');
    await clickReal(cdp, '[data-theme-toggle]');
    const afterClick = await cdp.evaluate(`(() => {
      const root = document.documentElement;
      return {
        theme: root.getAttribute('data-theme'),
        pfTheme: root.getAttribute('data-pf-theme'),
        stored: localStorage.getItem('feiyu-theme'),
        colorScheme: root.style.colorScheme,
      };
    })()`);
    console.log('   ', JSON.stringify(afterClick));
    const expected = initial.theme === 'dark' ? 'light' : 'dark';
    check('主题确实翻转了', afterClick.theme === expected, `${initial.theme} → ${afterClick.theme}`);
    check('data-pf-theme 同步翻转（搜索弹层不会脱节）', afterClick.pfTheme === expected);
    check('localStorage 已写入', afterClick.stored === expected, `= ${afterClick.stored}`);
    check('colorScheme 已同步', afterClick.colorScheme === expected);

    console.log('\n【3】实际生效的 CSS 变量是否跟着变');
    const vars = await cdp.evaluate(`(() => {
      const cs = getComputedStyle(document.documentElement);
      return { bg: cs.getPropertyValue('--bg').trim(), text: cs.getPropertyValue('--text').trim() };
    })()`);
    console.log('   ', JSON.stringify(vars));
    const bgMatches = expected === 'dark' ? vars.bg.toLowerCase() === '#0b1017' : vars.bg.toLowerCase() === '#f8fafc';
    check('--bg 是当前主题的值', bgMatches, `--bg=${vars.bg}`);

    console.log('\n【4】刷新后是否保持选择');
    await cdp.send('Page.reload');
    await sleep(2500);
    const afterReload = await cdp.evaluate(`document.documentElement.getAttribute('data-theme')`);
    check('刷新后仍保持用户选择（未被系统偏好覆盖）', afterReload === expected, `= ${afterReload}`);

    console.log('\n【5】再点一次应回到初始主题');
    await clickReal(cdp, '[data-theme-toggle]');
    const back = await cdp.evaluate(`document.documentElement.getAttribute('data-theme')`);
    check('再次点击可切回', back === initial.theme, `= ${back}`);

    console.log('\n【6】键盘可达性（Tab 能否聚焦到按钮）');
    const focusable = await cdp.evaluate(`(() => {
      const btn = document.querySelector('[data-theme-toggle]');
      btn.focus();
      return document.activeElement === btn;
    })()`);
    check('按钮可被聚焦', focusable === true);

    console.log('\n【7】搜索弹层是否可用（仅 preview 有索引）');
    const searchInfo = await cdp.evaluate(`(() => {
      const t = document.querySelector('pagefind-modal-trigger');
      const m = document.querySelector('pagefind-modal');
      return { hasTrigger: !!t, hasModal: !!m, customElements: typeof customElements !== 'undefined' };
    })()`);
    console.log('   ', JSON.stringify(searchInfo));
    if (searchInfo.hasTrigger) {
      const upgrade = await cdp.evaluate(`(() => {
        const t = document.querySelector('pagefind-modal-trigger');
        return { tag: t.tagName.toLowerCase(), upgraded: t.constructor.name !== 'HTMLElement' };
      })()`);
      console.log('   ', JSON.stringify(upgrade));
      check('pagefind 自定义元素已被升级（脚本加载成功）', upgrade.upgraded, `constructor=${upgrade.tag}`);
    } else {
      console.log('    （dev 模式，搜索按钮按设计隐藏，跳过）');
    }
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    try { proc.kill(); } catch { /* 忽略 */ }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${'='.repeat(46)}`);
  console.log(`结果：${results.length - failed.length} / ${results.length} 项通过`);
  if (failed.length) {
    console.log('失败项：');
    for (const f of failed) console.log(`  ✗ ${f.name} ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('测试脚本出错:', err.message);
  process.exitCode = 1;
});
