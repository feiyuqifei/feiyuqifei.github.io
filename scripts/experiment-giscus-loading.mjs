/**
 * 受控实验：判断 Giscus 不加载是无头浏览器的假象，还是真问题。
 *
 * 做法：在同一个域名下放两个测试页，配置完全一样，
 * 唯一差别是 data-loading 属性：
 *   lazy.html —— 带 data-loading="lazy"（与站点当前配置一致）
 *   eager.html —— 不带该属性
 *
 * 两页都用真实站点的域名做 origin，且是本地 http 页面，
 * 其余变量一致。哪个能加载，就说明 data-loading="lazy" 是不是元凶。
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = join(tmpdir(), 'feiyu-giscus-exp');
mkdirSync(WORK, { recursive: true });

const REPO = 'feiyuqifei/feiyuqifei.github.io';
const REPO_ID = 'R_kgDOVBOcQw';
const CATEGORY = 'Announcements';
const CATEGORY_ID = 'DIC_kwDOVBOcQ84DHY3i';

/** 生成一个测试页。loading 为空时不输出该属性。 */
function page(title, loading, mapping) {
  const loadingAttr = loading ? ` data-loading="${loading}"` : '';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui;margin:0;padding:20px}
.giscus{margin-top:30px;border:2px dashed #999;padding:10px;min-height:260px}</style>
</head><body>
<h1>${title}</h1>
<p>配置与线上站点一致，唯一差别是 data-loading 属性。</p>
<div class="giscus"></div>
<script src="https://giscus.app/client.js"
  data-repo="${REPO}"
  data-repo-id="${REPO_ID}"
  data-category="${CATEGORY}"
  data-category-id="${CATEGORY_ID}"
  data-mapping="${mapping}"
  data-strict="0"
  data-reactions-enabled="1"
  data-emit-metadata="0"
  data-input-position="top"
  data-theme="preferred_color_scheme"
  data-lang="zh-CN"${loadingAttr}
  crossorigin="anonymous" async></script>
</body></html>`;
}

writeFileSync(join(WORK, 'lazy.html'), page('A: data-loading=lazy（线上配置）', 'lazy', 'pathname'), 'utf8');
writeFileSync(join(WORK, 'eager.html'), page('B: 无 data-loading 属性', '', 'pathname'), 'utf8');
writeFileSync(join(WORK, 'lazy-url.html'), page('C: lazy + mapping=url', 'lazy', 'url'), 'utf8');
console.log(`测试页已生成: ${WORK}`);

const PORT = 9350;
const CDP_PORT = 9351;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 用 Python 起静态服务（Node 的 http 也可以，但这里保持与项目其他脚本一致的做法） */
const PY = 'D:\\dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe';
const server = spawn(PY, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', WORK], {
  stdio: 'ignore',
});

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'feiyu-exp-'))}`, 'about:blank',
], { stdio: 'ignore' });

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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
}

async function testPage(cdp, file, label) {
  const reqs = [];
  const onMsg = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Network.responseReceived' && m.params.response.url.includes('giscus')) {
      reqs.push(`${m.params.response.status} ${m.params.response.url.slice(0, 70)}`);
    }
  };
  cdp.ws.addEventListener('message', onMsg);

  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${file}` });
  await sleep(7000);
  await cdp.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(4000);

  const info = await cdp.evaluate(`(() => {
    const f = document.querySelector('iframe.giscus-frame');
    if (!f) return { exists: false };
    let accessible = false;
    try { accessible = f.contentDocument !== null; } catch (e) { accessible = false; }
    return {
      exists: true,
      h: Math.round(f.getBoundingClientRect().height),
      contentDocumentAccessible: accessible,
      src: f.src.slice(0, 60),
    };
  })()`);

  cdp.ws.removeEventListener('message', onMsg);
  console.log(`\n--- ${label} ---`);
  console.log(`  iframe: ${JSON.stringify(info)}`);
  console.log(`  网络请求:`);
  if (reqs.length === 0) console.log('    （无 giscus 请求）');
  for (const r of reqs) console.log(`    ${r}`);

  const loaded = info.exists && info.contentDocumentAccessible === false;
  console.log(`  判定: ${loaded ? '内容已加载 ✓' : '未加载 ✗'}`);
  return loaded;
}

let ws;
try {
  let ok = false;
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok) { ok = true; break; } } catch { /* 等 */ }
    await sleep(300);
  }
  if (!ok) throw new Error('Chrome 未就绪');
  await sleep(800);

  const tab = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false,
  });

  const a = await testPage(cdp, 'lazy.html', 'A: data-loading=lazy（与线上一致）');
  const b = await testPage(cdp, 'eager.html', 'B: 无 data-loading');
  const c = await testPage(cdp, 'lazy-url.html', 'C: lazy + mapping=url');

  console.log('\n==== 结论 ====');
  console.log(`  A (lazy)      : ${a ? '加载成功' : '未加载'}`);
  console.log(`  B (eager)     : ${b ? '加载成功' : '未加载'}`);
  console.log(`  C (lazy+url)  : ${c ? '加载成功' : '未加载'}`);
  if (!a && b) {
    console.log('  -> data-loading="lazy" 是元凶：无头浏览器下懒加载不触发，');
    console.log('     应移除该属性或改用其他方式延迟加载。');
  } else if (a && b) {
    console.log('  -> 两种都正常，说明站点的问题另有原因（不是 lazy）。');
  } else if (!a && !b) {
    console.log('  -> 两种都不加载：可能是无头浏览器整体不支持 Giscus 的嵌入，');
    console.log('     需要你在真实浏览器里确认，不能据此判定站点有问题。');
  }
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { chrome.kill(); } catch { /* 忽略 */ }
  try { server.kill(); } catch { /* 忽略 */ }
}
