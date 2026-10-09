/**
 * 深入检查 Giscus iframe 内部到底渲染了什么。
 *
 * 为什么需要它：giscus 是跨域 iframe，普通页面脚本读不到它内部。
 * 外层能看到"iframe 存在且高度 154px"，但看不到里面是
 * "欢迎评论"、"未找到讨论"还是错误提示 —— 这三种情况的外观差别很大，
 * 必须进到 iframe 内部才能区分。
 *
 * 做法：开启 CDP 的 Target 自动发现，列出所有跨进程框架（OOPIF），
 * 找到 giscus 那个，附加进去后读它的 DOM 文本。
 *
 * 用法: node scripts/inspect-giscus-frame.mjs [文章页URL]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET = process.argv[2] ?? 'http://localhost:4321/tech/network-troubleshooting/';
const PORT = 9348;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

class Cdp {
  constructor(ws, label = 'main') {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.label = label;
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
  async evaluate(e) {
    const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
}

async function connect(wsUrl, label) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  return { cdp: new Cdp(ws, label), ws };
}

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'feiyu-frame-'))}`, 'about:blank',
], { stdio: 'ignore' });

let mainWs;
try {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* 等 */ }
    await sleep(300);
  }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(TARGET)}`, { method: 'PUT' })).json();
  const main = await connect(tab.webSocketDebuggerUrl, 'main');
  mainWs = main.ws;
  const cdp = main.cdp;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  /* 开启自动发现，跨域 iframe 会作为独立 target 出现 */
  await cdp.send('Target.setAutoAttach', {
    autoAttach: true, waitForDebuggerOnStart: false, flatten: true,
  });
  await sleep(3500);
  await cdp.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(5000);

  console.log('==== 全部 target 列表 ====');
  const { targetInfos } = await cdp.send('Target.getTargets');
  for (const t of targetInfos) {
    console.log(`  ${t.type.padEnd(12)} ${(t.title || '(无标题)').slice(0, 50).padEnd(52)} ${t.url.slice(0, 60)}`);
  }

  const giscusTarget = targetInfos.find((t) => t.url.includes('giscus.app'));
  if (!giscusTarget) {
    console.log('\n[FAIL] 没有找到 giscus.app 的 target —— iframe 可能没真正加载');
    process.exitCode = 1;
  } else {
    console.log(`\n==== 附加到 giscus iframe (${giscusTarget.targetId}) ====`);
    const { sessionId } = await cdp.send('Target.attachToTarget', {
      targetId: giscusTarget.targetId, flatten: true,
    });

    /* flatten 模式下，带 sessionId 的消息走同一个 WebSocket */
    const sendToSession = (method, params = {}) => {
      const id = ++cdp.id;
      return new Promise((res, rej) => {
        cdp.pending.set(id, { resolve: res, reject: rej });
        cdp.ws.send(JSON.stringify({ id, method, params, sessionId }));
        setTimeout(() => { if (cdp.pending.has(id)) { cdp.pending.delete(id); rej(new Error('超时 ' + method)); } }, 20000);
      });
    };

    await sendToSession('Runtime.enable');
    await sleep(1500);

    const inside = await sendToSession('Runtime.evaluate', {
      expression: `(() => {
        const body = document.body;
        return {
          title: document.title,
          url: location.href,
          readyState: document.readyState,
          textContent: (body ? body.innerText : '').replace(/\\s+/g, ' ').trim().slice(0, 400),
          hasTextarea: !!document.querySelector('textarea'),
          hasCommentBox: !!document.querySelector('.gsc-comment-box, .gsc-comment'),
          buttons: Array.from(document.querySelectorAll('button')).map(b => (b.innerText || '').trim()).filter(Boolean).slice(0, 8),
          links: Array.from(document.querySelectorAll('a')).map(a => (a.innerText || '').trim()).filter(Boolean).slice(0, 8),
          bodyHeight: body ? Math.round(body.getBoundingClientRect().height) : 0,
        };
      })()`,
      returnByValue: true,
    });

    const v = inside.result.value;
    console.log('\n==== iframe 内部实际内容 ====');
    console.log(`  标题      : ${v.title}`);
    console.log(`  URL       : ${v.url.slice(0, 100)}`);
    console.log(`  readyState: ${v.readyState}`);
    console.log(`  正文高度  : ${v.bodyHeight}px`);
    console.log(`  有输入框  : ${v.hasTextarea}`);
    console.log(`  有评论框  : ${v.hasCommentBox}`);
    console.log(`  按钮      : ${JSON.stringify(v.buttons)}`);
    console.log(`  链接      : ${JSON.stringify(v.links)}`);
    console.log(`  文本内容  : ${v.textContent || '(空)'}`);
  }
} finally {
  try { mainWs?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}
