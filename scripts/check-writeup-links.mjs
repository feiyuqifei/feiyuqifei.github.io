/**
 * 校验外部 writeup 链接是否可达。
 *
 * 为什么单独做：竞赛页现在会链到别人的博客（goodlunatic.github.io）。
 * 外链是别人维护的，随时可能改路径或删文章 —— 死链出现在页面上
 * 比没有链接更糟。所以对每条外链做一次 HEAD/GET 探测。
 *
 * 用法: node scripts/check-writeup-links.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', 'src', 'consts.ts');

const text = readFileSync(SRC, 'utf8');

/* 只取 COMPETITIONS 块，避免误抓 SOCIALS 等其他链接 */
const block = /export const COMPETITIONS[\s\S]*?\n\];/.exec(text)?.[0] ?? '';
if (!block) {
  console.error('未能定位 COMPETITIONS 块');
  process.exit(2);
}

/** 抓出所有 writeups 里的 url */
const urls = [];
const re = /writeups:\s*\[([\s\S]*?)\]/g;
let m;
while ((m = re.exec(block)) !== null) {
  const inner = m[1];
  const uRe = /url:\s*'([^']+)'/g;
  let u;
  while ((u = uRe.exec(inner)) !== null) urls.push(u[1]);
}

/* 同时抓 title 便于报告 */
const titles = [...block.matchAll(/title:\s*'([^']*Writeup[^']*)'/g)].map((x) => x[1]);

console.log(`从 consts.ts 提取到 ${urls.length} 条 writeup 链接\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0;
let bad = 0;

for (const url of urls) {
  let status = 0;
  let err = '';
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; link-checker)' },
    });
    status = res.status;
  } catch (e) {
    err = e.message;
  }

  const pass = status === 200;
  if (pass) ok++;
  else bad++;

  const label = url.replace('https://goodlunatic.github.io', '');
  console.log(`  ${pass ? '[OK]  ' : '[FAIL]'} ${String(status || err).padEnd(6)} ${label}`);

  /* 别把对方站点打挂，链接多时隔一下 */
  await sleep(400);
}

console.log(`\n${'='.repeat(52)}`);
console.log(`结果：${ok} / ${urls.length} 条可达${bad ? `，${bad} 条异常` : ''}`);
if (bad > 0) {
  console.log('\n异常链接需要处理：改路径、换来源，或直接删掉该条 ——');
  console.log('页面上留死链比不留链接更糟。');
  process.exitCode = 1;
}
