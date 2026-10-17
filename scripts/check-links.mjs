/**
 * 扫描构建产物里的内部链接，找出指向不存在页面的死链。
 *
 * 为什么需要：站内的死链很难靠肉眼发现。
 *   - 视频区的标签如果没被任何文章用过，/tags/<tag>/ 就没有页面，
 *     实测已经出现过一次（视频用了「Linux」标签，线上 404）
 *   - 这类链接长得和正常链接一样，只有点下去才知道是 404
 *
 * 检查范围：
 *   只看以 / 开头的站内链接，跳过图片视频等静态资源、
 *   Pagefind 运行时目录、以及外链。
 *
 * 判定方式：
 *   /foo/     → dist/foo/index.html
 *   /foo.png  → dist/foo.png
 *   两者都不存在即视为死链。
 *
 * 用法: pnpm run build && node scripts/check-links.mjs
 * 退出码非 0 表示发现死链。
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');

if (!existsSync(DIST)) {
  console.error('找不到 dist 目录，请先构建：pnpm run build');
  process.exit(1);
}

/** 递归列出所有 html 文件 */
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** 跳过不需要检查的目标 */
const SKIP_EXT = /\.(png|jpe?g|gif|webp|svg|ico|mp4|webm|mp3|pdf|zip|xml|txt|webmanifest|json)$/i;
const SKIP_PREFIX = ['/pagefind/', '/rss.xml'];

let checked = 0;
const broken = new Map(); // 链接 -> 出现在哪些页面

for (const file of walk(DIST)) {
  const html = readFileSync(file, 'utf8');
  const page = file.replace(DIST, '').replace(/\\/g, '/') || '/';

  for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
    const href = m[1];
    if (SKIP_EXT.test(href)) continue;
    if (SKIP_PREFIX.some((p) => href.startsWith(p))) continue;

    checked += 1;

    /* 目录式路径 /foo/ → dist/foo/index.html；也接受 /foo 直接是文件 */
    const asIndex = join(DIST, href.replace(/\/$/, ''), 'index.html');
    const asFile = join(DIST, href);
    const exists =
      (existsSync(asIndex) && statSync(asIndex).isFile()) ||
      (existsSync(asFile) && statSync(asFile).isFile());

    if (!exists) {
      if (!broken.has(href)) broken.set(href, new Set());
      broken.get(href).add(page);
    }
  }
}

console.log(`\n检查了 ${checked} 个内部链接（${walk(DIST).length} 个页面）`);

if (broken.size === 0) {
  console.log('结果: 全部内部链接都有对应页面\n');
} else {
  console.log(`\n发现 ${broken.size} 个死链：`);
  for (const [href, pages] of broken) {
    const where = [...pages].slice(0, 3).join(', ');
    const more = pages.size > 3 ? ` 等 ${pages.size} 处` : '';
    console.log(`  ${href}`);
    console.log(`      出现在: ${where}${more}`);
  }
  console.log('\n常见原因：');
  console.log('  - 标签链接指向 /tags/<tag>/，但该标签没被任何文章用过（标签页只由文章生成）');
  console.log('  - 手写的站内链接路径写错，或对应文章被删除/改名为草稿\n');
  process.exit(1);
}
