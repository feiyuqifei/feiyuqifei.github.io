/**
 * 代码块「一键复制」按钮的端到端测试。
 *
 * 验证链路：
 *   1. 按钮是否由脚本动态注入到每个代码块（Markdown 源文件里没有按钮标记）
 *   2. 行内代码不应被误加上按钮（只处理 pre，不处理裸 code）
 *   3. 点击后剪贴板内容是否与代码块文本一致
 *   4. 按钮文案是否给出反馈并自动恢复
 *
 * 剪贴板验证通过 CDP 授予 clipboardReadWrite 权限后读取，
 * 不是只看按钮文案变了就当作成功。
 *
 * 用法: node scripts/test-copy-button.mjs http://localhost:4321
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4321';
const PAGE = `${BASE}/tech/http-request-smuggling/`;
const PORT = 9334;

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
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
    } catch { /* 继续等 */ }
    await sleep(300);
  }
  throw new Error('DevTools 端口未就绪');
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

/**
 * 等待页面真正就绪：URL 已是 http + readyState 完成 + 目标元素出现。
 * 远程站点加载慢，死等固定时长会得到假故障。
 */
async function waitForPageReady(cdp, selector, timeoutMs = 30000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await cdp.evaluate(`(() => ({
        readyState: document.readyState,
        href: location.href,
        found: !!document.querySelector(${JSON.stringify(selector)}),
      }))()`);
    } catch {
      // 导航期间执行上下文可能被销毁，忽略后重试
    }
    if (last && last.href.startsWith('http') && last.readyState === 'complete' && last.found) {
      return { ...last, elapsedMs: Date.now() - started };
    }
    await sleep(250);
  }
  return { ...(last ?? { readyState: '未知', href: '', found: false }), elapsedMs: Date.now() - started };
}

/**
 * 把元素滚入视野后返回其视口中心坐标。
 * 合成鼠标事件按视口坐标派发，元素在视口外就点不中，
 * 所以每次点击前都必须重新取坐标。
 */
async function centerOf(cdp, selector) {
  const pt = await cdp.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!pt || pt.y < 0 || pt.y > 1999) {
    throw new Error(`元素不在可点击视口内: ${selector} -> ${JSON.stringify(pt)}`);
  }
  return pt;
}

/** 派发真实鼠标点击（按下 + 抬起） */
async function clickReal(cdp, selector) {
  const pt = await centerOf(cdp, selector);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', {
      type, x: pt.x, y: pt.y, button: 'left', clickCount: 1,
    });
  }
  await sleep(600);
}

async function main() {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'feiyu-copy-'));
  console.log(`目标页: ${PAGE}\n`);

  const proc = spawn(
    chrome,
    [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let ws;
  try {
    await waitForDevtools(PORT);
    const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' });
    const tab = await res.json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    /*
     * 关键：headless Chrome 默认视口只有 600px 高，
     * 而代码块往往在页面下方（超出视口）。合成鼠标事件是按视口坐标派发的，
     * 落在视口外的点击不会命中目标元素 —— 表现为"按钮存在但点了没反应"。
     * 所以必须先给一个足够高的视口，再把元素滚入视野。
     */
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 2000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    // 允许无提示读写剪贴板，否则 navigator.clipboard 会被拒
    await cdp.send('Browser.grantPermissions', {
      origin: BASE,
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
    });

    /*
     * 必须轮询等待页面真正就绪，不能死等固定时间。
     * CDP 新建标签页初始是 about:blank，随后才异步导航；
     * 远程站点从发起导航到 DOM 可用可能要数秒。固定 sleep 会在文档还是空的时候
     * 就去查询，导致"按钮数量为 0"这类假故障。
     */
    const ready = await waitForPageReady(cdp, '.copy-btn');    console.log(`   页面就绪: ${ready.href}  (readyState=${ready.readyState}, 等待 ${ready.elapsedMs}ms)\n`);

    console.log('【1】按钮注入情况');
    const stats = await cdp.evaluate(`(() => {
      const wraps = document.querySelectorAll('.code-block');
      const btns  = document.querySelectorAll('.copy-btn');
      const pres  = document.querySelectorAll('.prose pre');
      const inline = document.querySelectorAll('.prose :not(pre) > code');
      return {
        preCount: pres.length,
        wrapCount: wraps.length,
        btnCount: btns.length,
        inlineCodeCount: inline.length,
        inlineHasButton: Array.from(inline).some((c) => c.parentElement?.querySelector('.copy-btn')),
        allPresWrapped: Array.from(pres).every((p) => p.parentElement?.classList.contains('code-block')),
      };
    })()`);
    console.log('   ', JSON.stringify(stats));
    check('页面确实有代码块', stats.preCount > 0, `${stats.preCount} 个 pre`);
    check('每个代码块都注入了复制按钮', stats.btnCount === stats.preCount, `${stats.btnCount}/${stats.preCount}`);
    check('每个 pre 都被包进 .code-block', stats.allPresWrapped === true);
    check('行内代码未被误加按钮', stats.inlineHasButton === false, `${stats.inlineCodeCount} 处行内代码`);

    console.log('\n【2】点击复制，校验剪贴板真实内容');
    // 取第一个代码块的纯文本作为期望值
    const expectedText = await cdp.evaluate(`document.querySelector('.code-block pre').innerText`);

    // 用真实鼠标事件点击第一个按钮（clickReal 会先滚入视野）
    await clickReal(cdp, '.copy-btn');

    const feedback = await cdp.evaluate(`(() => {
      const b = document.querySelector('.copy-btn');
      return { text: b.textContent, copiedClass: b.classList.contains('copied') };
    })()`);
    check('按钮给出成功反馈', feedback.text === '已复制', `文案 = "${feedback.text}"`);
    check('按钮被标记为已复制状态', feedback.copiedClass === true);

    const clip = await cdp.evaluate(`navigator.clipboard.readText().catch(e => 'ERR: ' + e.name)`);
    const same = typeof clip === 'string' && clip.trim() === String(expectedText).trim();
    check('剪贴板内容与代码块文本一致', same, same ? `${clip.length} 字符` : `期望 ${String(expectedText).length} 字符，实际 ${String(clip).length}${typeof clip === 'string' && clip.startsWith('ERR') ? ' (' + clip + ')' : ''}`);

    console.log('\n【3】反馈是否自动恢复');
    await sleep(1600);
    const restored = await cdp.evaluate(`document.querySelector('.copy-btn').textContent`);
    check('约 1.6 秒后文案恢复为「复制」', restored === '复制', `= "${restored}"`);

    console.log('\n【4】暗色模式下按钮仍可用');
    await cdp.evaluate(`document.documentElement.setAttribute('data-theme','dark')`);
    await sleep(250);
    await clickReal(cdp, '.copy-btn');
    const darkFeedback = await cdp.evaluate(`document.querySelector('.copy-btn').textContent`);
    check('暗色下点击同样生效', darkFeedback === '已复制', `文案 = "${darkFeedback}"`);
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    try { proc.kill(); } catch { /* 忽略 */ }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${'='.repeat(46)}`);
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
