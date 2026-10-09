/**
 * 探针：Vercount 脚本到底有没有把数字填进去、行有没有显示。
 *
 * 症状：同一套代码，有时拿到数字（49088664）有时拿到占位符（—），
 * 且拿到数字的那次 hidden 仍为 true。需要看清每一步。
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET = process.argv[2] ?? 'http://localhost:4321/';
const PORT = 9357;
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
      setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); j(new Error('timeout ' + method)); } }, 20000);
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
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'vc-probe-'))}`, 'about:blank',
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
  await cdp.send('Network.enable');

  /* 收集控制台报错 */
  const errs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errs.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errs.push('EXC: ' + (m.params.exceptionDetails?.text ?? '').slice(0, 200));
    }
  });

  const t0 = Date.now();
  console.log('==== 时间线：每秒采样一次 ====');
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const s = await cdp.ev(`(() => {
      const line = document.querySelector('[data-site-stats]');
      const uv = document.getElementById('busuanzi_value_site_uv');
      const pv = document.getElementById('busuanzi_value_site_pv');
      let ls = null;
      try { ls = localStorage.getItem('visitorCountData'); } catch (e) { ls = 'ERR'; }
      return {
        uv: uv ? uv.textContent.trim() : 'NO-EL',
        pv: pv ? pv.textContent.trim() : 'NO-EL',
        hidden: line ? line.hidden : 'NO-LINE',
        ls: ls ? ls.slice(0, 70) : null,
        scriptLoaded: typeof window.vercount !== 'undefined' || !!document.querySelector('script[src*="vercount"]'),
      };
    })()`);
    console.log(`  t+${((Date.now() - t0) / 1000).toFixed(0)}s  uv=${String(s.uv).padEnd(12)} pv=${String(s.pv).padEnd(12)} hidden=${String(s.hidden).padEnd(6)} ls=${s.ls ?? 'null'}`);
  }

  console.log('\n==== 控制台报错 ====');
  if (errs.length === 0) console.log('  （无）');
  for (const e of errs.slice(0, 8)) console.log('  ' + e);

  console.log('\n==== 最终 DOM 状态 ====');
  const fin = await cdp.ev(`(() => {
    const line = document.querySelector('[data-site-stats]');
    const uv = document.getElementById('busuanzi_value_site_uv');
    return {
      lineHTML: line ? line.outerHTML.slice(0, 220) : null,
      lineHidden: line ? line.hidden : null,
      uvText: uv ? uv.textContent : null,
      uvChildNodes: uv ? Array.from(uv.childNodes).map(n => n.nodeType + ':' + (n.textContent || '').slice(0, 12)) : null,
      computedDisplay: line ? getComputedStyle(line).display : null,
    };
  })()`);
  console.log('  ' + JSON.stringify(fin, null, 2).replace(/\n/g, '\n  '));
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}
