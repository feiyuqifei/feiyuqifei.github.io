/**
 * 文章与页面文案的风格自检：量化那些"读起来像 AI 写的"特征。
 *
 * 为什么需要它：
 *   "AI 味"的感觉很主观，但它其实来自几个可量化的习惯：
 *   破折号密度、加粗密度、整齐的列表结构、固定的收尾套路等。
 *   先量出来，才知道该改哪里，改完也能验证有没有真的改善。
 *
 * 检查范围包含两类：
 *   1. src/content/posts/*.md|mdx  —— 文章（去掉 frontmatter 与代码块）
 *   2. src/pages/*.astro           —— 页面里用户可见的文案
 *      （只统计作为文本出现的部分，代码注释里的破折号不算）
 *
 * 用法: node scripts/check-style.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const POSTS = join(ROOT, 'src', 'content', 'posts');
const PAGES = join(ROOT, 'src', 'pages');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/** 去掉 frontmatter 和代码块，只留正文 */
function body(text) {
  let t = text.replace(/^---[\s\S]*?---\s*/, '');
  t = t.replace(/```[\s\S]*?```/g, '');
  return t;
}

/** 中文文章里的各种"味道"指标 */
function analyze(text) {
  const b = body(text);
  const cjk = (b.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const lines = b.split(/\r?\n/);

  // 全角破折号 ——（AI 写作的重灾区）
  const emDash = (b.match(/——/g) ?? []).length;
  // 加粗
  const bold = (b.match(/\*\*[^*]+\*\*/g) ?? []).length;
  // 表格行
  const tableRows = lines.filter((l) => /^\s*\|/.test(l)).length;
  // 列表项
  const listItems = lines.filter((l) => /^\s*[-*]\s|^\s*\d+\.\s/.test(l)).length;
  // 引用块
  const quotes = lines.filter((l) => /^\s*>/.test(l)).length;
  // 二级标题
  const h2 = lines.filter((l) => /^##\s/.test(l)).length;
  // 段落（连续非空、非标题、非列表、非表格、非代码）
  const paras = b
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(
      (p) =>
        p &&
        !p.startsWith('#') &&
        !p.startsWith('|') &&
        !p.startsWith('-') &&
        !p.startsWith('>') &&
        !/^\d+\./.test(p) &&
        !p.startsWith('```')
    );
  const paraLens = paras.map((p) => (p.match(/[\u4e00-\u9fff]/g) ?? []).length);

  // 常见 AI 套话
  const cliches = [
    '不是.{1,20}而是',
    '值得注意的是',
    '总而言之',
    '综上所述',
    '换句话说',
    '一言以蔽之',
    '换句话说',
    '让我们',
    '本文将',
    '这篇讲',
    '这篇写',
    '需要强调',
    '非常重要',
    '至关重要',
    '在这个',
    '首先.{0,10}其次',
    '总之一句话',
    '核心在于',
    '关键在于',
    '本质上',
    '归根结底',
  ];
  const clicheCounts = {};
  for (const c of cliches) {
    const n = (b.match(new RegExp(c, 'g')) ?? []).length;
    if (n > 0) clicheCounts[c] = n;
  }

  // 段落长度变异系数（人写的东西长短句交错，AI 输出更均匀）
  const avg = paraLens.reduce((a, x) => a + x, 0) / (paraLens.length || 1);
  const variance =
    paraLens.reduce((a, x) => a + (x - avg) ** 2, 0) / (paraLens.length || 1);
  const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;

  // 收尾是否为"总结式"标题
  const lastH2 = [...lines].reverse().find((l) => /^##\s/.test(l)) ?? '';

  return {
    cjk,
    emDash,
    emDashPer1k: cjk > 0 ? (emDash / cjk) * 1000 : 0,
    bold,
    boldPer1k: cjk > 0 ? (bold / cjk) * 1000 : 0,
    tableRows,
    listItems,
    quotes,
    h2,
    paras: paras.length,
    avgPara: Math.round(avg),
    cv: Number(cv.toFixed(2)),
    cliches: clicheCounts,
    lastH2: lastH2.replace(/^##\s*/, '').trim(),
  };
}

/**
 * 从 .astro 页面里抽出用户可见的文案。
 *
 * 只取两处：
 *   1. 标签之间的文本（>文字<）
 *   2. 双引号属性值里的中文（title="..."、description="..."）
 * 刻意**不统计** {/ * ... * /} 注释和 // 注释里的破折号 ——
 * 代码注释不是给读者看的，算进来会误报。
 */
function astroVisibleText(src) {
  // 去掉 JS/JSX 块注释与行注释
  let t = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
  t = t.replace(/\/\*[\s\S]*?\*\//g, ' ');
  t = t.replace(/^\s*\/\/.*$/gm, ' ');
  // 去掉 frontmatter（--- 之间）
  t = t.replace(/^---[\s\S]*?---/, ' ');
  // 只保留含中文的文本片段
  const texts = [];
  for (const m of t.matchAll(/>([^<>{}]+)</g)) {
    if (/[\u4e00-\u9fff]/.test(m[1])) texts.push(m[1]);
  }
  for (const m of t.matchAll(/["']([^"']*[\u4e00-\u9fff][^"']*)["']/g)) {
    texts.push(m[1]);
  }
  return texts.join('\n');
}

const files = walk(POSTS).filter((f) => !f.endsWith('about.md'));
const rows = files.map((f) => ({
  name: f.replace(POSTS + '\\', '').replace(/\\/g, '/').replace(/\.(md|mdx)$/, ''),
  ...analyze(readFileSync(f, 'utf8')),
}));

// 页面文案也一起检查 —— 之前只扫 posts/ 漏掉了 videos.astro 这类页面
const pageFiles = readdirSync(PAGES).filter((f) => f.endsWith('.astro'));
for (const f of pageFiles) {
  const visible = astroVisibleText(readFileSync(join(PAGES, f), 'utf8'));
  if (!visible.trim()) continue;
  rows.push({ name: `(页面) ${f}`, ...analyze(visible) });
}

// 输出
const pad = (s, n) => String(s).padEnd(n);
console.log('\n【每千中文字符的"味道"密度】\n');
console.log(
  pad('文章', 30) + pad('字数', 6) + pad('破折号', 8) + pad('加粗', 6) + pad('表格行', 8) + pad('列表项', 8) + pad('段落数', 8) + pad('段长CV', 8) + '收尾标题'
);
console.log('-'.repeat(120));
for (const r of rows.sort((a, b) => b.emDashPer1k - a.emDashPer1k)) {
  console.log(
    pad(r.name, 30) +
      pad(r.cjk, 6) +
      pad(`${r.emDash}(${r.emDashPer1k.toFixed(1)})`, 8) +
      pad(`${r.bold}(${r.boldPer1k.toFixed(1)})`, 6) +
      pad(r.tableRows, 8) +
      pad(r.listItems, 8) +
      pad(r.paras, 8) +
      pad(r.cv, 8) +
      r.lastH2
  );
}

// 汇总
const sum = rows.reduce(
  (a, r) => ({
    cjk: a.cjk + r.cjk,
    emDash: a.emDash + r.emDash,
    bold: a.bold + r.bold,
    table: a.table + r.tableRows,
  }),
  { cjk: 0, emDash: 0, bold: 0, table: 0 }
);
console.log('\n【全站汇总】');
console.log(`  中文字符       ${sum.cjk}`);
console.log(`  破折号 ——      ${sum.emDash}   密度 ${((sum.emDash / sum.cjk) * 1000).toFixed(1)} /千字`);
console.log(`  加粗 **        ${sum.bold}   密度 ${((sum.bold / sum.cjk) * 1000).toFixed(1)} /千字`);
console.log(`  表格行         ${sum.table}`);

// 经验阈值判断
console.log('\n【经验阈值提示】');
const emPer1k = (sum.emDash / sum.cjk) * 1000;
const boldPer1k = (sum.bold / sum.cjk) * 1000;
console.log(
  `  破折号密度 ${emPer1k.toFixed(1)}/千字 —— ${
    emPer1k > 3 ? '偏高（人类技术写作通常 < 1.5）' : '可接受'
  }`
);
console.log(
  `  加粗密度   ${boldPer1k.toFixed(1)}/千字 —— ${
    boldPer1k > 3 ? '偏高（通篇加粗是典型 AI 特征）' : '可接受'
  }`
);
const summaryEnd = rows.filter((r) =>
  /总结|小结|最后|写在最后|回到开头|收尾|结语/.test(r.lastH2)
).length;
console.log(
  `  以"总结式标题"收尾的文章 ${summaryEnd} / ${rows.length} —— ${
    summaryEnd > rows.length * 0.6 ? '套路化（每篇都一样就假）' : '正常'
  }`
);

// 套话统计
const allCliches = {};
for (const r of rows) {
  for (const [k, v] of Object.entries(r.cliches)) {
    allCliches[k] = (allCliches[k] ?? 0) + v;
  }
}
const top = Object.entries(allCliches).sort((a, b) => b[1] - a[1]);
if (top.length) {
  console.log('\n【高频套话】');
  for (const [k, v] of top) console.log(`  ${k}  ×${v}`);
}
