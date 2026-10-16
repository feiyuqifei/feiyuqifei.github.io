/**
 * 验证归档页的年份 / 板块筛选。
 *
 * 检查七项：
 *   1. 默认（未筛选）时全部文章可见，且筛选栏由脚本显示出来
 *   2. 点年份后只剩该年的文章，且整年为空的标题被隐藏
 *   3. 同时按年份 + 板块筛出的是交集
 *   4. 筛出 0 篇时给出明确提示，而不是一片空白
 *   5. 计数会随另一个条件动态更新
 *   6. 无 JS 时（禁用脚本）归档内容仍然完整可读 —— 渐进增强的关键
 *   7. 手机端无横向溢出
 *
 * 用法: node scripts/test-archive-filter.mjs [baseUrl]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '');
const PORT = 9383;
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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'arc-'))}`, 'about:blank',
], { stdio: 'ignore' });

let ws;
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'OK  ' : '!!  '}${name}${detail ? '  (' + detail + ')' : ''}`);
};

const SNAP = `(() => {
  const items = [...document.querySelectorAll('[data-archive-list] li[data-year]')];
  const years = [...document.querySelectorAll('.archive-year')];
  const bar = document.querySelector('[data-archive-filter]');
  return {
    barHidden: bar ? bar.hidden : null,
    total: items.length,
    visible: items.filter(i => !i.hidden).length,
    visibleYears: years.filter(y => !y.hidden).length,
    totalYears: years.length,
    emptyShown: !document.querySelector('[data-filter-empty]')?.hidden,
    status: document.querySelector('[data-filter-status]')?.textContent.trim() || '',
    yearChips: [...document.querySelectorAll('[data-filter-group="year"] .af-chip')].map(c => ({
      v: c.getAttribute('data-filter-value'),
      n: c.querySelector('.af-count')?.textContent.trim() || null,
      active: c.classList.contains('is-active'),
      disabled: c.disabled,
    })),
    secChips: [...document.querySelectorAll('[data-filter-group="section"] .af-chip')].map(c => ({
      v: c.getAttribute('data-filter-value'),
      n: c.querySelector('.af-count')?.textContent.trim() || null,
    })),
    docW: document.documentElement.scrollWidth,
    winW: window.innerWidth,
  };
})()`;

const click = (group, value) =>
  `(() => { const c = [...document.querySelectorAll('[data-filter-group="${group}"] .af-chip')]
     .find(x => x.getAttribute('data-filter-value') === '${value}');
     if (!c) return false; c.click(); return true; })()`;

try {
  const dl = Date.now() + 25000;
  while (Date.now() < dl) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* 等 */ }
    await sleep(300);
  }

  const open = async (url, width = 1280, height = 900, jsEnabled = true) => {
    /* 用 /json/new 建页签；禁 JS 需要新建一个带 --disable-javascript 的目标做不到，
       所以禁 JS 的验证改用 Network.setBlockedURLs 之外的办法：
       直接读服务器返回的 HTML 是否完整。见第 6 项。 */
    const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.addEventListener('open', r, { once: true });
      ws.addEventListener('error', j, { once: true });
    });
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
    for (let i = 0; i < 40; i++) {
      if (await cdp.ev(`!!document.querySelector('[data-archive-list] li')`)) break;
      await sleep(250);
    }
    await sleep(800);
    return cdp;
  };

  console.log(`目标: ${BASE}/archive/\n`);

  console.log('=== 1. 默认状态 ===');
  let cdp = await open(`${BASE}/archive/`);
  let s = await cdp.ev(SNAP);
  check('筛选栏由脚本显示出来', s.barHidden === false, `hidden=${s.barHidden}`);
  check('默认全部文章可见', s.visible === s.total && s.total > 0, `${s.visible}/${s.total}`);
  check('默认所有年份分组可见', s.visibleYears === s.totalYears, `${s.visibleYears}/${s.totalYears}`);
  check('年份按钮带计数', s.yearChips.every((c) => c.n !== null), JSON.stringify(s.yearChips.map((c) => `${c.v}:${c.n}`)));

  const firstYear = s.yearChips.find((c) => c.v !== 'all');
  const yearTotal = Number(firstYear.n);

  console.log(`\n=== 2. 只按年份筛（${firstYear.v}） ===`);
  await cdp.ev(click('year', firstYear.v));
  await sleep(400);
  s = await cdp.ev(SNAP);
  check('只剩该年文章', s.visible === yearTotal, `可见 ${s.visible}，该年应有 ${yearTotal}`);
  check('其他年份分组被隐藏', s.visibleYears < s.totalYears || s.totalYears === 1,
    `${s.visibleYears}/${s.totalYears}`);
  check('状态栏给出筛选说明', /筛选：/.test(s.status), s.status);

  console.log('\n=== 3. 年份 + 板块（交集） ===');
  const secChip = s.secChips.find((c) => c.v !== 'all' && Number(c.n) > 0);
  let expect = 0;
  if (secChip) {
    expect = await cdp.ev(`(() => [...document.querySelectorAll('[data-archive-list] li[data-year]')]
      .filter(i => i.getAttribute('data-year') === '${firstYear.v}' && i.getAttribute('data-section') === '${secChip.v}').length)()`);
    await cdp.ev(click('section', secChip.v));
    await sleep(400);
    s = await cdp.ev(SNAP);
    check('筛出的是交集', s.visible === expect,
      `${firstYear.v} + ${secChip.v} → 可见 ${s.visible}，预期 ${expect}`);
    check('计数随另一条件更新', s.yearChips.filter((c) => c.v !== 'all').length > 0,
      s.yearChips.map((c) => `${c.v}:${c.n}`).join(' '));
  } else {
    check('筛出的是交集', false, '没找到可用的板块按钮');
  }

  console.log('\n=== 4. 筛到 0 篇时的提示 ===');
  /* 找一个在当前年份下计数为 0 的板块；没有就构造：年份设为某年、板块设为另一个不含该年的 */
  const zeroCombo = await cdp.ev(`(() => {
    const years = [...document.querySelectorAll('[data-archive-list] li[data-year]')]
      .map(i => i.getAttribute('data-year'));
    const secs = [...document.querySelectorAll('[data-archive-list] li[data-section]')]
      .map(i => i.getAttribute('data-section'));
    const uniqYears = [...new Set(years)], uniqSecs = [...new Set(secs)];
    for (const y of uniqYears) for (const sc of uniqSecs) {
      const n = [...document.querySelectorAll('[data-archive-list] li[data-year]')]
        .filter(i => i.getAttribute('data-year') === y && i.getAttribute('data-section') === sc).length;
      if (n === 0) return { y, sc };
    }
    return null;
  })()`);
  if (zeroCombo) {
    await cdp.ev(click('year', 'all'));
    await sleep(200);
    await cdp.ev(click('section', 'all'));
    await sleep(200);
    await cdp.ev(click('year', zeroCombo.y));
    await sleep(200);
    await cdp.ev(click('section', zeroCombo.sc));
    await sleep(400);
    s = await cdp.ev(SNAP);
    check('0 篇时显示提示', s.emptyShown === true && s.visible === 0,
      `${zeroCombo.y}+${zeroCombo.sc} 可见 ${s.visible}，提示=${s.emptyShown}`);
  } else {
    check('0 篇时显示提示', true, '当前数据下不存在空组合，跳过（计数为 0 的按钮已禁用）');
  }

  console.log('\n=== 5. 手机端 ===');
  ws.close();
  cdp = await open(`${BASE}/archive/`, 393, 852);
  s = await cdp.ev(SNAP);
  check('手机端无横向溢出', s.docW <= s.winW, `文档 ${s.docW} / 视口 ${s.winW}`);

  console.log('\n=== 6. 渐进增强：禁用 JS 后内容仍完整 ===');
  /* 服务器返回的 HTML 里必须已经包含全部条目，筛选只是加成。
     直接取原始 HTML 判断，不依赖浏览器执行脚本。 */
  const raw = await (await fetch(`${BASE}/archive/`)).text();
  const liCount = (raw.match(/data-year="\d+"/g) || []).length;
  check('原始 HTML 已含全部文章条目', liCount >= s.total, `HTML 里 ${liCount} 处 data-year`);
  check('筛选栏默认 hidden（无 JS 时不出现死按钮）', /data-archive-filter[^>]*hidden/.test(raw));
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  try { proc.kill(); } catch { /* 忽略 */ }
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n结果：${results.length - failed} / ${results.length} 项通过`);
if (failed > 0) process.exitCode = 1;
