/**
 * 验证竞赛页的标签切换。
 *
 * 检查四项：
 *   1. 默认只显示「全年竞赛」，另一个面板是 hidden
 *   2. 点击「荣誉历史」能切换
 *   3. 键盘左右方向键能切换
 *   4. #records 深链能直接打开荣誉历史
 *
 * 用法: node scripts/test-competition-tabs.mjs [baseUrl]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '');
const PORT = 9364;
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

/** 读当前两个面板的显隐状态 */
const READ_STATE = `(() => {
  const y = document.getElementById('panel-yearly');
  const r = document.getElementById('panel-records');
  const ty = document.getElementById('tab-yearly');
  const tr = document.getElementById('tab-records');
  return {
    yearlyHidden: y ? y.hidden : null,
    recordsHidden: r ? r.hidden : null,
    yearlySelected: ty ? ty.getAttribute('aria-selected') : null,
    recordsSelected: tr ? tr.getAttribute('aria-selected') : null,
  };
})()`;

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'tabs-'))}`, 'about:blank',
], { stdio: 'ignore' });

let ws;
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'OK  ' : '!!  '}${name}${detail ? '  (' + detail + ')' : ''}`);
};

try {
  const dl = Date.now() + 25000;
  while (Date.now() < dl) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* 等 */ }
    await sleep(300);
  }

  const open = async (url) => {
    const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.addEventListener('open', r, { once: true });
      ws.addEventListener('error', j, { once: true });
    });
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    for (let i = 0; i < 40; i++) {
      const ok = await cdp.ev(`!!document.querySelector('.comp-tab')`);
      if (ok) break;
      await sleep(300);
    }
    await sleep(800);
    return cdp;
  };

  console.log(`目标: ${BASE}/competitions/\n`);

  /* 1. 默认状态 */
  console.log('=== 1. 默认状态 ===');
  let cdp = await open(`${BASE}/competitions/`);
  let s = await cdp.ev(READ_STATE);
  check('全年竞赛默认可见', s.yearlyHidden === false, `hidden=${s.yearlyHidden}`);
  check('荣誉历史默认隐藏', s.recordsHidden === true, `hidden=${s.recordsHidden}`);
  check('aria-selected 正确', s.yearlySelected === 'true' && s.recordsSelected === 'false');

  /* 2. 点击切换 */
  console.log('\n=== 2. 点击「荣誉历史」 ===');
  await cdp.ev(`document.getElementById('tab-records').click()`);
  await sleep(400);
  s = await cdp.ev(READ_STATE);
  check('荣誉历史已显示', s.recordsHidden === false, `hidden=${s.recordsHidden}`);
  check('全年竞赛已隐藏', s.yearlyHidden === true, `hidden=${s.yearlyHidden}`);
  check('aria-selected 已更新', s.recordsSelected === 'true' && s.yearlySelected === 'false');

  /* 3. 键盘导航 */
  console.log('\n=== 3. 键盘方向键 ===');
  await cdp.ev(`document.getElementById('tab-records').focus()`);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  await sleep(400);
  s = await cdp.ev(READ_STATE);
  check('左方向键切回全年竞赛', s.yearlyHidden === false && s.yearlySelected === 'true');
  const focused = await cdp.ev(`document.activeElement && document.activeElement.id`);
  check('焦点跟到新标签', focused === 'tab-yearly', `activeElement=${focused}`);

  /* 4. hash 深链 */
  console.log('\n=== 4. #records 深链 ===');
  ws.close();
  cdp = await open(`${BASE}/competitions/#records`);
  s = await cdp.ev(READ_STATE);
  check('深链直接打开荣誉历史', s.recordsHidden === false && s.recordsSelected === 'true',
    `recordsHidden=${s.recordsHidden} selected=${s.recordsSelected}`);

  /* 5. 荣誉历史面板的内容
     注意：这一段最初断言"显示空状态填写指引"，那是 COMPETITION_RECORDS
     还为空时写的。填入真实荣誉后该断言变成假失败（测的是过时前提）。
     现在改成：有数据就验证条目渲染，没数据才验证空状态指引。 */
  console.log('\n=== 5. 荣誉历史面板内容 ===');
  const panel = await cdp.ev(`(() => {
    const p = document.getElementById('panel-records');
    if (!p) return null;
    const items = p.querySelectorAll('.rec-item');
    /* 取字段的标签与值成对，便于断言"成绩"这类标签而不只是值。
       早先只取 dd 的值，标签从「名次」改成「成绩」时测试毫无反应。 */
    const fields = [...p.querySelectorAll('.comp-fields')].map(dl => {
      const out = {};
      const kids = [...dl.children];
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].tagName === 'DT') {
          const dd = kids[i + 1];
          if (dd && dd.tagName === 'DD') out[kids[i].textContent.trim()] = dd.textContent.trim();
        }
      }
      return out;
    });
    return {
      text: p.textContent.replace(/\\s+/g, ' ').trim(),
      items: items.length,
      years: [...p.querySelectorAll('.comp-section-title')].map(e => e.textContent.trim()),
      fields,
    };
  })()`);

  if (panel && panel.items > 0) {
    check('荣誉条目已渲染', panel.items > 0, `${panel.items} 条`);
    check('按年份分组', panel.years.length > 0, panel.years.join(' / '));
    check('字段用「成绩」而不是「名次」',
      panel.fields.some((f) => f['成绩']),
      panel.fields.map((f) => Object.keys(f).join('+')).join(' | '));
    check('参赛队字段能渲染多支队',
      panel.fields.some((f) => f['参赛队'] && f['参赛队'].includes('、')),
      panel.fields.filter((f) => f['参赛队']).map((f) => f['参赛队']).join(' / ') || '(无)');
  } else {
    const hasGuide = typeof panel?.text === 'string' && panel.text.includes('COMPETITION_RECORDS');
    check('无数据时给出填写指引', hasGuide,
      hasGuide ? '' : `实际内容: ${String(panel?.text).slice(0, 120)}`);
  }
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n结果：${results.length - failed} / ${results.length} 项通过`);
if (failed > 0) process.exitCode = 1;
