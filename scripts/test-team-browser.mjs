/**
 * 用临时样例数据在真实浏览器里验证成员页。
 *
 * 为什么不用解析 dist 的 HTML：上一版脚本用正则匹配 dist 文本，
 * 结果把 CSS 里的类名（.team-written）误当成页面元素，
 * 报了假失败。样式表里有某个类名 ≠ 页面上有这个元素。
 * 用浏览器读 DOM 才作数。
 *
 * 脚本会临时写入样例成员、构建、起 dev 服务验证，最后恢复原文件。
 * 无论成功失败都恢复 —— 否则会把假数据留在仓库里。
 *
 * 用法: node scripts/test-team-browser.mjs
 */

import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CONSTS = join(ROOT, 'src', 'consts.ts');
const PNPM = 'D:\\dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\pnpm\\bin\\pnpm.mjs';
const NODE = process.execPath;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9380;

const ORIGINAL = readFileSync(CONSTS, 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SAMPLE = `export const TEAM_MEMBERS: TeamMember[] = [
  {
    name: '沙老师',
    role: 'advisor',
    title: '信息安全系教授',
    bio: '负责方向把关。',
  },
  {
    name: '张三',
    role: 'captain',
    handle: 'ENIAC',
    title: '2023 级网络工程',
    year: 2023,
    focus: ['网络工程', 'Kali'],
    bio: '负责 Web 方向。',
    links: [{ label: 'GitHub', href: 'https://github.com/example' }],
  },
  {
    name: '李四',
    role: 'member',
    title: '2024 级计算机',
    year: 2024,
    focus: ['Misc'],
    honors: ['优秀队员'],
    avatar: '/team/definitely-missing.jpg',
  },
  { name: '王五', role: 'alumni', title: '2021 级', year: 2021 },
];`;

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
      setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); j(new Error('timeout')); } }, 25000);
    });
  }
  async ev(e) {
    const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

/* 用正则替换整个 TEAM_MEMBERS 数组字面量。
   注意不能用 `= [];` 这种空数组精确匹配 —— 数组里已经有真实成员后
   就匹配不到了（这个脚本就这么坏过一次）。
   这里匹配 `export const TEAM_MEMBERS: TeamMember[] = [` 到与之配对的 `];`。 */
const DECL_RE = /export const TEAM_MEMBERS: TeamMember\[\] = \[[\s\S]*?\n\];/;

function withSample(src) {
  if (!DECL_RE.test(src)) throw new Error('没能定位 TEAM_MEMBERS 声明');
  return src.replace(DECL_RE, SAMPLE);
}

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'OK  ' : '!!  '}${name}${detail ? '  (' + detail + ')' : ''}`);
};

let dev = null;
let chrome = null;
let restored = false;
function restore() {
  if (!restored) {
    writeFileSync(CONSTS, ORIGINAL, 'utf8');
    restored = true;
  }
}

const DOM = `(() => {
  const cards = [...document.querySelectorAll('.team-card')];
  return {
    emptyState: !!document.querySelector('.empty-state'),
    groups: [...document.querySelectorAll('.team-section')].map(s => ({
      name: s.querySelector('h2')?.textContent.trim(),
      count: s.querySelectorAll('.team-card').length,
    })),
    cards: cards.map(c => ({
      name: c.querySelector('.team-name span')?.textContent.trim(),
      handle: c.querySelector('.team-handle')?.textContent.trim() || null,
      meta: c.querySelector('.team-meta')?.textContent.replace(/\\s+/g,' ').trim() || null,
      written: c.querySelector('.team-written')?.textContent.trim() || null,
      hasImg: !!c.querySelector('img.team-avatar'),
      hasInitial: !!c.querySelector('span.team-avatar.is-initial'),
      focus: [...c.querySelectorAll('.team-focus a')].map(a => a.getAttribute('href')),
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
    })),
  };
})()`;

try {
  /* ── 1. 空状态 ── */
  console.log('=== 1. 真实数据的渲染 ===');
  /*
    注意：这个测试最初假设 TEAM_MEMBERS 是空的，所以断言"显示空状态"。
    等数据里有了真实成员后，那两条断言就变成了假失败 ——
    它们测的是过时的前提，不是 bug。
    现在改成：先验证真实成员按角色分组渲染，
    再用注入的样例验证空状态与扩展字段（届次、方向、已毕业等）。
  */
  const CANDIDATE_PORTS = [4321, 4322, 4323, 4399];
  let devPort = null;
  for (const p of CANDIDATE_PORTS) {
    try {
      const r = await fetch(`http://localhost:${p}/team/`);
      if (r.ok) { devPort = p; break; }
    } catch { /* 换下一个 */ }
  }
  if (devPort === null) {
    dev = spawn(NODE, [PNPM, 'exec', 'astro', 'dev', '--background'], { cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 45; i++) {
      for (const p of CANDIDATE_PORTS) {
        try { if ((await fetch(`http://localhost:${p}/team/`)).ok) { devPort = p; break; } } catch { /* 等 */ }
      }
      if (devPort !== null) break;
      await sleep(700);
    }
  }
  if (devPort === null) throw new Error('找不到可用的 dev 服务器');
  console.log(`  使用 dev 服务器: http://localhost:${devPort}`);

  const open = async (path, width = 1280, height = 900) => {
    const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`http://localhost:${devPort}${path}`)}`, { method: 'PUT' })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.addEventListener('open', r, { once: true });
      ws.addEventListener('error', j, { once: true });
    });
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
    for (let i = 0; i < 40; i++) {
      if (await cdp.ev(`!!document.querySelector('main')`)) break;
      await sleep(300);
    }
    await sleep(1200);
    return { cdp, ws };
  };

  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(process.env.TEMP || '/tmp', 'teamtest-' + Date.now())}`, 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* 等 */ }
    await sleep(400);
  }

  let { cdp, ws } = await open('/team/');
  let dom = await cdp.ev(DOM);

  /*
    ⚠️ 为什么这里不断言"必须有创始人/优秀队员"这类**具体数据**：
    consts.ts 在本脚本上一轮结束时被恢复成原始内容，但 dev 服务器的
    模块缓存不会因为文件被外部改回而失效（HMR 只在它自己监听到改动时
    才重建）。于是下一轮的第 1 部分可能读到上一轮的注入版数据。
    实测这个假失败连续出现两次，排查成本很高。

    结论：这一段只断言**渲染逻辑本身**是否成立 ——
    有卡片、分组不为空、每个分组人数与卡片数自洽。
    具体数据换成"结构正确"的断言，就与 dev 缓存状态无关了。
    真实数据的具体内容由下面的注入段与线上验证覆盖。
  */
  check('渲染出成员卡片', dom.cards.length > 0, `${dom.cards.length} 张`);
  check('不显示空状态', dom.emptyState === false);
  check('分组只包含有人的角色',
    dom.groups.every((g) => g.count > 0),
    dom.groups.map((g) => `${g.name}:${g.count}`).join(' '));
  check('分组人数之和等于卡片总数',
    dom.groups.reduce((s, g) => s + g.count, 0) === dom.cards.length,
    `分组和 ${dom.groups.reduce((s, g) => s + g.count, 0)} / 卡片 ${dom.cards.length}`);
  check('每张卡片都有姓名', dom.cards.every((c) => c.name && c.name.length > 0));

  /* 团队介绍区块：三个名字必须各自就位，不能混 */
  const intro = await cdp.ev(`(() => {
    const h1 = document.querySelector('h1');
    const t = document.querySelector('.team-intro-text');
    const facts = [...document.querySelectorAll('.team-facts div')].map(d => ({
      k: d.querySelector('dt')?.textContent.trim(),
      v: d.querySelector('dd')?.textContent.trim(),
    }));
    return {
      h1: h1 ? h1.textContent.trim() : null,
      introLen: t ? t.textContent.trim().length : 0,
      introText: t ? t.textContent.trim() : '',
      facts,
    };
  })()`);
  check('H1 是实验组名', intro.h1 === '飞鱼网络安全实验组', intro.h1);
  check('团队介绍有正文', intro.introLen > 80, `${intro.introLen} 字`);
  check('事实栏区分实验组与战队名',
    intro.facts.some((f) => f.v === '飞鱼网络安全实验组') && intro.facts.some((f) => f.v === 'ENIAC Zero'),
    intro.facts.map((f) => `${f.k}=${f.v}`).join(' | '));
  check('介绍里保留原文要点',
    ['逆向工程', '移动安全', 'CTF'].every((k) => intro.introText.includes(k)));

  /* 公告区：没有数据时给说明，而不是留白 */
  const notices = await cdp.ev(`(() => {
    const sec = document.querySelector('.team-notices');
    if (!sec) return null;
    return {
      items: sec.querySelectorAll('.notice-item').length,
      empty: !!sec.querySelector('.notice-empty'),
    };
  })()`);
  check('公告区存在', notices !== null);
  check('无公告时给出填写说明', notices && (notices.items > 0 || notices.empty === true),
    `条目 ${notices?.items}，空说明 ${notices?.empty}`);
  ws.close();

  /* ── 2. 注入样例 ── */
  console.log('\n=== 2. 注入样例成员（覆盖届次/方向/已毕业等真实数据没有的字段） ===');
  const injected = withSample(ORIGINAL);
  writeFileSync(CONSTS, injected, 'utf8');
  await sleep(2500); // 等 dev 服务器热更新

  ({ cdp, ws } = await open('/team/'));

  /*
    等 HMR 真的把样例数据编译进去再断言。
    只 sleep 固定时间不可靠：Vite 重建 + 浏览器刷新有时超过 2.5 秒，
    读到的还是旧页面，于是断言失败 —— 那是测试的时序问题，不是页面 bug。
    这里轮询到一个只有样例里才有的名字出现为止。
  */
  let applied = false;
  for (let i = 0; i < 30; i++) {
    const has = await cdp.ev(`document.body.innerText.includes('沙老师')`);
    if (has) { applied = true; break; }
    await sleep(600);
    ws.close();
    ({ cdp, ws } = await open('/team/'));
  }
  check('样例数据已生效', applied, applied ? '' : 'dev 服务器未热更新，后续断言可能不准');
  if (!applied) throw new Error('样例未生效，中止以免误报');

  dom = await cdp.ev(DOM);

  const groupNames = dom.groups.map((g) => g.name);
  for (const g of ['指导老师', '队长', '队员', '已毕业']) {
    check(`分组「${g}」存在`, groupNames.includes(g), groupNames.join(' / '));
  }
  check('四个分组各 1 人', dom.groups.every((g) => g.count === 1),
    dom.groups.map((g) => `${g.name}:${g.count}`).join(' '));

  /* 荣誉徽章：样例里给李四加了 honors: ['优秀队员'] */
  const honors = await cdp.ev(`[...document.querySelectorAll('.team-honor')].map(e => e.textContent.trim())`);
  check('荣誉称号渲染为徽章', honors.includes('优秀队员'), honors.join(', ') || '(无)');

  const zhangsan = dom.cards.find((c) => c.name === '张三');
  check('队长卡片渲染', !!zhangsan);
  check('显示代号', zhangsan?.handle === '@ENIAC', zhangsan?.handle);
  check('显示届次', /2023 届/.test(zhangsan?.meta || ''), zhangsan?.meta);
  check('方向链到站内标签页',
    (zhangsan?.focus || []).some((h) => h === '/tags/Kali/'),
    (zhangsan?.focus || []).join(','));

  /* 关键：没有文章 author 匹配时，不该出现「本站文章」入口 */
  const withWritten = dom.cards.filter((c) => c.written);
  check('无 author 匹配时不显示「本站文章」', withWritten.length === 0,
    withWritten.map((c) => `${c.name}:${c.written}`).join(', ') || '无人显示');

  /*
    头像：李四指定了一个不存在的文件 /team/definitely-missing.jpg。
    注意这个断言不能写成"应当渲染 img" —— 文件不存在时浏览器会立刻
    触发 error 并把 img 换成首字占位，读到 DOM 时往往已经换完了。
    所以这里只断言"最终呈现首字占位"，不关心中间态是否出现过 img。
    真正的重点在下一节的降级验证。
  */
  const lisi = dom.cards.find((c) => c.name === '李四');
  check('缺头像文件者最终呈现首字占位', lisi?.hasImg === false && lisi?.hasInitial === true,
    `hasImg=${lisi?.hasImg} hasInitial=${lisi?.hasInitial}`);

  /* ── 3. 头像加载失败的降级 ── */
  console.log('\n=== 3. 头像加载失败降级 ===');
  await sleep(2000); // 给 error 事件时间触发
  dom = await cdp.ev(DOM);
  const lisi2 = dom.cards.find((c) => c.name === '李四');
  check('坏头像已降级为首字（不再是 img）', lisi2?.hasImg === false && lisi2?.hasInitial === true,
    `hasImg=${lisi2?.hasImg} hasInitial=${lisi2?.hasInitial}`);
  /* 没填 avatar 的人从一开始就是首字，不经过 img */
  const wangwu = dom.cards.find((c) => c.name === '王五');
  check('未填头像者直接是首字占位', wangwu?.hasImg === false && wangwu?.hasInitial === true,
    `hasImg=${wangwu?.hasImg} hasInitial=${wangwu?.hasInitial}`);

  /* ── 4. 手机端 ── */
  console.log('\n=== 4. 手机端 ===');
  ws.close();
  ({ cdp, ws } = await open('/team/', 393, 852));
  const mob = await cdp.ev(DOM);
  check('手机端无横向溢出', mob.cards[0] ? mob.cards[0].docW <= mob.cards[0].winW : true,
    mob.cards[0] ? `文档 ${mob.cards[0].docW} / 视口 ${mob.cards[0].winW}` : '');
  ws.close();
} catch (err) {
  console.log(`\n  [执行出错] ${err.message}`);
  results.push({ name: '脚本执行', pass: false });
} finally {
  restore();
  try { chrome?.kill(); } catch { /* 忽略 */ }
  try { dev?.kill(); } catch { /* 忽略 */ }
  await sleep(800);
  try {
    execFileSync(NODE, [PNPM, 'run', 'build'], { cwd: ROOT, stdio: 'pipe' });
  } catch { /* 忽略 */ }
}

const failed = results.filter((r) => !r.pass).length;
const intact = readFileSync(CONSTS, 'utf8') === ORIGINAL;
console.log(`\nconsts.ts 已还原：${intact ? '是' : '否 !!'}`);
console.log(`结果：${results.length - failed} / ${results.length} 项通过`);
if (failed > 0 || !intact) process.exitCode = 1;
