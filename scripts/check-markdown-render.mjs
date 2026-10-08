/**
 * 扫描渲染后的文章正文，找出未被解析的 Markdown 强调标记。
 *
 * 为什么要专门做这件事：
 *   CommonMark 对强调的定界符有严格规则 —— 右定界符 `**` 后面
 *   不能紧跟标点。中文写作里 `**粗体**（补充说明）` 这种写法很自然，
 *   但解析会失败，页面上会直接显示两个星号。
 *   这类问题构建不会报错，只有肉眼看页面才能发现，所以需要脚本兜底。
 *
 * 用法: node scripts/check-markdown-render.mjs
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');

if (!existsSync(DIST)) {
  console.error('找不到 dist 目录，请先构建');
  process.exit(2);
}

/** 精确提取 <div class="prose" ...> 到其配对 </div> 之间的内容 */
function extractProse(html) {
  const start = html.indexOf('<div class="prose"');
  if (start === -1) return null;
  const openEnd = html.indexOf('>', start) + 1;
  let depth = 1;
  let i = openEnd;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) return html.slice(openEnd, nextClose);
      i = nextClose + 6;
    }
  }
  return html.slice(openEnd);
}

/** 找所有 HTML 文件 */
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = walk(DIST);
let problems = 0;
let checked = 0;

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const prose = extractProse(html);
  if (prose === null) continue;
  checked++;

  // 去掉代码块（里面出现星号是合法的）
  const noCode = prose.replace(/<pre[\s\S]*?<\/pre>/g, '');

  const findings = [];
  // 未解析的粗体：文中出现 ** 但没有对应的 <strong>
  const starCount = (noCode.match(/\*\*/g) ?? []).length;
  if (starCount > 0) {
    // 提取上下文方便定位
    const re = /.{0,40}\*\*.{0,40}/g;
    let m;
    while ((m = re.exec(noCode)) !== null) findings.push(m[0].replace(/<[^>]+>/g, ''));
  }

  const rel = file.replace(DIST + '\\', '').replace(/\\/g, '/');
  if (findings.length > 0) {
    console.log(`[FAIL] ${rel}  —— ${starCount} 处未解析的 **`);
    for (const f of findings.slice(0, 4)) console.log(`         …${f}…`);
    problems++;
  }
}

console.log(`\n检查了 ${checked} 个含正文的页面`);
if (problems === 0) {
  console.log('结果: 全部正文的 Markdown 强调标记都已正确解析');
} else {
  console.log(`结果: ${problems} 个页面存在未解析的标记`);
  process.exitCode = 1;
}
